import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { NEXUS_MUTUAL_NFT_ADDRESS } from '../../constants';
import { BuyCover, AdminVault, Logger, IERC721, IERC20, SendToken } from '../../../typechain-types';
import { deploy, executeAction, getBaseSetup, getBytes4, decodeLoggerLog } from '../../utils';
import { fundAccountWithToken, getDAI } from '../../utils-stable';
import { CoverAsset } from '@nexusmutual/sdk';
import { ACTION_LOG_IDS } from '../../logs';
import { tokenConfig } from '../../constants';

describe('Nexus Mutual Gas Measurements', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let buyCoverContract: BuyCover;
  let buyCoverAddress: string;
  let adminVault: AdminVault;
  let nft: IERC721;
  let DAI: IERC20;
  let sendTokenContract: SendToken;
  let sendTokenAddress: string;

  const testCases = [
    {
      name: 'ETH Cover',
      productId: 156,
      coverAsset: CoverAsset.ETH,
      amountToInsure: '1.0',
      fundAmount: '2.0', // ETH amount to fund
    },
    {
      name: 'DAI Cover',
      productId: 231,
      coverAsset: CoverAsset.DAI,
      amountToInsure: '1.0',
      fundAmount: 1000, // DAI amount to fund
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
    nft = await ethers.getContractAt('IERC721', NEXUS_MUTUAL_NFT_ADDRESS);
    DAI = await getDAI();

    // Initialize BuyCover action
    buyCoverContract = await deploy(
      'BuyCover',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    buyCoverAddress = await buyCoverContract.getAddress();

    // Initialize SendToken action
    sendTokenContract = await deploy(
      'SendToken',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sendTokenAddress = await sendTokenContract.getAddress();

    // Setup actions
    await adminVault.proposeAction(getBytes4(buyCoverAddress), buyCoverAddress);
    await adminVault.addAction(getBytes4(buyCoverAddress), buyCoverAddress);

    await adminVault.proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
    await adminVault.addAction(getBytes4(sendTokenAddress), sendTokenAddress);

    // Add DAI pool
    await adminVault.proposePool('Nexus', tokenConfig.DAI.address);
    await adminVault.addPool('Nexus', tokenConfig.DAI.address);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Gas Measurements', () => {
    testCases.forEach(({ name, productId, coverAsset, amountToInsure, fundAmount }) => {
      describe(`${name}`, () => {
        it('Should measure buy cover gas cost', async () => {
          // Fund the account
          if (coverAsset === CoverAsset.ETH) {
            await signer.sendTransaction({
              to: safeAddr,
              value: ethers.parseEther(fundAmount),
            });
          } else {
            await fundAccountWithToken(safeAddr, 'DAI', fundAmount);
            // Approve DAI for the BuyCover contract
            await executeAction({
              type: 'SendToken',
              token: 'DAI',
              amount: ethers.parseUnits('10', 18), // Approve enough for premium
              to: buyCoverAddress,
            });
          }

          // Check initial NFT balance
          const initialNFTBalance = await nft.balanceOf(safeAddr);

          const tx = await executeAction({
            type: 'BuyCover',
            productId,
            amountToInsure,
            daysToInsure: 28,
            coverAsset,
            coverAddress: safeAddr,
            debug: true,
          });
          
          const receipt = await tx.wait();
          if (!receipt) {
            throw new Error('Transaction failed');
          }

          // Verify NFT was minted
          const finalNFTBalance = await nft.balanceOf(safeAddr);
          expect(finalNFTBalance).to.equal(initialNFTBalance + 1n);

          // Verify logs
          const logs = await decodeLoggerLog(receipt);
          expect(logs).to.have.length(1);
          expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BUY_COVER));
          expect(logs[0]).to.have.property('period', (28 * 24 * 60 * 60).toString());
          expect(logs[0]).to.have.property('coverId');

          console.log(`Gas used for ${name}: ${receipt.gasUsed}`);
        });
      });
    });
  });
}); 