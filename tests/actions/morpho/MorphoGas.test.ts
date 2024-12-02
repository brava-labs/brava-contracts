import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import {
  MorphoSupply,
  MorphoWithdraw,
  AdminVault,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Morpho Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let morphoSupplyContract: MorphoSupply;
  let morphoWithdrawContract: MorphoWithdraw;
  let morphoSupplyAddress: string;
  let morphoWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      name: 'FX USDC',
      token: 'USDC',
      mToken: tokenConfig.fxUSDC.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      name: 'Usual USDC',
      token: 'USDC',
      mToken: tokenConfig.usualUSDC.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      name: 'Gauntlet USDC',
      token: 'USDC',
      mToken: tokenConfig.gauntletUSDC.address,
      decimals: tokenConfig.USDC.decimals,
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

    // Initialize MorphoSupply and MorphoWithdraw actions
    morphoSupplyContract = await deploy(
      'MorphoSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    morphoWithdrawContract = await deploy(
      'MorphoWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    morphoSupplyAddress = await morphoSupplyContract.getAddress();
    morphoWithdrawAddress = await morphoWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);
    await adminVault.proposeAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);
    await adminVault.addAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);
    await adminVault.addAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);

    for (const { mToken } of testCases) {
      await adminVault.proposePool('Morpho', mToken);
      await adminVault.addPool('Morpho', mToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ name, token, mToken, decimals }) => {
      describe(`${name} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'MorphoSupply',
            assetId: getBytes4(mToken),
            amount,
          });
          
          const receipt = await tx.wait();
          console.log(`Gas used for ${name} supply: ${receipt?.gasUsed}`);
        });

        it('Should measure withdraw gas cost', async () => {
          // First supply
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'MorphoSupply',
            assetId: getBytes4(mToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'MorphoWithdraw',
            assetId: getBytes4(mToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${name} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 