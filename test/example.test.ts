// TODO: consider using absolute imports
import { network } from 'hardhat';
import { ethers, Signer, expect } from '.';
// import { CURVE_3POOL_ADDRESS, CURVE_3POOL_INDICES, tokenConfig } from 'tests/constants';
import { getBaseSetup, log } from './utils';
import { ISafe } from '../typechain-types';
// import { executeSafeTransaction } from 'brava-ts-client';
// import { fundAccountWithToken, getStables } from './utils-stable';

// A template for a test file

describe('Some Action tests', () => {
  let signer: Signer;
  let safe: ISafe;
  let snapshotId: string;

  before(async () => {
    // Deploy base setup
    const signers = await ethers.getSigners();
    signer = signers[0]!;
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safe = baseSetup.safe;
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

  it('First test here', async () => {
    // Use signer and safe in actual test
    expect(signer).to.not.be.undefined;
    expect(safe).to.not.be.undefined;
  });
});

export {};
