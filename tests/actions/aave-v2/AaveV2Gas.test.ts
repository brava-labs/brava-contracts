import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { AAVE_V2_POOL, tokenConfig } from '../../../tests/constants';
import {
  AaveV2Supply,
  AaveV2Withdraw,
  AdminVault,
  IERC20,
  ILendingPool,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Aave V2 Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let aaveSupplyContract: AaveV2Supply;
  let aaveWithdrawContract: AaveV2Withdraw;
  let aaveSupplyAddress: string;
  let aaveWithdrawAddress: string;
  let aavePool: ILendingPool;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'USDC',
      aToken: tokenConfig.aUSDC_V2.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      token: 'USDT',
      aToken: tokenConfig.aUSDT_V2.address,
      decimals: tokenConfig.USDT.decimals,
    },
    {
      token: 'DAI',
      aToken: tokenConfig.aDAI_V2.address,
      decimals: tokenConfig.DAI.decimals,
    },
  ];

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = (await baseSetup.safe.getAddress()) as string;
    loggerAddress = (await baseSetup.logger.getAddress()) as string;
    logger = await ethers.getContractAt('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;

    // Initialize AaveSupply and AaveWithdraw actions
    aaveSupplyContract = await deploy(
      'AaveV2Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V2_POOL
    );
    aaveWithdrawContract = await deploy(
      'AaveV2Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V2_POOL
    );
    aaveSupplyAddress = await aaveSupplyContract.getAddress();
    aaveWithdrawAddress = await aaveWithdrawContract.getAddress();
    aavePool = await ethers.getContractAt('ILendingPool', AAVE_V2_POOL);

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.proposeAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);
    await adminVault.addAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.addAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);

    for (const { aToken } of testCases) {
      await adminVault.proposePool('AaveV2', aToken);
      await adminVault.addPool('AaveV2', aToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ token, aToken, decimals }) => {
      describe(`${token} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'AaveV2Supply',
            assetId: getBytes4(aToken),
            amount,
          });
          
          const receipt = await tx.wait();
          console.log(`Gas used for ${token} supply: ${receipt?.gasUsed}`);
        });

        it('Should measure withdraw gas cost', async () => {
          // First supply
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'AaveV2Supply',
            assetId: getBytes4(aToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'AaveV2Withdraw',
            assetId: getBytes4(aToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${token} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 