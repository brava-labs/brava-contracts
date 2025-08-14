import { expect } from 'chai';
import { ethers } from '..';
import { network } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  SafeDeployment,
  SafeSetupRegistry,
  AdminVault,
  Logger,
  EIP712TypedDataSafeModule,
  ISafe,
} from '../../typechain-types';
import { getBaseSetup, log } from '../utils';

describe('SafeDeployment - Simplified System', function () {
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let logger: Logger;
  let adminVault: AdminVault;
  let setupRegistry: SafeSetupRegistry;
  let safeDeployment: SafeDeployment;
  let eip712Module: EIP712TypedDataSafeModule;
  let baseSetupSafe: ISafe;

  // External Safe ecosystem addresses (hardcoded)
  const FALLBACK_HANDLER = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99';

  let snapshotId: string;

  before(async function () {
    [owner, admin, user] = await ethers.getSigners();

    // Use base setup instead of manual deployment
    const baseSetup = await getBaseSetup(owner);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    logger = baseSetup.logger;
    adminVault = baseSetup.adminVault;
    setupRegistry = baseSetup.safeSetupRegistry;
    safeDeployment = baseSetup.safeDeployment;
    eip712Module = baseSetup.eip712Module;
    baseSetupSafe = baseSetup.safe;

    // Grant OWNER_ROLE to admin signer so they can update config
    const OWNER_ROLE = ethers.id('OWNER_ROLE');
    await adminVault.grantRole(OWNER_ROLE, admin.address);
  });

  beforeEach(async function () {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async function () {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('SafeSetupRegistry - Configuration Management', function () {
    it('Should update current configuration', async function () {
      const modules = [await eip712Module.getAddress()];

      await expect(
        setupRegistry.connect(admin).updateCurrentConfig(
          FALLBACK_HANDLER,
          modules,
          ethers.ZeroAddress // guard
        )
      )
        .to.emit(setupRegistry, 'CurrentConfigurationUpdated')
        .withArgs(FALLBACK_HANDLER, modules, ethers.ZeroAddress);
    });

    it('Should get current configuration', async function () {
      const modules = [await eip712Module.getAddress()];

      await setupRegistry.connect(admin).updateCurrentConfig(
        FALLBACK_HANDLER,
        modules,
        ethers.ZeroAddress // guard
      );

      const config = await setupRegistry.getCurrentConfig();
      expect(config.fallbackHandler).to.equal(FALLBACK_HANDLER);
      expect(config.modules).to.deep.equal(modules);
      expect(config.guard).to.equal(ethers.ZeroAddress);
    });

    it('Should not allow non-admin to update configuration', async function () {
      const modules = [await eip712Module.getAddress()];

      await expect(
        setupRegistry.connect(user).updateCurrentConfig(
          FALLBACK_HANDLER,
          modules,
          ethers.ZeroAddress // guard
        )
      ).to.be.revertedWithCustomError(setupRegistry, 'AdminVault_MissingRole');
    });
  });

  describe('SafeDeployment - Core Functionality', function () {
    beforeEach(async function () {
      // Set up current configuration for each test
      const modules = [await eip712Module.getAddress()];

      await setupRegistry.connect(admin).updateCurrentConfig(
        FALLBACK_HANDLER,
        modules,
        ethers.ZeroAddress // guard
      );
    });

    it('Should deploy Safe successfully', async function () {
      const tx = await safeDeployment.connect(user).deploySafe(user.address);
      await expect(tx)
        .to.emit(safeDeployment, 'SafeDeployed')
        .withArgs(user.address, await safeDeployment.predictSafeAddress(user.address));
    });

    it('Should predict Safe address consistently', async function () {
      const predictedAddress1 = await safeDeployment.predictSafeAddress(user.address);
      const predictedAddress2 = await safeDeployment.predictSafeAddress(user.address);

      expect(predictedAddress1).to.equal(predictedAddress2);
      expect(predictedAddress1).to.not.equal(ethers.ZeroAddress);
    });

    it('Should check deployment status correctly', async function () {
      expect(await safeDeployment.isSafeDeployed(user.address)).to.be.false;

      await safeDeployment.connect(user).deploySafe(user.address);

      expect(await safeDeployment.isSafeDeployed(user.address)).to.be.true;
    });

    it('Should prevent duplicate Safe deployment', async function () {
      // First deployment should succeed
      await safeDeployment.connect(user).deploySafe(user.address);

      // Second deployment should fail
      await expect(
        safeDeployment.connect(user).deploySafe(user.address)
      ).to.be.revertedWithCustomError(safeDeployment, 'SafeDeployment_SafeAlreadyDeployed');
    });

    it('Should require valid user address', async function () {
      await expect(
        safeDeployment.connect(user).deploySafe(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(safeDeployment, 'InvalidInput');
    });

    it('Should deploy Safe with correct configuration', async function () {
      // Deploy Safe for user
      await safeDeployment.connect(user).deploySafe(user.address);

      // Verify the deployment succeeded
      expect(await safeDeployment.isSafeDeployed(user.address)).to.be.true;

      // Get the deployed Safe
      const safeAddress = await safeDeployment.predictSafeAddress(user.address);
      const deployedSafe = await ethers.getContractAt('ISafe', safeAddress);

      // Verify the Safe is configured correctly
      expect(await deployedSafe.getThreshold()).to.equal(1);
      expect(await deployedSafe.isOwner(user.address)).to.be.true;

      // Verify the module is enabled
      expect(await deployedSafe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;
    });
  });

  describe('Edge Cases and Validation', function () {
    it('Should handle empty modules array', async function () {
      const modules: string[] = [];

      await setupRegistry.connect(admin).updateCurrentConfig(
        FALLBACK_HANDLER,
        modules,
        ethers.ZeroAddress // guard
      );

      const config = await setupRegistry.getCurrentConfig();
      expect(config.modules.length).to.equal(0);
    });

    it('Should require at least fallback handler or guard or modules', async function () {
      const modules: string[] = []; // Empty modules array

      await expect(
        setupRegistry.connect(admin).updateCurrentConfig(
          ethers.ZeroAddress, // No fallback handler
          modules, // No modules
          ethers.ZeroAddress // No guard
        )
      ).to.be.revertedWithCustomError(setupRegistry, 'InvalidInput');
    });

    it('Should deploy Safe even with minimal configuration', async function () {
      // Set up minimal configuration (only fallback handler)
      await setupRegistry.connect(admin).updateCurrentConfig(
        FALLBACK_HANDLER,
        [], // No modules
        ethers.ZeroAddress // No guard
      );

      const tx = await safeDeployment.connect(user).deploySafe(user.address);
      await expect(tx).to.emit(safeDeployment, 'SafeDeployed');

      expect(await safeDeployment.isSafeDeployed(user.address)).to.be.true;
    });
  });

  describe('Integration with Base Setup', function () {
    it('Should work with base setup configuration', async function () {
      // The base setup already configures the registry, so we can deploy immediately
      const tx = await safeDeployment.connect(user).deploySafe(user.address);

      // Verify deployment worked
      await expect(tx).to.emit(safeDeployment, 'SafeDeployed');
      expect(await safeDeployment.isSafeDeployed(user.address)).to.be.true;
    });

    it('Should maintain separate state from base setup Safe', async function () {
      // The base setup already deployed a Safe for the owner
      const baseSetupSafeAddress = await baseSetupSafe.getAddress();

      // Deploy a new Safe for user
      await safeDeployment.connect(user).deploySafe(user.address);
      const userSafeAddress = await safeDeployment.predictSafeAddress(user.address);

      // Verify they are different addresses
      expect(baseSetupSafeAddress).to.not.equal(userSafeAddress);

      // Verify both Safes exist and are configured correctly
      expect(await baseSetupSafe.isOwner(owner.address)).to.be.true;

      const userSafe = await ethers.getContractAt('ISafe', userSafeAddress);
      expect(await userSafe.isOwner(user.address)).to.be.true;
    });
  });
});
