import { executeSafeTransaction, YearnSupplyAction } from 'athena-sdk';
import { network } from 'hardhat';
import { Signer, ethers, expect } from '../..';
import { IERC20, YearnSupply } from '../../../typechain-types';
import { YEARN_REGISTRY_ADDRESS, tokenConfig } from '../../constants';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithToken, getStables } from '../../utils-stable';

// AI generated test, this doesn't work yet

describe('YearnSupply tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let yearnSupply: YearnSupply;
  let USDC: IERC20;
  let snapshotId: string;
  let yearnRegistry: any; // Replace 'any' with the correct interface if available
  let usdcVaultAddress: string;
  let yUSDC: any; // Replace 'any' with the correct interface if available

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
});

export {};
