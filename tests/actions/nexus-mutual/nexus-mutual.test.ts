import { executeSafeTransaction } from 'athena-sdk';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BuyCover, IERC20 } from '../../../typechain-types';
import { tokenConfig } from '../../constants';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithStablecoin } from '../../utils-stable';

// AI generated test, this doesn't work yet

describe.skip('NexusBuyCover tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let buyCover: BuyCover;
  let DAI: IERC20;
  let snapshotId: string;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;
    log('Safe Address', safeAddr);

    buyCover = await deploy(
      'NexusBuyCover',
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

  // Skip this until it's implemented properly
  it.skip('should buy cover from Nexus Mutual', async () => {
    const fundAmount = 1000; // 1000 DAI
    await fundAccountWithStablecoin(safeAddr, 'DAI', fundAmount);

    const initialDaiBalance = await DAI.balanceOf(safeAddr);
    expect(initialDaiBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 18));

    const abiCoder = new ethers.AbiCoder();

    const poolAllocationRequest = {
      poolId: 23,
      skip: false,
      coverAmountInAsset: BigInt('500196398981878329'),
    };

    const poolAllocationRequestsEncoded = [
      abiCoder.encode(
        ['tuple(uint40 poolId, bool skip, uint256 coverAmountInAsset)'],
        [poolAllocationRequest]
      ),
    ];

    const params = {
      owner: safeAddr,
      productId: 150,
      coverAsset: 0,
      amount: BigInt('500000000000000000'),
      period: 2592000,
      maxPremiumInAsset: BigInt('1646125793032964'),
      paymentAsset: 0,
      poolAllocationRequests: poolAllocationRequestsEncoded,
    };

    const paramsEncoded = abiCoder.encode(
      [
        'tuple(address owner, uint256 productId, uint256 coverAsset, uint256 amount, uint256 period, uint256 maxPremiumInAsset, uint256 paymentAsset, bytes[] poolAllocationRequests)',
      ],
      [params]
    );

    const buyCoverAddress = await buyCover.getAddress();
    const encodedFunctionCall = buyCover.interface.encodeFunctionData('executeAction', [
      paramsEncoded,
      [0, 0, 0, 0, 0, 0, 0, 0],
      [],
      0,
    ]);

    // Approve DAI spending
    await DAI.connect(signer).approve(safeAddr, params.amount);

    // Execute buy cover
    await executeSafeTransaction(safeAddr, buyCoverAddress, 0, encodedFunctionCall, 1, signer);

    // Check balances after buying cover
    const finalDaiBalance = await DAI.balanceOf(safeAddr);

    expect(finalDaiBalance).to.be.lt(initialDaiBalance);

    // TODO: Add more specific checks, such as verifying the cover was actually purchased
    // This might involve interacting with Nexus Mutual contracts to check cover status
  });
});

export { };

