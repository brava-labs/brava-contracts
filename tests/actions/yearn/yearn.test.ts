import { ethers, Signer, expect } from '../..';
import { network } from 'hardhat';
import { YearnSupply, IERC20 } from '../../../typechain-types';
import { YEARN_REGISTRY_ADDRESS, tokenConfig } from '../../constants';
import { deploy, log, getBaseSetup } from '../../utils';
import { executeSafeTransaction } from 'athena-sdk';
import { fundAccountWithStablecoin, getStables } from '../../utils-stable';

// AI generated test, this doesn't work yet

describe('YearnSupply tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let yearnSupply: YearnSupply;
  let USDC: IERC20;
  let snapshotId: string;

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
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  // Skip this until it's implemented properly
  it.skip('should supply USDC to Yearn vault', async () => {
    const fundAmount = 1000; // 1000 USDC
    await fundAccountWithStablecoin(safeAddr, 'USDC', fundAmount);

    const initialUsdcBalance = await USDC.balanceOf(safeAddr);
    expect(initialUsdcBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 6));

    // Prepare supply parameters
    const supplyAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals); // 100 USDC
    const params = {
      token: tokenConfig.USDC.address,
      amount: supplyAmount,
      from: safeAddr,
      to: safeAddr,
    };

    const abiCoder = new ethers.AbiCoder();
    const paramsEncoded = abiCoder.encode(
      ['tuple(address token, uint256 amount, address from, address to)'],
      [params]
    );

    const yearnSupplyAddress = await yearnSupply.getAddress();
    const encodedFunctionCall = yearnSupply.interface.encodeFunctionData('executeActionDirect', [
      paramsEncoded,
    ]);

    // Approve USDC spending
    await USDC.connect(signer).approve(safeAddr, supplyAmount);

    // fund safe with eth
    await signer.sendTransaction({
      to: safeAddr,
      value: ethers.parseUnits('100', 18),
    });

    // Execute supply
    await executeSafeTransaction(safeAddr, yearnSupplyAddress, 0, encodedFunctionCall, 0, signer);

    // Check balances after supply
    const finalUsdcBalance = await USDC.balanceOf(safeAddr);
    expect(finalUsdcBalance).to.be.lt(initialUsdcBalance);

    // Get Yearn vault address for USDC
    const yearnRegistry = await ethers.getContractAt('IYearnRegistry', YEARN_REGISTRY_ADDRESS);
    const vaultAddress = await yearnRegistry.latestVault(tokenConfig.USDC.address);
    const yUSDC = await ethers.getContractAt('IERC20', vaultAddress);

    const yUsdcBalance = await yUSDC.balanceOf(safeAddr);
    expect(yUsdcBalance).to.be.gt(0);
  });
});

export {};
