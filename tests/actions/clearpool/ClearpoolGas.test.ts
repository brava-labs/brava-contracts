import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import {
  ClearpoolSupply,
  ClearpoolWithdraw,
  AdminVault,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Clearpool Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let clearpoolSupplyContract: ClearpoolSupply;
  let clearpoolWithdrawContract: ClearpoolWithdraw;
  let clearpoolSupplyAddress: string;
  let clearpoolWithdrawAddress: string;
  let adminVault: AdminVault;

  const testCases = [
    {
      name: 'ALP USDC',
      token: 'USDC',
      cpToken: tokenConfig.cpALP_USDC.address,
      decimals: tokenConfig.USDC.decimals,
    },
    {
      name: 'AUR USDC',
      token: 'USDC',
      cpToken: tokenConfig.cpAUR_USDC.address,
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

    // Initialize ClearpoolSupply and ClearpoolWithdraw actions
    clearpoolSupplyContract = await deploy(
      'ClearpoolSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    clearpoolWithdrawContract = await deploy(
      'ClearpoolWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    clearpoolSupplyAddress = await clearpoolSupplyContract.getAddress();
    clearpoolWithdrawAddress = await clearpoolWithdrawContract.getAddress();

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(clearpoolSupplyAddress), clearpoolSupplyAddress);
    await adminVault.proposeAction(getBytes4(clearpoolWithdrawAddress), clearpoolWithdrawAddress);
    await adminVault.addAction(getBytes4(clearpoolSupplyAddress), clearpoolSupplyAddress);
    await adminVault.addAction(getBytes4(clearpoolWithdrawAddress), clearpoolWithdrawAddress);

    for (const { cpToken } of testCases) {
      await adminVault.proposePool('Clearpool', cpToken);
      await adminVault.addPool('Clearpool', cpToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ name, token, cpToken, decimals }) => {
      describe(`${name} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'ClearpoolSupply',
            assetId: getBytes4(cpToken),
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
            type: 'ClearpoolSupply',
            assetId: getBytes4(cpToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'ClearpoolWithdraw',
            assetId: getBytes4(cpToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${name} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 