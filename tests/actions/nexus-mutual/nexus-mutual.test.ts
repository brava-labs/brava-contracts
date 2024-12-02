import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BuyCover } from '../../../typechain-types';
import { NEXUS_MUTUAL_NFT_ADDRESS } from '../../constants';
import { deploy, getBaseSetup, log, executeAction, getBytes4, decodeLoggerLog } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';
import { CoverAsset } from '@nexusmutual/sdk';
import { actionTypes, ActionArgs } from '../../actions';
import { ACTION_LOG_IDS } from '../../logs';

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
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  it('should buy cover from Nexus Mutual using ETH', async () => {
    await signer.sendTransaction({
      to: safeAddr,
      value: ethers.parseEther('2.0'),
    });

    const nft = await ethers.getContractAt('IERC721', NEXUS_MUTUAL_NFT_ADDRESS);
    expect(await nft.balanceOf(safeAddr)).to.equal(0);

    const buyCoverArgs: ActionArgs = {
      type: 'BuyCover',
      productId: 156,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.ETH,
      coverAddress: safeAddr,
    };

    const tx = await executeAction({ ...buyCoverArgs });
    const receipt = await tx.wait();
    
    // Log gas used
    console.log(`Gas used for ETH cover purchase: ${receipt?.gasUsed}`);

    expect(await nft.balanceOf(safeAddr)).to.equal(1);
  });

  it('should buy cover from Nexus Mutual using a stablecoin', async () => {
    // Currently only DAI works (Nexus Mutual doesn't support USDT and their USDC is broken)
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
    const receipt = await tx.wait();
    
    // Log gas used
    console.log(`Gas used for DAI cover purchase: ${receipt?.gasUsed}`);

    expect(await nft.balanceOf(safeAddr)).to.equal(1);
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

  it('Should emit the correct log', async () => {
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

    log('Executing action...');
    const tx = await executeAction({ ...buyCoverArgs });
    const receipt = await tx.wait();
    log('Tx executed', receipt);
    const logs = await decodeLoggerLog(receipt!);
    log('Logs:', logs);

    expect(logs).to.have.length(1);
    expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BUY_COVER));
    expect(logs[0]).to.have.property('strategyId', BigInt(1));
    expect(logs[0]).to.have.property('period', (28 * 24 * 60 * 60).toString());
    expect(logs[0]).to.have.property('amount', ethers.parseUnits('1.0', 18).toString());
    expect(logs[0]).to.have.property('coverId');
  });

  it('Should have cover action type', async () => {
    const actionType = (await buyCover.actionType()) as bigint;
    expect(actionType).to.equal(BigInt(actionTypes.COVER_ACTION));
  });
});
