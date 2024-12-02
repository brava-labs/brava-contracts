import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { AAVE_V3_POOL, tokenConfig } from '../../../tests/constants';
import {
  AaveV3Supply,
  AaveV3Withdraw,
  AdminVault,
  IERC20,
  IPool,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken, getDAI, getUSDC, getUSDT } from '../../utils-stable';

describe('Aave V3 Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let aaveSupplyContract: AaveV3Supply;
  let aaveWithdrawContract: AaveV3Withdraw;
  let aaveSupplyAddress: string;
  let aaveWithdrawAddress: string;
  let aavePool: IPool;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'USDC',
      aToken: tokenConfig.aUSDC_V3.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      token: 'USDT',
      aToken: tokenConfig.aUSDT_V3.address,
      decimals: tokenConfig.USDT.decimals,
    },
    {
      token: 'DAI',
      aToken: tokenConfig.aDAI_V3.address,
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
      'AaveV3Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V3_POOL
    );
    aaveWithdrawContract = await deploy(
      'AaveV3Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V3_POOL
    );
    aaveSupplyAddress = await aaveSupplyContract.getAddress();
    aaveWithdrawAddress = await aaveWithdrawContract.getAddress();
    aavePool = await ethers.getContractAt('IPool', AAVE_V3_POOL);

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.proposeAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);
    await adminVault.addAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.addAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);

    for (const { aToken } of testCases) {
      await adminVault.proposePool('AaveV3', aToken);
      await adminVault.addPool('AaveV3', aToken);
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
            type: 'AaveV3Supply',
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
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'AaveV3Withdraw',
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