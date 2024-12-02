import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import {
  FluidSupply,
  FluidWithdraw,
  AdminVault,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Fluid Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let fluidSupplyContract: FluidSupply;
  let fluidWithdrawContract: FluidWithdraw;
  let fluidSupplyAddress: string;
  let fluidWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'USDC',
      fToken: tokenConfig.fUSDC.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      token: 'USDT',
      fToken: tokenConfig.fUSDT.address,
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

    // Initialize FluidSupply and FluidWithdraw actions
    fluidSupplyContract = await deploy(
      'FluidSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    fluidWithdrawContract = await deploy(
      'FluidWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    fluidSupplyAddress = await fluidSupplyContract.getAddress();
    fluidWithdrawAddress = await fluidWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
    await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);

    for (const { fToken } of testCases) {
      await adminVault.proposePool('Fluid', fToken);
      await adminVault.addPool('Fluid', fToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ token, fToken, decimals }) => {
      describe(`${token} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'FluidSupply',
            assetId: getBytes4(fToken),
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
            type: 'FluidSupply',
            assetId: getBytes4(fToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'FluidWithdraw',
            assetId: getBytes4(fToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${token} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 