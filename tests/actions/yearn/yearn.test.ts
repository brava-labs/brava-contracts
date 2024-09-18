import { executeSafeTransaction, YearnSupplyAction, YearnWithdrawAction } from 'athena-sdk';
import { network } from 'hardhat';
import { Signer, ethers, expect } from '../..';
import {
  IERC20,
  YearnSupply,
  YearnWithdraw,
  IVaultRegistry,
  IYearnVault,
} from '../../../typechain-types';
import { YEARN_REGISTRY_ADDRESS, tokenConfig, actionTypes } from '../../constants';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithToken, getStables } from '../../utils-stable';

describe('Yearn tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let yearnSupply: YearnSupply;
  let yearnWithdraw: YearnWithdraw;
  let USDC: IERC20;
  let snapshotId: string;
  let yearnRegistry: IVaultRegistry;
  let usdcVaultAddress: string;
  let yUSDC: IYearnVault;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;
    log('Safe Address', safeAddr);

    yearnSupply = await deploy(
      'YearnSupply',
      signer,
      baseSetup.contractRegistry.getAddress(),
      baseSetup.logger.getAddress()
    );
    yearnWithdraw = await deploy(
      'YearnWithdraw',
      signer,
      baseSetup.contractRegistry.getAddress(),
      baseSetup.logger.getAddress()
    );
    ({ USDC } = await getStables());

    yearnRegistry = await ethers.getContractAt('IVaultRegistry', YEARN_REGISTRY_ADDRESS);
    usdcVaultAddress = await yearnRegistry.latestVault(tokenConfig.USDC.address);
    yUSDC = await ethers.getContractAt('IYearnVault', usdcVaultAddress);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });
  describe('YearnSupply tests', () => {
    it('should supply USDC to Yearn vault', async () => {
      const fundAmount = 1000; // 1000 USDC
      await fundAccountWithToken(safeAddr, 'USDC', fundAmount);

      const initialUsdcBalance = await USDC.balanceOf(safeAddr);
      expect(initialUsdcBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 6));

      const yearnSupplyAction = new YearnSupplyAction(
        tokenConfig.USDC.address,
        fundAmount.toString()
      );
      const encodedFunctionCall = yearnSupplyAction.encodeArgsForExecuteActionCall(0);

      await executeSafeTransaction(
        safeAddr,
        await yearnSupply.getAddress(),
        0,
        encodedFunctionCall,
        1,
        signer,
        {
          safeTxGas: 2000000,
        }
      );

      const yUsdcBalance = await yUSDC.balanceOf(safeAddr);
      log('yUsdcBalance', yUsdcBalance);

      const finalUsdcBalance = await USDC.balanceOf(safeAddr);

      expect(yUsdcBalance).to.be.gt(0);
      expect(finalUsdcBalance).to.equal(initialUsdcBalance - BigInt(fundAmount));
    });

    it('should supply max USDC to Yearn vault', async () => {
      const fundAmount = 1000; // 1000 USDC
      await fundAccountWithToken(safeAddr, 'USDC', fundAmount);

      const initialUsdcBalance = await USDC.balanceOf(safeAddr);
      expect(initialUsdcBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 6));

      const yearnSupplyAction = new YearnSupplyAction(
        tokenConfig.USDC.address,
        ethers.MaxUint256.toString()
      );
      const encodedFunctionCall = yearnSupplyAction.encodeArgsForExecuteActionCall(0);

      await executeSafeTransaction(
        safeAddr,
        await yearnSupply.getAddress(),
        0,
        encodedFunctionCall,
        1,
        signer,
        {
          safeTxGas: 2000000,
        }
      );

      const yUsdcBalance = await yUSDC.balanceOf(safeAddr);
      log('yUsdcBalance', yUsdcBalance);

      const finalUsdcBalance = await USDC.balanceOf(safeAddr);

      expect(yUsdcBalance).to.be.gt(0);
      expect(finalUsdcBalance).to.equal(0);
    });
    it('should have depsit action type', async () => {
      expect(await yearnSupply.actionType()).to.equal(actionTypes.DEPOSIT_ACTION);
    });
  });
  describe('YearnWithdraw tests', () => {
    it('should withdraw some USDC from Yearn vault', async () => {
      const fundAmount = 1000; // 1000 yUSDC
      await fundAccountWithToken(safeAddr, 'yUSDC', fundAmount);
      const yearnWithdrawAction = new YearnWithdrawAction(
        tokenConfig.yUSDC.address,
        fundAmount.toString()
      );
      const encodedFunctionCall = yearnWithdrawAction.encodeArgsForExecuteActionCall(0);
      const initialyUSDCBalance = await yUSDC.balanceOf(safeAddr);

      await executeSafeTransaction(
        safeAddr,
        await yearnWithdraw.getAddress(),
        0,
        encodedFunctionCall,
        1,
        signer
      );
      const finalyUSDCBalance = await yUSDC.balanceOf(safeAddr);
      expect(finalyUSDCBalance).to.equal(initialyUSDCBalance - BigInt(fundAmount));
    });
    it('should withdraw max USDC from Yearn vault', async () => {
      const fundAmount = 1000; // 1000 yUSDC
      await fundAccountWithToken(safeAddr, 'yUSDC', fundAmount);
      const yearnWithdrawAction = new YearnWithdrawAction(
        tokenConfig.yUSDC.address,
        ethers.MaxUint256.toString()
      );
      const encodedFunctionCall = yearnWithdrawAction.encodeArgsForExecuteActionCall(0);

      await executeSafeTransaction(
        safeAddr,
        await yearnWithdraw.getAddress(),
        0,
        encodedFunctionCall,
        1,
        signer
      );

      const finalyUSDCBalance = await yUSDC.balanceOf(safeAddr);
      expect(finalyUSDCBalance).to.equal(0);
    });
    it('should use exit function to withdraw', async () => {
      const fundAmount = 1000; // 1000 yUSDC
      const yearnWithdrawContract = await yearnWithdraw.getAddress();
      await fundAccountWithToken(yearnWithdrawContract, 'yUSDC', fundAmount);
      const initialUSDCBalance = await USDC.balanceOf(yearnWithdrawContract);
      await yearnWithdraw.exit(tokenConfig.yUSDC.address);
      expect(await yUSDC.balanceOf(yearnWithdrawContract)).to.equal(0);
      expect(await USDC.balanceOf(yearnWithdrawContract)).to.be.gt(initialUSDCBalance);
    });

    it('should have withdraw action type', async () => {
      expect(await yearnWithdraw.actionType()).to.equal(actionTypes.WITHDRAW_ACTION);
    });
  });
});

export {};
