import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import {
  StrikeSupply,
  StrikeWithdraw,
  AdminVault,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Strike Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let strikeSupplyContract: StrikeSupply;
  let strikeWithdrawContract: StrikeWithdraw;
  let strikeSupplyAddress: string;
  let strikeWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'USDC',
      sToken: tokenConfig.sUSDC.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      token: 'USDT',
      sToken: tokenConfig.sUSDT.address,
      decimals: tokenConfig.USDT.decimals,
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

    // Initialize StrikeSupply and StrikeWithdraw actions
    strikeSupplyContract = await deploy(
      'StrikeSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    strikeWithdrawContract = await deploy(
      'StrikeWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    strikeSupplyAddress = await strikeSupplyContract.getAddress();
    strikeWithdrawAddress = await strikeWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
    await adminVault.proposeAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);
    await adminVault.addAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
    await adminVault.addAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);

    for (const { sToken } of testCases) {
      await adminVault.proposePool('Strike', sToken);
      await adminVault.addPool('Strike', sToken);
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
            type: 'StrikeSupply',
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
            type: 'StrikeSupply',
            assetId: getBytes4(sToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'StrikeWithdraw',
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