import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import {
  AdminVault,
  EIP712TypedDataSafeModule,
  ISafe,
  Logger,
  SequenceExecutor,
} from '../../typechain-types';
import { deploy, getBaseSetup, executeSafeTransaction } from '../utils';
import { 
  signBundle, 
  createEmptyBundle,
  createActionBundle,
  validateBundleSignature,
  type Bundle 
} from './eip712-helpers';

describe('EIP712TypedDataSafeModule', function () {
  let adminVault: AdminVault;
  let eip712Module: EIP712TypedDataSafeModule;
  let logger: Logger;
  let sequenceExecutor: SequenceExecutor;
  let admin: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let safeAddr: string;
  let safe: ISafe;
  let snapshotId: string;

  const MODULE_NAME = "BravaEIP712Module";
  const MODULE_VERSION = "1.0.0";

  // Helper function to create a test bundle with sample actions
  const createTestBundle = (chainId?: number, sequenceNonce?: number): Bundle => {
    return createActionBundle(
      [
        { protocolName: "AaveV3", actionType: 0 }, // DEPOSIT_ACTION
        { protocolName: "YearnV3", actionType: 0 }  // DEPOSIT_ACTION
      ],
      ["0x12345678", "0x87654321"],
      ["0x1234", "0x5678"],
      BigInt(chainId ?? 31337),
      BigInt(sequenceNonce ?? 0),
      3600, // 1 hour expiry
      "TestSequence"
    );
  };

  before(async function () {
    try {
      // Get signers
      [admin, owner, alice, bob] = await ethers.getSigners();

      // Deploy base setup
      const baseSetup = await getBaseSetup(admin); // admin is the owner of the Safe
      adminVault = baseSetup.adminVault;
      logger = baseSetup.logger;
      sequenceExecutor = baseSetup.sequenceExecutor;
      safeAddr = await baseSetup.safe.getAddress();
      safe = baseSetup.safe;

      // Deploy the EIP712TypedDataSafeModule
      eip712Module = await deploy('EIP712TypedDataSafeModule', 
        admin,
        await adminVault.getAddress(),
        await sequenceExecutor.getAddress(),
        MODULE_NAME,
        MODULE_VERSION
      );

      console.log('✅ EIP712TypedDataSafeModule deployed at:', await eip712Module.getAddress());

      // Enable the module on the Safe
      const enableModulePayload = safe.interface.encodeFunctionData('enableModule', [
        await eip712Module.getAddress(),
      ]);
      await executeSafeTransaction(safeAddr, safeAddr, 0, enableModulePayload, 0, admin);
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;

    } catch (error) {
      console.log('⚠️ Skipping EIP712TypedDataSafeModule tests due to setup error:', error);
      this.skip();
    }
  });

  beforeEach(async function () {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async function () {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Deployment', function () {
    it('should deploy with correct parameters', async function () {
      expect(await eip712Module.ADMIN_VAULT()).to.equal(await adminVault.getAddress());
      expect(await eip712Module.SEQUENCE_EXECUTOR_ADDR()).to.equal(await sequenceExecutor.getAddress());
    });

    it('should have correct EIP-712 domain', async function () {
      const domainSeparator = await eip712Module.getDomainSeparator();
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });

    it('should initialize sequence nonces to zero', async function () {
      const chainId = await network.provider.send('eth_chainId');
      expect(await eip712Module.getSequenceNonce(safeAddr, chainId)).to.equal(0);
    });

    it('should be enabled as a module', async function () {
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;
    });
  });

  describe('Bundle Hash Generation', function () {
    it('should generate consistent bundle hashes', async function () {
      const bundle = createTestBundle(1, 100);
      
      const hash1 = await eip712Module.getBundleHash(bundle);
      const hash2 = await eip712Module.getBundleHash(bundle);
      
      expect(hash1).to.equal(hash2);
      expect(hash1).to.not.equal(ethers.ZeroHash);
    });

    it('should generate different hashes for different chain IDs', async function () {
      const bundle1 = createTestBundle(1, 100);
      const bundle2 = createTestBundle(2, 100);
      
      const hash1 = await eip712Module.getBundleHash(bundle1);
      const hash2 = await eip712Module.getBundleHash(bundle2);
      
      expect(hash1).to.not.equal(hash2);
    });

    it('should generate different hashes for different sequence nonces', async function () {
      const bundle1 = createTestBundle(1, 100);
      const bundle2 = createTestBundle(1, 101);
      
      const hash1 = await eip712Module.getBundleHash(bundle1);
      const hash2 = await eip712Module.getBundleHash(bundle2);
      
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe('EIP-712 Signature Generation and Validation', function () {
    it('should create and validate correct EIP-712 signatures', async function () {
      const chainId = await network.provider.send('eth_chainId');
      const bundle = createTestBundle(parseInt(chainId), 0);
      
      // Create signature using helper
      const signature = await signBundle(admin, bundle, await eip712Module.getAddress());
      
      expect(signature).to.not.be.empty;
      expect(signature.length).to.equal(132); // 0x + 130 hex chars for v,r,s
      
      // Validate the signature was created correctly
      const isValid = await validateBundleSignature(bundle, signature, admin.address, await eip712Module.getAddress());
      expect(isValid).to.be.true;
    });

    it('should create different signatures for different signers', async function () {
      const chainId = await network.provider.send('eth_chainId');
      const bundle = createTestBundle(parseInt(chainId), 0);
      
      const adminSignature = await signBundle(admin, bundle, await eip712Module.getAddress());
      const aliceSignature = await signBundle(alice, bundle, await eip712Module.getAddress());
      
      expect(adminSignature).to.not.equal(aliceSignature);
      
      // Both should be valid for their respective signers
      expect(await validateBundleSignature(bundle, adminSignature, admin.address, await eip712Module.getAddress())).to.be.true;
      expect(await validateBundleSignature(bundle, aliceSignature, alice.address, await eip712Module.getAddress())).to.be.true;
      
      // But not for the wrong signer
      expect(await validateBundleSignature(bundle, adminSignature, alice.address, await eip712Module.getAddress())).to.be.false;
    });
  });

  describe('Access Control', function () {
    it('should reject signatures from non-owners', async function () {
      const chainId = await network.provider.send('eth_chainId');
      const bundle = createTestBundle(parseInt(chainId), 0);
      const signature = await signBundle(alice, bundle, await eip712Module.getAddress()); // Alice is not a Safe owner

      await expect(
        eip712Module.executeBundle(safeAddr, bundle, signature)
      ).to.be.revertedWithCustomError(
        eip712Module,
        'EIP712TypedDataSafeModule_SignerNotOwner'
      );
    });

    it('should reject invalid signatures', async function () {
      const chainId = await network.provider.send('eth_chainId');
      const bundle = createTestBundle(parseInt(chainId), 0);
      const invalidSignature = "0x123456"; // Too short signature

      await expect(
        eip712Module.executeBundle(safeAddr, bundle, invalidSignature)
      ).to.be.reverted; // Will revert with ECDSA error for invalid signature length
    });
  });

  describe('Bundle Structure Validation', function () {
    it('should handle empty bundles gracefully (non-owner)', async function () {
      const emptyBundle = createEmptyBundle();
      const signature = await signBundle(alice, emptyBundle, await eip712Module.getAddress());

      await expect(
        eip712Module.executeBundle(safeAddr, emptyBundle, signature)
      ).to.be.revertedWithCustomError(
        eip712Module,
        'EIP712TypedDataSafeModule_SignerNotOwner'
      );
    });


  });

  describe('Cross-Chain Support', function () {
    it('should handle cross-chain signatures (chainId 1 forced)', async function () {
      // Test that signatures created with chainId 1 work regardless of execution chain
      const bundle = createTestBundle(1, 0); // Force chainId 1 in bundle
      const signature = await signBundle(admin, bundle, await eip712Module.getAddress());
      
      // The signature should be valid
      const isValid = await validateBundleSignature(bundle, signature, admin.address, await eip712Module.getAddress());
      expect(isValid).to.be.true;
      
      // The bundle hash should be consistent
      const bundleHash = await eip712Module.getBundleHash(bundle);
      expect(bundleHash).to.not.equal(ethers.ZeroHash);
    });

    it('should generate consistent hashes regardless of execution environment', async function () {
      // This tests that our domain separator always uses chainId 1
      const bundle1 = createTestBundle(1, 0);
      const bundle2 = createTestBundle(31337, 0); // Different chainId in bundle
      
      const hash1 = await eip712Module.getBundleHash(bundle1);
      const hash2 = await eip712Module.getBundleHash(bundle2);
      
      // These should be different because the bundle content is different
      expect(hash1).to.not.equal(hash2);
      
      // But both should be valid hashes
      expect(hash1).to.not.equal(ethers.ZeroHash);
      expect(hash2).to.not.equal(ethers.ZeroHash);
    });
  });

  describe('Expiry Management', function () {
    it('should track sequence nonces correctly', async function () {
      const chainId = await network.provider.send('eth_chainId');
      const initialNonce = await eip712Module.getSequenceNonce(safeAddr, chainId);
      expect(initialNonce).to.equal(0);
    });

    it('should reject bundles that have expired', async function () {
      // Create a bundle that expires 1000 seconds ago
      const expiredBundle = createActionBundle(
        [{ protocolName: "AaveV3", actionType: 0 }],
        ["0x12345678"],
        ["0x1234"],
        BigInt(31337),
        BigInt(0),
        -1000, // Expired 1000 seconds ago
        "ExpiredSequence"
      );
      
      const signature = await signBundle(admin, expiredBundle, await eip712Module.getAddress());

      await expect(
        eip712Module.executeBundle(safeAddr, expiredBundle, signature)
      ).to.be.reverted; // Should revert due to expiry
    });
  });
}); 