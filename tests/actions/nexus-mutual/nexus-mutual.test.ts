import { executeSafeTransaction } from 'athena-sdk';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BuyCover } from '../../../typechain-types';
import { NEXUS_MUTUAL_NFT_ADDRESS } from '../../constants';
import { deploy, getBaseSetup, log, encodeAction, executeAction, getBytes4 } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';
import { CoverAsset } from '@nexusmutual/sdk';
import { actionTypes, ActionArgs } from '../../actions';

describe('BuyCover tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let buyCover: BuyCover;
  let snapshotId: string;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = await baseSetup.safe.getAddress();
    log('Safe Address', safeAddr);

    buyCover = await deploy(
      'BuyCover',
      signer,
      await baseSetup.adminVault.getAddress(),
      await baseSetup.logger.getAddress()
    );
    const buyCoverAddress = await buyCover.getAddress();
    await baseSetup.adminVault.proposeAction(getBytes4(buyCoverAddress), buyCoverAddress);
    await baseSetup.adminVault.addAction(getBytes4(buyCoverAddress), buyCoverAddress);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  it('should buy cover from Nexus Mutual using ETH', async () => {
    await signer.sendTransaction({
      to: safeAddr,
      value: ethers.parseEther('2.0'),
    });

    const buyCoverArgs: ActionArgs = {
      type: 'BuyCover',
      productId: 156,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.ETH,
      coverAddress: safeAddr,
      debug: false,
    };

    const tx = await executeAction({ ...buyCoverArgs });
    await tx.wait();

    // check the coverage here
  });

  it('should buy cover from Nexus Mutual using a stablecoin', async () => {
    // Currently only DAI works (Nexus Mutual doesn't support USDT and their USDC is broken)
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const buyCoverArgs: ActionArgs = {
      type: 'BuyCover',
      productId: 231,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.DAI,
      coverAddress: safeAddr,
    };

    const tx = await executeAction({ ...buyCoverArgs });
    await tx.wait();

    // check the coverage here
  });

  it('should have the NFT in the safe', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const nft = await ethers.getContractAt('IERC721', NEXUS_MUTUAL_NFT_ADDRESS);
    expect(await nft.balanceOf(safeAddr)).to.equal(0);

    const buyCoverArgs: ActionArgs = {
      type: 'BuyCover',
      productId: 231,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.DAI,
      coverAddress: safeAddr,
    };

    const tx = await executeAction({ ...buyCoverArgs });
    await tx.wait();

    expect(await nft.balanceOf(safeAddr)).to.equal(1);
  });

  it('should have the correct data in the NFT', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const nft = await ethers.getContractAt('IERC721Metadata', NEXUS_MUTUAL_NFT_ADDRESS);
    expect(await nft.balanceOf(safeAddr)).to.equal(0);

    const buyCoverArgs: ActionArgs = {
      type: 'BuyCover',
      productId: 231,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.DAI,
      coverAddress: safeAddr,
    };

    const tx = await executeAction({ ...buyCoverArgs });
    const receipt = await tx.wait();

    expect(await nft.balanceOf(safeAddr)).to.equal(1);

    // filter relevant logs
    const relevantLogs = receipt!.logs.filter(
      (log: any) => log.address.toLowerCase() === NEXUS_MUTUAL_NFT_ADDRESS.toLowerCase()
    );

    // decode logs to get NFT token ID
    const decodedLogs = nft.interface.parseLog(relevantLogs[0]);

    if (!decodedLogs) {
      throw new Error('No NFT contract logs found');
    }
    const tokenID = decodedLogs.args[2];

    // get the NFT metadata
    const metadata = await nft.tokenURI(tokenID);

    // get the NFT metadata from the URI
    const metadataResponse = await fetch(metadata);
    const metadataJson = await metadataResponse.json();

    // expect the name and description to be correct
    expect(metadataJson.name).to.equal('Nexus Mutual: Cover NFT');
    // We can't check the description without correctly parsing the amount (and expiry?)
    // expect(metadataJson.description).to.equal(
    //   'This NFT represents a cover purchase made for: fx Protocol + Curve + Convex \n' +
    //     '-Amount Covered: 1.07 DAI' +
    //     ' -Expiry Date: Oct 10 2024'
    // );
  });

  it('Should have cover action type', async () => {
    const actionType = await buyCover.actionType();
    expect(actionType).to.equal(actionTypes.COVER_ACTION);
  });
});
