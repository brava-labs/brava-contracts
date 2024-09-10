import { executeSafeTransaction, BuyCoverAction, IPoolAllocationRequest } from 'athena-sdk';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BuyCover, IERC20 } from '../../../typechain-types';
import { tokenConfig } from '../../constants';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('BuyCover tests', () => {
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
    // await fundAccountWithToken(safeAddr, 'DAI', fundAmount);
    await signer.sendTransaction({
      to: safeAddr,
      value: ethers.parseEther('1.0'),
    });

    // We should be able to use the SDK to do this, but there seems to be a param mismatch
    // const testPayload = new BuyCoverAction(
    //   safeAddr,
    //   '150',
    //   '0',
    //   '20000000000000000000',
    //   '1',
    //   '0',
    //   '0',
    //   []
    // );
    // const testPayloadEncoded = testPayload.encodeArgsForExecuteActionCall();
    // log('testPayloadEncoded', testPayloadEncoded);

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
      owner: await signer.getAddress(),
      productId: 150,
      coverAsset: 0,
      amount: BigInt('500000000000000000'),
      period: 2592000,
      maxPremiumInAsset: BigInt('1646125793032964'),
      paymentAsset: 0,
      poolAllocationRequests: poolAllocationRequestsEncoded,
      poolId: ethers.id('0').slice(0, 10),
    };
    const paramsEncoded = abiCoder.encode(
      [
        'tuple(address owner, uint24 productId, uint8 coverAsset, uint96 amount, uint32 period, uint256 maxPremiumInAsset, uint8 paymentAsset, bytes[] poolAllocationRequests, bytes4 poolId)',
      ],
      [params]
    );

    const encodedFunctionCall = buyCover.interface.encodeFunctionData('executeAction', [
      paramsEncoded,
      [0],
      [],
      1,
    ]);

    log('encodedFunctionCall', encodedFunctionCall);

    const txResponse = await executeSafeTransaction(
      safeAddr,
      await buyCover.getAddress(),
      0,
      encodedFunctionCall,
      1,
      signer
    );

    const txReceipt = await txResponse.wait();
    log('Transaction receipt', txReceipt);

    // check ether balance of safe
    const safeBalance = await ethers.provider.getBalance(safeAddr);
    log(`Safe balance: ${ethers.formatEther(safeBalance)}`);

    // Add checks in here.
    // How's best to check the cover was bought?
    // Check we have the NFT, check the logs? check the nexus contracts?
  });

  it.skip('should buy cover from Nexus Mutual using a stablecoin', async () => {});

  it.skip('should have the NFT in the safe', async () => {});
});
