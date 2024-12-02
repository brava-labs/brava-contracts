import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { ACROSS_HUB, tokenConfig } from '../../../tests/constants';
import {
  AcrossSupply,
  AcrossWithdraw,
  AdminVault,
  HubPoolInterface,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Across Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let hubPool: HubPoolInterface;
  let acrossSupplyContract: AcrossSupply;
  let acrossWithdrawContract: AcrossWithdraw;
  let acrossSupplyAddress: string;
  let acrossWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'USDC',
      lpToken: 'across_lpUSDC',
      decimals: tokenConfig.USDC.decimals,
    },
    {
      token: 'USDT',
      lpToken: 'across_lpUSDT',
      decimals: tokenConfig.USDT.decimals,
    },
    {
      token: 'DAI',
      lpToken: 'across_lpDAI',
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

    // Get HubPool interface
    hubPool = await ethers.getContractAt('HubPoolInterface', ACROSS_HUB);

    // Initialize AcrossSupply and AcrossWithdraw actions
    acrossSupplyContract = await deploy(
      'AcrossSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      ACROSS_HUB
    );
    acrossWithdrawContract = await deploy(
      'AcrossWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      ACROSS_HUB
    );
    acrossSupplyAddress = await acrossSupplyContract.getAddress();
    acrossWithdrawAddress = await acrossWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(acrossSupplyAddress), acrossSupplyAddress);
    await adminVault.proposeAction(getBytes4(acrossWithdrawAddress), acrossWithdrawAddress);
    await adminVault.addAction(getBytes4(acrossSupplyAddress), acrossSupplyAddress);
    await adminVault.addAction(getBytes4(acrossWithdrawAddress), acrossWithdrawAddress);

    for (const { token } of testCases) {
      await adminVault.proposePool('Across', tokenConfig[token].address);
      await adminVault.addPool('Across', tokenConfig[token].address);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ token, decimals }) => {
      describe(`${token} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
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
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'AcrossWithdraw',
            poolAddress: tokenConfig[token].address,
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${token} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 