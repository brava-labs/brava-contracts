import { executeSafeTransaction, BuyCoverAction } from 'athena-sdk';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BuyCover } from '../../../typechain-types';
import { tokenConfig, NEXUS_MUTUAL_NFT_ADDRESS, actionTypes } from '../../constants';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';
import nexusSdk, { CoverAsset } from '@nexusmutual/sdk';
import {
  NexusMutualBuyCoverParamTypes,
  NexusMutualPoolAllocationRequestTypes,
  BuyCoverInputTypes,
} from '../../params';
import { Log } from 'ethers';

describe('BuyCover tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let buyCover: BuyCover;
  let snapshotId: string;

  // TODO: Change from manually encoding to using the SDK
  async function prepareNexusMutualCoverPurchase(
    options: {
      productId?: number;
      amountToInsure?: string;
      daysToInsure?: number;
      coverAsset?: CoverAsset;
      coverOwnerAddress?: string;
    } = {}
  ) {
    // set some defaults
    const {
      productId = 152, // this pool allows all payment types
      amountToInsure = '1.0',
      daysToInsure = 28,
      coverAsset = CoverAsset.DAI,
      coverOwnerAddress = safeAddr,
    } = options;

    const response = await nexusSdk.getQuoteAndBuyCoverInputs(
      productId,
      ethers.parseEther(amountToInsure).toString(),
      daysToInsure,
      coverAsset,
      coverOwnerAddress
    );

    if (!response.result) {
      throw new Error(
        `Failed to prepare Nexus Mutual cover purchase: ${
          response.error?.message || 'Unknown error'
        }`
      );
    }

    const { buyCoverParams, poolAllocationRequests } = response.result.buyCoverInput;

    const abiCoder = new ethers.AbiCoder();
    const buyCoverParamsEncoded = abiCoder.encode(
      [NexusMutualBuyCoverParamTypes],
      [buyCoverParams]
    );
    const poolAllocationRequestsEncoded = poolAllocationRequests.map((request) =>
      abiCoder.encode([NexusMutualPoolAllocationRequestTypes], [request])
    );

    const encodedParamsCombined = abiCoder.encode(
      [BuyCoverInputTypes],
      [
        {
          owner: coverOwnerAddress,
          buyCoverParams: buyCoverParamsEncoded,
          poolAllocationRequests: poolAllocationRequestsEncoded,
        },
      ]
    );

    const encodedFunctionCall = buyCover.interface.encodeFunctionData('executeAction', [
      encodedParamsCombined,
      [0],
      [],
      1,
    ]);

    return {
      encodedFunctionCall,
      buyCoverParams,
      poolAllocationRequests,
    };
  }

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;
    log('Safe Address', safeAddr);

    buyCover = await deploy(
      'BuyCover',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      await baseSetup.logger.getAddress()
    );
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
      value: ethers.parseEther('1.0'),
    });

    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase({
      productId: 231,
      coverAsset: CoverAsset.ETH,
    });

    const tx = await executeSafeTransaction(
      safeAddr,
      await buyCover.getAddress(),
      0,
      encodedFunctionCall,
      1,
      signer,
      {
        safeTxGas: 2000000,
      }
    );
    await tx.wait();

    // check the coverage here
  });
  it('should buy cover from Nexus Mutual using a stablecoin', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase({
      productId: 231,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.DAI,
    });

    const tx = await executeSafeTransaction(
      safeAddr,
      await buyCover.getAddress(),
      0,
      encodedFunctionCall,
      1,
      signer,
      {
        safeTxGas: 2000000,
      }
    );
    await tx.wait();

    // check the coverage here
  });

  it('should have the NFT in the safe', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const nft = await ethers.getContractAt('IERC721', NEXUS_MUTUAL_NFT_ADDRESS);
    expect(await nft.balanceOf(safeAddr)).to.equal(0);

    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase({
      productId: 231,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.DAI,
    });

    const tx = await executeSafeTransaction(
      safeAddr,
      await buyCover.getAddress(),
      0,
      encodedFunctionCall,
      1,
      signer,
      {
        safeTxGas: 2000000,
      }
    );
    await tx.wait();

    expect(await nft.balanceOf(safeAddr)).to.equal(1);
  });

  it('should have the correct data in the NFT', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const nft = await ethers.getContractAt('IERC721', NEXUS_MUTUAL_NFT_ADDRESS);
    expect(await nft.balanceOf(safeAddr)).to.equal(0);

    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase({
      productId: 231,
      amountToInsure: '1.0',
      daysToInsure: 28,
      coverAsset: CoverAsset.DAI,
    });

    const tx = await executeSafeTransaction(
      safeAddr,
      await buyCover.getAddress(),
      0,
      encodedFunctionCall,
      1,
      signer,
      {
        safeTxGas: 2000000,
      }
    );

    const receipt = await tx.wait();

    expect(await nft.balanceOf(safeAddr)).to.equal(1);

    // filter relevant logs
    const relevantLogs = receipt.logs.filter(
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
    // We can't check the description without correctly pasing the amount (and expiry?)
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
