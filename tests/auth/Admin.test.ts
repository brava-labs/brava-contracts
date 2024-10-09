import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { AdminVault, IERC20, IFluidLending, FluidSupply } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { getUSDC, fundAccountWithToken } from '../utils-stable';
import {
  log,
  deploy,
  getBaseSetup,
  calculateExpectedFee,
  executeAction,
  getRoleBytes,
  getRoleName,
  getBytes4,
} from '../utils';
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

  describe('Direct tests', function () {
    before(async () => {
      [admin, owner, alice, bob, carol] = await ethers.getSigners();

      const baseSetup = await getBaseSetup(admin);
      if (!baseSetup) {
        throw new Error('Base setup not deployed');
      }
      adminVault = await baseSetup.adminVault;

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

    describe('Role management', function () {
      it('should be able to propose a role', async function () {
        // alice should not be able to propose a role
        expect(
          adminVault.connect(alice).proposeRole(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to propose a role
        await adminVault.connect(admin).proposeRole(getRoleBytes('OWNER_ROLE'), alice.address);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.not.equal(0);
        this.test!.ctx!.proposed = true;
      });

      it('should be able to cancel a role proposal', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeRole(getRoleBytes('OWNER_ROLE'), alice.address);
        expect(
          adminVault.getRoleProposalTime(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.not.equal(0);

        // alice should not be able to cancel the role proposal
        await expect(
          adminVault.connect(alice).cancelRoleProposal(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        // admin should be able to cancel the role proposal
        await adminVault
          .connect(admin)
          .cancelRoleProposal(getRoleBytes('OWNER_ROLE'), alice.address);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.equal(0);
      });

      it('should be able to grant a role', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeRole(getRoleBytes('OWNER_ROLE'), alice.address);
        // alice should not be able to grant a role
        await expect(
          adminVault.connect(alice).grantRole(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to grant a role
        await adminVault.connect(admin).grantRole(getRoleBytes('OWNER_ROLE'), alice.address);
        expect(await adminVault.hasRole(getRoleBytes('OWNER_ROLE'), alice.address)).to.be.true;
        this.test!.ctx!.granted = true;
      });

      it('should not be able to grant a role if the delay is not passed', async function () {
        if (!this.test!.ctx!.granted) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposeRole(getRoleBytes('OWNER_ROLE'), alice.address);
        await expect(
          adminVault.connect(admin).grantRole(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');
      });

      it('should not be able to grant a role if the role is not proposed', async function () {
        if (!this.test!.ctx!.granted) this.skip();
        await expect(
          adminVault.connect(admin).grantRole(getRoleBytes('OWNER_ROLE'), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });

      it('should not be able to propose a role to the zero address', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await expect(
          adminVault.connect(admin).proposeRole(getRoleBytes('OWNER_ROLE'), ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });
    });

    describe('Fee recipient', function () {
      it('should be able to propose a fee recipient', async function () {
        // alice should not be able to propose a fee recipient
        await expect(
          adminVault.connect(alice).proposeFeeRecipient(alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to propose a fee recipient
        await adminVault.connect(admin).proposeFeeRecipient(alice.address);
        expect(await adminVault.feeRecipientProposal(alice.address)).to.not.equal(0);
        this.test!.ctx!.proposed = true;
      });

      it('should be able to cancel a fee recipient proposal', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeFeeRecipient(alice.address);
        expect(await adminVault.feeRecipientProposal(alice.address)).to.not.equal(0);
        // alice should not be able to cancel the fee recipient proposal
        await expect(
          adminVault.connect(alice).cancelFeeRecipientProposal(alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to cancel the fee recipient proposal
        await adminVault.connect(admin).cancelFeeRecipientProposal(alice.address);
        expect(await adminVault.feeRecipientProposal(alice.address)).to.equal(0);
      });

      it('should be able to set a fee recipient', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeFeeRecipient(alice.address);
        // alice should not be able to set a fee recipient
        await expect(
          adminVault.connect(alice).setFeeRecipient(alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to set a fee recipient
        await adminVault.connect(admin).setFeeRecipient(alice.address);
        expect(await adminVault.feeRecipient()).to.equal(alice.address);
        this.test!.ctx!.set = true;
      });

      it('should not be able to set a fee recipient if the delay is not passed', async function () {
        if (!this.test!.ctx!.set) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposeFeeRecipient(alice.address);
        await expect(
          adminVault.connect(admin).setFeeRecipient(alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');
      });

      it('should not be able to set a fee recipient if the fee recipient is not proposed', async function () {
        if (!this.test!.ctx!.set) this.skip();
        await expect(
          adminVault.connect(admin).setFeeRecipient(alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });

      it('should not be able to set a fee recipient if the fee recipient is the zero address', async function () {
        if (!this.test!.ctx!.set) this.skip();
        await expect(
          adminVault.connect(admin).setFeeRecipient(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });
    });

    describe('Pool management', function () {
      it('should be able to propose a pool', async function () {
        expect(await adminVault.getPoolProposalTime('Fluid', alice.address)).to.equal(0);
        // alice should not be able to propose a pool
        await expect(
          adminVault.connect(alice).proposePool('Fluid', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to propose a pool
        await adminVault.connect(admin).proposePool('Fluid', alice.address);
        expect(await adminVault.getPoolProposalTime('Fluid', alice.address)).to.not.equal(0);
        this.test!.ctx!.proposed = true;
      });

      it('should be able to cancel a pool proposal', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposePool('Fluid', alice.address);
        expect(await adminVault.getPoolProposalTime('Fluid', alice.address)).to.not.equal(0);
        // alice should not be able to cancel the pool proposal
        await expect(
          adminVault.connect(alice).cancelPoolProposal('Fluid', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to cancel the pool proposal
        await adminVault.connect(admin).cancelPoolProposal('Fluid', alice.address);
        expect(await adminVault.getPoolProposalTime('Fluid', alice.address)).to.equal(0);
      });

      it('should be able to add a pool', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposePool('Fluid', alice.address);
        // alice should not be able to add a pool
        await expect(
          adminVault.connect(alice).addPool('Fluid', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to add a pool
        await adminVault.connect(admin).addPool('Fluid', alice.address);
        expect(await adminVault.getPoolAddress('Fluid', getBytes4(alice.address))).to.equal(
          alice.address
        );
        this.test!.ctx!.added = true;
      });

      it('should not be able to add a pool if the delay is not passed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposePool('Fluid', alice.address);
        await expect(
          adminVault.connect(admin).addPool('Fluid', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');
      });

      it('should not be able to add a pool if the pool is not proposed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).addPool('Fluid', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });

      it('should not be able to add a pool if any values are empty', async function () {
        if (!this.test!.ctx!.added) this.skip();
        // protocol name is empty
        await expect(
          adminVault.connect(admin).addPool('', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
        // pool address is zero address
        await expect(
          adminVault.connect(admin).addPool('Fluid', ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });
      it('should revert if pool is not found', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).getPoolAddress('Fluid', getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotFound');
      });
    });

    describe('Action management', function () {
      it('should be able to propose an action', async function () {
        expect(
          await adminVault.getActionProposalTime(getBytes4(alice.address), alice.address)
        ).to.equal(0);
        // alice should not be able to propose an action
        await expect(
          adminVault.connect(alice).proposeAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to propose an action
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        expect(
          await adminVault.getActionProposalTime(getBytes4(alice.address), alice.address)
        ).to.not.equal(0);
        this.test!.ctx!.proposed = true;
      });

      it('should be able to cancel an action proposal', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        expect(
          await adminVault.getActionProposalTime(getBytes4(alice.address), alice.address)
        ).to.not.equal(0);
        // alice should not be able to cancel the action proposal
        await expect(
          adminVault.connect(alice).cancelActionProposal(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to cancel the action proposal
        await adminVault
          .connect(admin)
          .cancelActionProposal(getBytes4(alice.address), alice.address);
        expect(
          await adminVault.getActionProposalTime(getBytes4(alice.address), alice.address)
        ).to.equal(0);
      });
      it('should be able to add an action', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        // alice should not be able to add an action
        await expect(
          adminVault.connect(alice).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');
        // admin should be able to add an action
        await adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address);
        this.test!.ctx!.added = true;
      });

      it('should not be able to add an action if the delay is not passed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        await expect(
          adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');
      });

      it('should not be able to add an action if the action is not proposed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });

      it('should not be able to propose an action if the action is the zero address', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await expect(
          adminVault.connect(admin).proposeAction(getBytes4(alice.address), ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
        await expect(
          adminVault.connect(admin).proposeAction(ethers.ZeroHash.slice(0, 10), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });
      it('should revert if action not found', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).getActionAddress(getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotFound');
      });
    });

    // TODO: Update test to use AccessControl
    it('should set fee percentage correctly', async function () {
      await expect(adminVault.connect(alice).setFeeRange(100, 200)).to.be.revertedWithCustomError(
        adminVault,
        'AccessControlUnauthorizedAccount'
      );

      await expect(adminVault.connect(admin).setFeeRange(200, 100)).to.be.revertedWithCustomError(
        adminVault,
        'AdminVault_InvalidFeeRange'
      );

      await adminVault.connect(admin).setFeeRange(100, 200);
      expect(await adminVault.minFeeBasis()).to.equal(100);
      expect(await adminVault.maxFeeBasis()).to.equal(200);
    });
    it('should initialize fee timestamp correctly', async function () {
      await adminVault.proposePool('Fluid', alice.address);
      await adminVault.addPool('Fluid', alice.address);
      const tx = await adminVault.connect(owner).initializeFeeTimestamp(alice.address);

      const receipt = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp;
      expect(await adminVault.lastFeeTimestamp(owner.address, alice.address)).to.equal(
        blockTimestamp
      );
    });

    it('should update fee timestamp correctly', async function () {
      await adminVault.proposePool('Fluid', alice.address);
      await adminVault.addPool('Fluid', alice.address);
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
        loggerAddress
      );
      fluidSupplyAddress = await fluidSupplyContract.getAddress();
      fUSDC = await ethers.getContractAt('IFluidLending', tokenConfig.fUSDC.address);
      await adminVault.proposePool('Fluid', await fUSDC.getAddress());
      await adminVault.addPool('Fluid', await fUSDC.getAddress());
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
        feeBasis: 10,
        amount: '0',
      });

      const expectedFee = await calculateExpectedFee(
        (await supplyTx.wait()) ??
          (() => {
            throw new Error('Supply transaction failed');
          })(),
        (await withdrawTx.wait()) ??
          (() => {
            throw new Error('Withdraw transaction failed');
          })(),
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
