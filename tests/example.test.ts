// TODO: consider using absolute imports
import { network } from 'hardhat';
import { ethers, Signer } from '.';
// import { CURVE_3POOL_ADDRESS, CURVE_3POOL_INDICES, tokenConfig } from 'tests/constants';
import { getBaseSetup, log } from '../tests/utils';
// import { executeSafeTransaction } from 'athenafi-ts-client';
// import { fundAccountWithToken, getStables } from 'tests/utils-stable';

// A template for a test file

describe('Some Action tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let snapshotId: string;

  before(async () => {
    // Deploy base setup
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;
    // Deploy contracts specific to these tests below here using deploy()

    // Take local snapshot before running tests
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {});

  afterEach(async () => {
    // Revert local snapshot after each test
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  it('First test here', async () => {});
  // Put all your first test here
});

export { };

