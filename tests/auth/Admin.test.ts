import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { AdminVault, IERC20, IFluidLending, FluidSupply } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { getUSDC, fundAccountWithToken } from '../utils-stable';
import { log, deploy, getBaseSetup, calculateExpectedFee, executeAction } from '../utils';
import { tokenConfig } from '../constants';

describe('AdminVault', function () {
  let adminVault: AdminVault;
  let admin: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let snapshotId: string;
  let USDC: IERC20;
  let safeAddr: string;
  let fUSDC: IFluidLending;
  describe('Direct tests', function () {
    before(async () => {
      [admin, owner, alice, bob, carol] = await ethers.getSigners();

      adminVault = await deploy(
        'AdminVault',
        admin,
        [await admin.getAddress()],
        [await admin.getAddress()],
        0,
        await admin.getAddress()
      );
      // Fetch the USDC token
      USDC = await getUSDC();

      // Take local snapshot before running tests
      log('Taking local snapshot');
      snapshotId = await network.provider.send('evm_snapshot');
    });

    beforeEach(async () => {});

    afterEach(async () => {
      // Revert local snapshot after each test
      log('Reverting to local snapshot');
      await network.provider.send('evm_revert', [snapshotId]);

      // IMPORTANT: take a new snapshot, they can't be reused!
      snapshotId = await network.provider.send('evm_snapshot');
    });

    // tests that can be run directly on the contract
    // TODO: Change or remove now we're using AccessControl
    it.skip('should set owner correctly', async function () {
      await expect(
        adminVault.connect(alice).changeOwner(alice.address)
      ).to.be.revertedWithCustomError(adminVault, 'SenderNotOwner');

      await adminVault.connect(owner).changeOwner(alice.address);
      expect(await adminVault.owner()).to.equal(alice.address);
    });

    // TODO: Change or remove now we're using AccessControl
    it.skip('should set admin correctly', async function () {
      await expect(
        adminVault.connect(alice).changeAdmin(alice.address)
      ).to.be.revertedWithCustomError(adminVault, 'SenderNotAdmin');
      // try as owner
      await adminVault.connect(owner).changeAdmin(alice.address);
      expect(await adminVault.admin()).to.equal(alice.address);

      // try as admin
      await adminVault.connect(alice).changeAdmin(bob.address);
      expect(await adminVault.admin()).to.equal(bob.address);
    });

    // TODO: Update test to use AccessControl
    it.skip('should set fee recipient correctly', async function () {
      await expect(
        adminVault.connect(alice).setFeeRecipient(alice.address)
      ).to.be.revertedWithCustomError(adminVault, 'SenderNotOwner');

      await expect(
        adminVault.connect(owner).setFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(adminVault, 'InvalidRecipient');

      await adminVault.connect(owner).setFeeRecipient(alice.address);
      expect(await adminVault.feeRecipient()).to.equal(alice.address);
    });

    // TODO: Update test to use AccessControl
    it.skip('should set fee percentage correctly', async function () {
      await expect(adminVault.connect(alice).setFeeRange(100, 200)).to.be.revertedWithCustomError(
        adminVault,
        'SenderNotAdmin'
      );

      await expect(adminVault.connect(owner).setFeeRange(200, 100)).to.be.revertedWithCustomError(
        adminVault,
        'InvalidRange'
      );

      await adminVault.connect(owner).setFeeRange(100, 200);
      expect(await adminVault.minFeeBasis()).to.equal(100);
      expect(await adminVault.maxFeeBasis()).to.equal(200);
    });
    it('should initialize fee timestamp correctly', async function () {
      await adminVault.grantRole(await adminVault.VAULT_ROLE(), alice.address);
      const tx = await adminVault.connect(owner).initializeFeeTimestamp(alice.address);

      const receipt = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp;
      expect(await adminVault.lastFeeTimestamp(owner.address, alice.address)).to.equal(
        blockTimestamp
      );
    });

    it('should update fee timestamp correctly', async function () {
      await adminVault.grantRole(await adminVault.VAULT_ROLE(), alice.address);
      await adminVault.connect(owner).initializeFeeTimestamp(alice.address);
      const tx = await adminVault.connect(owner).updateFeeTimestamp(alice.address);
      const receipt = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp;
      expect(await adminVault.lastFeeTimestamp(owner.address, alice.address)).to.equal(
        blockTimestamp
      );
    });
  });
  // tests that need to be run via inheritance
  // lets deploy an action contract and test via that
  describe('Indirect tests', function () {
    let signer: SignerWithAddress;
    let loggerAddress: string;
    let fUSDC: IFluidLending;
    let fluidSupplyContract: FluidSupply;
    let fluidSupplyAddress: string;
    before(async () => {
      [signer] = await ethers.getSigners();
      const baseSetup = await getBaseSetup(signer);
      if (!baseSetup) {
        throw new Error('Base setup not deployed');
      }
      safeAddr = (await baseSetup.safe.getAddress()) as string;
      adminVault = await baseSetup.adminVault;
      loggerAddress = (await baseSetup.logger.getAddress()) as string;
      // Fetch the USDC token
      USDC = await getUSDC();

      // Initialize FluidSupply and FluidWithdraw actions
      fluidSupplyContract = await deploy(
        'FluidSupply',
        signer,
        await adminVault.getAddress(),
        await baseSetup.contractRegistry.getAddress(),
        loggerAddress
      );
      fluidSupplyAddress = await fluidSupplyContract.getAddress();
      fUSDC = await ethers.getContractAt('IFluidLending', tokenConfig.fUSDC.address);
      await adminVault.grantRole(await adminVault.VAULT_ROLE(), await fUSDC.getAddress());
    });
    it('should calculate fee correctly for a given period', async function () {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);

      await fundAccountWithToken(safeAddr, token, amount);

      const feeRecipient = await adminVault.feeRecipient();
      const feeRecipientUSDCBalanceBefore = await USDC.balanceOf(feeRecipient);
      const feeRecipientfUSDCBalanceBefore = await fUSDC.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'FluidSupply',
        amount,
      });

      const fUSDCBalanceAfterSupply = await fUSDC.balanceOf(safeAddr);

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.fUSDC.address
      );
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel like you're Dr Emmett Brown
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      const withdrawTx = await executeAction({
        type: 'FluidSupply',
        token,
        feePercentage: 10,
        amount: '0',
      });

      const expectedFee = await calculateExpectedFee(
        supplyTx,
        withdrawTx,
        10,
        fUSDCBalanceAfterSupply
      );
      const expectedFeeRecipientBalance = feeRecipientfUSDCBalanceBefore + expectedFee;

      // don't take fees in the underlying asset
      expect(await USDC.balanceOf(feeRecipient)).to.equal(feeRecipientUSDCBalanceBefore);
      // take fees in the fToken
      expect(await fUSDC.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });

    it.skip('should recover ETH correctly', async function () {
      // We should consider removing the withdrawStuckFunds function
      // as it could pose a security risk to users funds
      // should it be executed using a delegate call on a safe
    });

    it.skip('should recover ERC20 tokens correctly', async function () {
      // We should consider removing the withdrawStuckFunds function
      // as it could pose a security risk to users funds
      // should it be executed using a delegate call on a safe
    });
  });
});
