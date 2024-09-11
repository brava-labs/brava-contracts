import { executeSafeTransaction, BuyCoverAction, IPoolAllocationRequest } from 'athena-sdk';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BuyCover, IERC20 } from '../../../typechain-types';
import { tokenConfig, NEXUS_MUTUAL_NFT_ADDRESS } from '../../constants';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';
import nexusSdk, { CoverAsset } from '@nexusmutual/sdk';
import {
  NexusMutualBuyCoverParamTypes,
  NexusMutualPoolAllocationRequestTypes,
  BuyCoverInputTypes,
} from '../../params';

describe.only('BuyCover tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let buyCover: BuyCover;
  let DAI: IERC20;
  let snapshotId: string;

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
      baseSetup.contractRegistry.getAddress(),
      baseSetup.logger.getAddress()
    );
    DAI = await ethers.getContractAt('IERC20', tokenConfig.DAI.address);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  // TODO: Change from manually encoding to using the SDK
  it('should buy cover from Nexus Mutual using ETH', async () => {
    const fundAmount = 1000; // 1000 DAI
    await signer.sendTransaction({
      to: safeAddr,
      value: ethers.parseEther('1.0'),
    });

    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase({
      productId: 152,
      coverAsset: CoverAsset.ETH,
    });

    const tx = await executeSafeTransaction(
      safeAddr,
      await buyCover.getAddress(),
      0,
      encodedFunctionCall,
      1,
      signer
    );
    await tx.wait();

    // check the coverage here
  });
  it('should buy cover from Nexus Mutual using a stablecoin', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithToken(safeAddr, 'DAI', fundAmount);

    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase({
      productId: 152,
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
      signer
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
      productId: 152,
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
      signer
    );
    await tx.wait();

    expect(await nft.balanceOf(safeAddr)).to.equal(1);
  });
});
