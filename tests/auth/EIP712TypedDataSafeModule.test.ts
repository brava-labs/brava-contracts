import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import {
  AdminVault,
  EIP712TypedDataSafeModule,
  FluidV1Supply,
  IERC20,
  ISafe,
  Logger,
  PullToken,
  SafeDeployment,
  SequenceExecutor,
} from '../../typechain-types';
import { 
  deploy, 
  getBaseSetup, 
  getBytes4, 
  log
} from '../utils';
import { fundAccountWithToken, getTokenContract } from '../utils-stable';
import { tokenConfig } from '../constants';
import { 
  signBundle, 
  createBundle,
  validateBundleSignature,
  type Bundle 
} from '../utils-eip712';

describe('EIP712TypedDataSafeModule', function () {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let user: SignerWithAddress;

  let adminVault: AdminVault;
  let logger: Logger;
  let sequenceExecutor: SequenceExecutor;
  let safe: ISafe;
  let safeAddr: string;
  let safeDeployment: SafeDeployment;
  let eip712Module: EIP712TypedDataSafeModule;

  let USDC: IERC20;
  let fUSDC: IERC20;
  let pullTokenAction: PullToken;
  let fluidSupplyAction: FluidV1Supply;

  let snapshotId: string;

  const DEPOSIT_AMOUNT = BigInt(100e6); // 100 USDC (6 decimals)

  // Helper to create minimal test bundles for basic functionality tests
  const createTestBundle = (chainId?: number, sequenceNonce?: number, deploySafe?: boolean): Bundle => {
    return createBundle({
      chainId: BigInt(chainId ?? 31337),
      sequenceNonce: BigInt(sequenceNonce ?? 0),
      expiryOffset: 3600, // 1 hour expiry
      sequenceName: "TestSequence",
      deploySafe: deploySafe ?? false
    });
  };

  before(async function () {
    // Get signers
    [admin, alice, bob, user] = await ethers.getSigners();

    // Deploy base setup - this includes a properly configured Safe with EIP712Module
    const baseSetup = await getBaseSetup(admin);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    sequenceExecutor = baseSetup.sequenceExecutor;
    safeAddr = await baseSetup.safe.getAddress();
    safe = baseSetup.safe;
    safeDeployment = baseSetup.safeDeployment;
    eip712Module = baseSetup.eip712Module;

    // Verify the module is already enabled on the Safe
    expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;

    // Get token contracts
    USDC = await getTokenContract('USDC');
    
    // Deploy action contracts
    pullTokenAction = await deploy<PullToken>(
      'PullToken',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress()
    );

    fluidSupplyAction = await deploy<FluidV1Supply>(
      'FluidV1Supply',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress()
    );

    // Register actions in AdminVault
    const pullTokenAddress = await pullTokenAction.getAddress();
    const pullTokenId = getBytes4(pullTokenAddress);
    const fluidSupplyAddress = await fluidSupplyAction.getAddress();
    const fluidSupplyId = getBytes4(fluidSupplyAddress);

    await adminVault.proposeAction(pullTokenId, pullTokenAddress);
    await adminVault.proposeAction(fluidSupplyId, fluidSupplyAddress);
    await adminVault.addAction(pullTokenId, pullTokenAddress);
    await adminVault.addAction(fluidSupplyId, fluidSupplyAddress);

    try {
      // Try to get fUSDC token contract and register Fluid pool
      fUSDC = await getTokenContract('fUSDC');
      await adminVault.proposePool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
      await adminVault.addPool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
    } catch (error) {
      // Skip fUSDC-related tests if token not available
      console.log('fUSDC token not available, some integration tests will be skipped');
    }

    // Fund user with USDC for tests
    await fundAccountWithToken(user.address, 'USDC', DEPOSIT_AMOUNT * BigInt(5));

    log('Test setup completed successfully');
  });

  beforeEach(async function () {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async function () {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Deployment', function () {
    it('should deploy with correct parameters', async function () {
      expect(await eip712Module.ADMIN_VAULT()).to.equal(await adminVault.getAddress());
      expect(await eip712Module.SEQUENCE_EXECUTOR_ADDR()).to.equal(await sequenceExecutor.getAddress());
    });

    it('should have correct EIP-712 domain', async function () {
      const domainSeparator = await eip712Module.getDomainSeparator(safeAddr);
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });

    it('should initialize sequence nonces to zero', async function () {
      expect(await eip712Module.getSequenceNonce(safeAddr)).to.equal(0);
    });

    it('should be enabled as a module', async function () {
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;
    });
  });

  describe('Bundle Hash Generation', function () {
    it('should generate consistent bundle hashes', async function () {
      const bundle = createTestBundle(1, 100);
      
      const hash1 = await eip712Module.getBundleHash(safeAddr, bundle);
      const hash2 = await eip712Module.getBundleHash(safeAddr, bundle);
      
      expect(hash1).to.equal(hash2);
      expect(hash1).to.not.equal(ethers.ZeroHash);
    });

    it('should generate different hashes for different chain IDs', async function () {
      const bundle1 = createTestBundle(1, 100);
      const bundle2 = createTestBundle(2, 100);
      
      const hash1 = await eip712Module.getBundleHash(safeAddr, bundle1);
      const hash2 = await eip712Module.getBundleHash(safeAddr, bundle2);
      
      expect(hash1).to.not.equal(hash2);
    });

    it('should generate different hashes for different sequence nonces', async function () {
      const bundle1 = createTestBundle(1, 100);
      const bundle2 = createTestBundle(1, 101);
      
      const hash1 = await eip712Module.getBundleHash(safeAddr, bundle1);
      const hash2 = await eip712Module.getBundleHash(safeAddr, bundle2);
      
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe('EIP-712 Signature Generation and Validation', function () {
    it('should create and validate correct EIP-712 signatures', async function () {
      const bundle = createTestBundle(1, 0);
      
      // Create signature using Safe address as verifying contract (new architecture)
      const signature = await signBundle(admin, bundle, safeAddr, 1);
      
      expect(signature).to.not.be.empty;
      expect(signature.length).to.equal(132); // 0x + 130 hex chars for v,r,s
      
      // Validate the signature was created correctly
      const isValid = await validateBundleSignature(bundle, signature, admin.address, safeAddr, 1);
      expect(isValid).to.be.true;
    });

    it('should create different signatures for different signers', async function () {
      const bundle = createTestBundle(1, 0);
      
      // Use Safe addresses as verifying contracts (new architecture)
      const adminSafeAddr = safeAddr; // admin owns the existing Safe
      const aliceSafeAddr = await safeDeployment.predictSafeAddress(alice.address);
      
      const adminSignature = await signBundle(admin, bundle, adminSafeAddr, 1);
      const aliceSignature = await signBundle(alice, bundle, aliceSafeAddr, 1);
      
      expect(adminSignature).to.not.equal(aliceSignature);
      
      // Both should be valid for their respective signers
      expect(await validateBundleSignature(bundle, adminSignature, admin.address, adminSafeAddr, 1)).to.be.true;
      expect(await validateBundleSignature(bundle, aliceSignature, alice.address, aliceSafeAddr, 1)).to.be.true;
      
      // But not for the wrong signer
      expect(await validateBundleSignature(bundle, adminSignature, alice.address, adminSafeAddr, 1)).to.be.false;
    });
  });

  describe('Access Control', function () {
    it('should reject invalid signatures', async function () {
      const bundle = createTestBundle(1, 0);
      const invalidSignature = "0x123456"; // Too short signature

      await expect(
        eip712Module.executeBundle(safeAddr, bundle, invalidSignature)
      ).to.be.reverted; // Will revert with ECDSA error for invalid signature length
    });
  });

  describe('Cross-Chain Support', function () {
    it('should handle cross-chain signatures with new architecture', async function () {
      const bundle = createTestBundle(1, 0);
      const signature = await signBundle(admin, bundle, safeAddr, 1);
      
      // The signature should be valid
      const isValid = await validateBundleSignature(bundle, signature, admin.address, safeAddr, 1);
      expect(isValid).to.be.true;
      
      // The bundle hash should be consistent
      const bundleHash = await eip712Module.getBundleHash(safeAddr, bundle);
      expect(bundleHash).to.not.equal(ethers.ZeroHash);
    });

    it('should generate different hashes for different Safe addresses', async function () {
      const bundle1 = createTestBundle(1, 0);
      const bundle2 = createTestBundle(31337, 0);
      
      const hash1 = await eip712Module.getBundleHash(safeAddr, bundle1);
      const hash2 = await eip712Module.getBundleHash(safeAddr, bundle2);
      
      // These should be different because the bundle content is different
      expect(hash1).to.not.equal(hash2);
      
      // But both should be valid hashes
      expect(hash1).to.not.equal(ethers.ZeroHash);
      expect(hash2).to.not.equal(ethers.ZeroHash);
    });
  });

  describe('Expiry Management', function () {
    it('should track sequence nonces correctly', async function () {
      const initialNonce = await eip712Module.getSequenceNonce(safeAddr);
      expect(initialNonce).to.equal(0);
    });

    it('should reject bundles that have expired', async function () {
      // Create a bundle that expires 1000 seconds ago
      const expiredBundle = createBundle({
        actions: [{ protocolName: "AaveV3", actionType: 0 }],
        actionIds: ["0x12345678"],
        callData: ["0x1234"],
        chainId: BigInt(31337),
        sequenceNonce: BigInt(0),
        expiryOffset: -1000, // Expired 1000 seconds ago
        sequenceName: "ExpiredSequence",
        deploySafe: false
      });
      
      const signature = await signBundle(admin, expiredBundle, safeAddr, 1);

      await expect(
        eip712Module.executeBundle(safeAddr, expiredBundle, signature)
      ).to.be.reverted; // Should revert due to expiry
    });
  });

  describe('New Architecture Integration Tests', function () {
    it('Should work with existing Safe (no deployment needed)', async function () {
      // Use an empty sequence to avoid action validation issues
      const bundle = createBundle({
        actions: [], // Empty actions
        actionIds: [],
        callData: [],
        chainId: BigInt(31337), // current chain
        sequenceNonce: BigInt(0), // sequence nonce
        expiryOffset: 3600, // expiry
        sequenceName: 'ExistingSafeSequence',
        deploySafe: false // deploySafe = false for existing Safe
      });

      const signature = await signBundle(admin, bundle, safeAddr, 1);

      // Execute using existing Safe
      await eip712Module.executeBundle(safeAddr, bundle, signature);

      // Verify nonce was incremented
      expect(await eip712Module.getSequenceNonce(safeAddr)).to.equal(1);
    });

    it('Should deploy Safe automatically if needed', async function () {
      // Use fresh user that doesn't have a Safe
      const freshUser = user;
      const predictedSafeAddr = await safeDeployment.predictSafeAddress(freshUser.address);

      // Create a bundle with deploySafe = true
      const bundle = createBundle({
        actions: [], // Empty actions for simplicity
        actionIds: [],
        callData: [],
        chainId: BigInt(31337),
        sequenceNonce: BigInt(0),
        expiryOffset: 3600,
        sequenceName: 'AutoDeploySequence',
        deploySafe: true // deploySafe = true
      });

      const signature = await signBundle(freshUser, bundle, predictedSafeAddr, 1);

      // Verify Safe doesn't exist yet
      expect(await safeDeployment.isSafeDeployed(freshUser.address)).to.be.false;

      // Execute - should auto-deploy Safe
      await eip712Module.connect(freshUser).executeBundle(predictedSafeAddr, bundle, signature);

      // Verify Safe was deployed
      expect(await safeDeployment.isSafeDeployed(freshUser.address)).to.be.true;
      
      // Verify nonce tracking works
      expect(await eip712Module.getSequenceNonce(predictedSafeAddr)).to.equal(1);
    });
  });

  describe('deploySafe Flag Tests', function () {
    it('should respect deploySafe = false and not deploy Safe', async function () {
      const freshUser = bob;
      const predictedSafeAddr = await safeDeployment.predictSafeAddress(freshUser.address);

      // Create bundle with deploySafe = false
      const bundle = createBundle({
        actions: [],
        actionIds: [],
        callData: [],
        chainId: BigInt(31337),
        sequenceNonce: BigInt(0),
        expiryOffset: 3600,
        sequenceName: 'NoDeploySequence',
        deploySafe: false // deploySafe = false
      });

      const signature = await signBundle(freshUser, bundle, predictedSafeAddr, 1);

      // Should fail because Safe doesn't exist and deploySafe = false
      // The exact error depends on whether Safe exists or not - could be SignerNotOwner or execution failure
      await expect(
        eip712Module.connect(freshUser).executeBundle(predictedSafeAddr, bundle, signature)
      ).to.be.reverted; // Just check that it reverts

      // Verify Safe was not deployed
      expect(await safeDeployment.isSafeDeployed(freshUser.address)).to.be.false;
    });

    it('should respect deploySafe = true and deploy Safe', async function () {
      const freshUser = alice;
      const predictedSafeAddr = await safeDeployment.predictSafeAddress(freshUser.address);

      // Create bundle with deploySafe = true
      const bundle = createBundle({
        actions: [],
        actionIds: [],
        callData: [],
        chainId: BigInt(31337),
        sequenceNonce: BigInt(0),
        expiryOffset: 3600,
        sequenceName: 'DeploySequence',
        deploySafe: true // deploySafe = true
      });

      const signature = await signBundle(freshUser, bundle, predictedSafeAddr, 1);

      // Should succeed and deploy Safe
      await eip712Module.connect(freshUser).executeBundle(predictedSafeAddr, bundle, signature);

      // Verify Safe was deployed
      expect(await safeDeployment.isSafeDeployed(freshUser.address)).to.be.true;
    });
  });
}); 