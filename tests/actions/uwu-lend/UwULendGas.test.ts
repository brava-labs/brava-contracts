import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { UWU_LEND_POOL, tokenConfig } from '../../../tests/constants';
import {
  UwULendSupply,
  UwULendWithdraw,
  AdminVault,
  IERC20,
  ILendingPool,
  Logger,
} from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4 } from '../../utils';
import { fundAccountWithToken, getDAI, getUSDT } from '../../utils-stable';

describe('UwU Lend Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let uwuSupplyContract: UwULendSupply;
  let uwuWithdrawContract: UwULendWithdraw;
  let uwuSupplyAddress: string;
  let uwuWithdrawAddress: string;
  let uwuPool: ILendingPool;
  let adminVault: AdminVault;

  const testCases = [
    {
      token: 'DAI',
      uToken: tokenConfig.uDAI.address,
      decimals: tokenConfig.DAI.decimals,
    },
    {
      token: 'USDT',
      uToken: tokenConfig.uUSDT.address,
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

    // Initialize UwULendSupply and UwULendWithdraw actions
    uwuSupplyContract = await deploy(
      'UwULendSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      UWU_LEND_POOL
    );
    uwuWithdrawContract = await deploy(
      'UwULendWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      UWU_LEND_POOL
    );
    uwuSupplyAddress = await uwuSupplyContract.getAddress();
    uwuWithdrawAddress = await uwuWithdrawContract.getAddress();
    uwuPool = await ethers.getContractAt('ILendingPool', UWU_LEND_POOL);

    // Setup actions and pools
    await adminVault.proposeAction(getBytes4(uwuSupplyAddress), uwuSupplyAddress);
    await adminVault.proposeAction(getBytes4(uwuWithdrawAddress), uwuWithdrawAddress);
    await adminVault.addAction(getBytes4(uwuSupplyAddress), uwuSupplyAddress);
    await adminVault.addAction(getBytes4(uwuWithdrawAddress), uwuWithdrawAddress);

    for (const { uToken } of testCases) {
      await adminVault.proposePool('UwULend', uToken);
      await adminVault.addPool('UwULend', uToken);
    }
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ token, uToken, decimals }) => {
      describe(`${token} Operations`, () => {
        it('Should measure supply gas cost', async () => {
          const amount = ethers.parseUnits('1000', decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const tx = await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
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
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount,
          });

          // Then measure withdraw
          const withdrawTx = await executeAction({
            type: 'UwULendWithdraw',
            assetId: getBytes4(uToken),
            amount: amount,
          });
          
          const receipt = await withdrawTx.wait();
          console.log(`Gas used for ${token} withdraw: ${receipt?.gasUsed}`);
        });
      });
    });
  });
}); 