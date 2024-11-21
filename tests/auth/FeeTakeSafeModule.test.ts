import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { executeSafeTransaction } from 'brava-ts-client';
import { expect } from 'chai';
import { BytesLike } from 'ethers';
import { ethers, network } from 'hardhat';
import {
  AdminVault,
  FeeTakeSafeModule,
  FluidSupply,
  IERC20,
  IFluidLending,
  ISafe,
  Logger,
  SequenceExecutor,
} from '../../typechain-types';
import { tokenConfig } from '../constants';
import { deploy, executeAction, getBaseSetup, getBytes4, log } from '../utils';
import { fundAccountWithToken, getUSDC } from '../utils-stable';

describe('FeeTakeSafeModule', function () {
  let adminVault: AdminVault;
  let feeTakeSafeModule: FeeTakeSafeModule;
  let logger: Logger;
  let fluidSupplyContract: FluidSupply;
  let fluidSupplyAddress: string;
  let fluidSupplyId: BytesLike;
  let poolId: BytesLike;
  let fUSDC: IFluidLending;
  let admin: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let safeAddr: string;
  let safe: ISafe;
  let snapshotId: string;
  let USDC: IERC20;
  let sequenceExecutor: SequenceExecutor;

  before(async () => {
    [admin, owner, alice, bob] = await ethers.getSigners();

    const baseSetup = await getBaseSetup(admin);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    safe = baseSetup.safe;
    safeAddr = await safe.getAddress();

    sequenceExecutor = await deploy('SequenceExecutor', admin, await adminVault.getAddress());
    // Deploy FeeTakeSafeModule
    feeTakeSafeModule = await deploy(
      'FeeTakeSafeModule',
      admin,
      await adminVault.getAddress(),
      await sequenceExecutor.getAddress()
    );

    // add FEE_TAKER_ROLE to alice
    const FEE_TAKER_ROLE = await feeTakeSafeModule.FEE_TAKER_ROLE();
    await adminVault.connect(admin).proposeRole(FEE_TAKER_ROLE, alice.address);
    await adminVault.connect(admin).grantRole(FEE_TAKER_ROLE, alice.address);

    // Fetch the USDC token
    USDC = await getUSDC();

    // Initialize FluidSupply action
    fluidSupplyContract = await deploy(
      'FluidSupply',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress()
    );
    fluidSupplyAddress = await fluidSupplyContract.getAddress();
    fluidSupplyId = getBytes4(fluidSupplyAddress);
    fUSDC = await ethers.getContractAt('IFluidLending', tokenConfig.fUSDC.address);
    await adminVault.proposePool('Fluid', await fUSDC.getAddress());
    await adminVault.addPool('Fluid', await fUSDC.getAddress());
    poolId = getBytes4(await fUSDC.getAddress());
    await adminVault.proposeAction(fluidSupplyId, fluidSupplyAddress);
    await adminVault.addAction(fluidSupplyId, fluidSupplyAddress);
    // Fund safe with USDC
    const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
    await fundAccountWithToken(safeAddr, 'USDC', amount);

    // Take local snapshot before running tests
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {
    // Revert to snapshot before each test
    await network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    // Revert to snapshot after each test
    await network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await network.provider.send('evm_snapshot');
  });

  describe('Constructor', function () {
    it('should set the correct AdminVault and SequenceExecutor addresses', async function () {
      expect(await feeTakeSafeModule.ADMIN_VAULT()).to.equal(await adminVault.getAddress());
      expect(await feeTakeSafeModule.SEQUENCE_EXECUTOR_ADDR()).to.equal(
        await sequenceExecutor.getAddress()
      );
    });
  });

  describe('Enable module', function () {
    it('should be enabled', async function () {
      // encode the enable module call
      const payload = safe.interface.encodeFunctionData('enableModule', [
        await feeTakeSafeModule.getAddress(),
      ]);
      await executeSafeTransaction(safeAddr, safeAddr, 0, payload, 0, admin);
      expect(await safe.isModuleEnabled(await feeTakeSafeModule.getAddress())).to.be.true;
    });
  });

  describe('takeFees', function () {
    before(async () => {
      // enable module
      const payload = safe.interface.encodeFunctionData('enableModule', [
        await feeTakeSafeModule.getAddress(),
      ]);
      await executeSafeTransaction(safeAddr, safeAddr, 0, payload, 0, admin);
      expect(await safe.isModuleEnabled(await feeTakeSafeModule.getAddress())).to.be.true;

      // Take local snapshot before running tests
      log('Taking local snapshot');
      snapshotId = await network.provider.send('evm_snapshot');
    });

    it('should revert if caller does not have FEE_TAKER_ROLE', async function () {
      await expect(
        feeTakeSafeModule.connect(bob).takeFees(safeAddr, [fluidSupplyId], [poolId], [100])
      ).to.be.revertedWithCustomError(feeTakeSafeModule, 'FeeTakeSafeModule_SenderNotFeeTaker');
      this.test!.ctx!.proposed = true;
    });

    it('should revert if an invalid action type is provided', async function () {
      if (!this.test!.ctx!.proposed) this.skip();
      // deploy an invalid action (FluidWithdraw)
      const invalidAction = await deploy(
        'FluidWithdraw',
        admin,
        await adminVault.getAddress(),
        await logger.getAddress()
      );
      const invalidActionId = getBytes4(await invalidAction.getAddress());
      await adminVault.proposeAction(invalidActionId, await invalidAction.getAddress());
      await adminVault.addAction(invalidActionId, await invalidAction.getAddress());

      await expect(
        feeTakeSafeModule.connect(alice).takeFees(safeAddr, [invalidActionId], [poolId], [100])
      ).to.be.revertedWithCustomError(feeTakeSafeModule, 'FeeTakeSafeModule_InvalidActionType');
      this.test!.ctx!.proposed = true;
    });

    it('should revert if the fee basis is too high', async function () {
      if (!this.test!.ctx!.proposed) this.skip();
      // set max fee basis to 5%
      await adminVault.connect(admin).proposeFeeConfig(alice.address, 0, 500);
      await adminVault.connect(admin).setFeeConfig();
      await expect(
        feeTakeSafeModule.connect(alice).takeFees(safeAddr, [fluidSupplyId], [poolId], [501]) // 5.01%
      ).to.be.revertedWithCustomError(feeTakeSafeModule, 'FeeTakeSafeModule_ExecutionFailed');

      await expect(
        feeTakeSafeModule.connect(alice).takeFees(safeAddr, [fluidSupplyId], [poolId], [500]) // 5%
      ).to.not.be.reverted;
      this.test!.ctx!.proposed = true;
    });

    it('should successfully execute fee taking', async function () {
      if (!this.test!.ctx!.proposed) this.skip();

      // deposit 100 USDC
      const supplyTx = await executeAction({
        type: 'FluidSupply',
        amount: ethers.parseUnits('100', tokenConfig.USDC.decimals),
      });

      // check if the deposit was successful
      const fUSDCBalanceBeforeFee = await fUSDC.balanceOf(safeAddr);
      expect(fUSDCBalanceBeforeFee).to.be.greaterThan(0);

      // set fee recipient to bob
      await adminVault.connect(admin).proposeFeeConfig(bob.address, 0, 1000);
      await adminVault.connect(admin).setFeeConfig();

      const protocolId = BigInt(
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Fluid']))
      );
      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        protocolId,
        tokenConfig.fUSDC.address
      );
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel like you're Dr Emmett Brown
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      // take fees
      await feeTakeSafeModule.connect(alice).takeFees(safeAddr, [fluidSupplyId], [poolId], [100]);

      // check if the fee was taken
      const fUSDCBalanceAfterFee = await fUSDC.balanceOf(safeAddr);
      const feeTakerBalance = await fUSDC.balanceOf(bob.address);
      expect(feeTakerBalance).to.be.greaterThan(0);
      expect(fUSDCBalanceAfterFee).to.be.lessThan(fUSDCBalanceBeforeFee);
      this.test!.ctx!.proposed = true;
    });
  });
});
