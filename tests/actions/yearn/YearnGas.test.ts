import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import {
  YearnSupply,
  YearnWithdraw,
  AdminVault,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Yearn Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let yearnSupplyContract: YearnSupply;
  let yearnWithdrawContract: YearnWithdraw;
  let yearnSupplyAddress: string;
  let yearnWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'USDC',
      yToken: tokenConfig.yUSDC.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      token: 'USDT',
      yToken: tokenConfig.yUSDT.address,
      decimals: tokenConfig.USDT.decimals,
    },
    {
      token: 'DAI',
      yToken: tokenConfig.yDAI.address,
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

    // Initialize YearnSupply and YearnWithdraw actions
    yearnSupplyContract = await deploy(
      'YearnSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnWithdrawContract = await deploy(
      'YearnWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnSupplyAddress = await yearnSupplyContract.getAddress();
    yearnWithdrawAddress = await yearnWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(yearnSupplyAddress), yearnSupplyAddress);
    await adminVault.proposeAction(getBytes4(yearnWithdrawAddress), yearnWithdrawAddress);
    await adminVault.addAction(getBytes4(yearnSupplyAddress), yearnSupplyAddress);
    await adminVault.addAction(getBytes4(yearnWithdrawAddress), yearnWithdrawAddress);

    for (const { yToken } of testCases) {
      await adminVault.proposePool('Yearn', yToken);
      await adminVault.addPool('Yearn', yToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ token, yToken, decimals }) => {
      describe(`${token} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'YearnSupply',
            assetId: getBytes4(yToken),
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
            type: 'YearnSupply',
            assetId: getBytes4(yToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'YearnWithdraw',
            assetId: getBytes4(yToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${token} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 