import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import {
  SparkSupply,
  SparkWithdraw,
  AdminVault,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken, getDAI } from '../../utils-stable';

describe('Spark Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let sparkSupplyContract: SparkSupply;
  let sparkWithdrawContract: SparkWithdraw;
  let sparkSupplyAddress: string;
  let sparkWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'DAI',
      sToken: tokenConfig.sDAI.address,
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

    // Initialize SparkSupply and SparkWithdraw actions
    sparkSupplyContract = await deploy(
      'SparkSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sparkWithdrawContract = await deploy(
      'SparkWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sparkSupplyAddress = await sparkSupplyContract.getAddress();
    sparkWithdrawAddress = await sparkWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);
    await adminVault.proposeAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);
    await adminVault.addAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);
    await adminVault.addAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);

    for (const { sToken } of testCases) {
      await adminVault.proposePool('Spark', sToken);
      await adminVault.addPool('Spark', sToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ token, sToken, decimals }) => {
      describe(`${token} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'SparkSupply',
            assetId: getBytes4(sToken),
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
            type: 'SparkSupply',
            assetId: getBytes4(sToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'SparkWithdraw',
            assetId: getBytes4(sToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${token} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 