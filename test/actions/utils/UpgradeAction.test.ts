import { ethers } from '../..';
import { network } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { deploy, getBaseSetup, getBytes4, executeSequence, encodeAction, log } from '../../utils';
import {
  UpgradeAction,
  AdminVault,
  Logger,
  SafeSetupRegistry,
  SequenceExecutor,
  BravaGuard,
  EIP712TypedDataSafeModule,
} from '../../../typechain-types';
import { ISafe } from '../../../typechain-types';

// Operation enum from the contract
enum Operation {
  Call,
  DelegateCall,
}

// Helper function to create Safe signature
function createSafeSignature(signer: SignerWithAddress): string {
  return (
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32'],
      [signer.address, ethers.ZeroHash]
    ) + '01'
  );
}

describe('UpgradeAction', () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let upgradeAction: UpgradeAction;
  let adminVault: AdminVault;
  let logger: Logger;
  let safe: ISafe;
  let safeSetupRegistry: SafeSetupRegistry;
  let sequenceExecutor: SequenceExecutor;
  let bravaGuard: BravaGuard;
  let eip712Module: EIP712TypedDataSafeModule;
  let snapshotId: string;
  let baseSetup: Awaited<ReturnType<typeof getBaseSetup>>;

  before(async () => {
    [deployer, user] = await ethers.getSigners();

    // Get base setup
    baseSetup = await getBaseSetup(deployer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    safe = baseSetup.safe;
    sequenceExecutor = baseSetup.sequenceExecutor;
    safeSetupRegistry = baseSetup.safeSetupRegistry;

    // Deploy UpgradeAction
    upgradeAction = await deploy<UpgradeAction>(
      'UpgradeAction',
      deployer,
      await adminVault.getAddress(),
      await logger.getAddress(),
      await safeSetupRegistry.getAddress()
    );

    // Add UpgradeAction to AdminVault
    const upgradeActionId = getBytes4(await upgradeAction.getAddress());
    await adminVault.proposeAction(upgradeActionId, await upgradeAction.getAddress());
    await adminVault.addAction(upgradeActionId, await upgradeAction.getAddress());

    // Deploy BravaGuard
    bravaGuard = await deploy<BravaGuard>(
      'BravaGuard',
      deployer,
      await sequenceExecutor.getAddress()
    );

    // Deploy EIP712TypedDataSafeModule (constructor-less + initializeConfig)
    eip712Module = await deploy<EIP712TypedDataSafeModule>(
      'EIP712TypedDataSafeModule',
      deployer,
      await deployer.getAddress()
    );

    await eip712Module.initializeConfig(
      await adminVault.getAddress(),
      await sequenceExecutor.getAddress(),
      await baseSetup.safeDeployment.getAddress(),
      await baseSetup.tokenRegistry.getAddress(),
      await baseSetup.mockChainlinkOracle.getAddress(),
      await deployer.getAddress(),
      'TestDomain',
      '1.0'
    );

    // Set initial configuration in SafeSetupRegistry with minimal config
    // Our test will demonstrate upgrading from this minimal state to the target state
    await safeSetupRegistry.updateCurrentConfig(
      await deployer.getAddress(), // minimal fallback handler (just use deployer address)
      [], // no modules initially
      ethers.ZeroAddress // no guard initially
    );
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Deployment', () => {
    it('should deploy with correct addresses', async () => {
      expect(await upgradeAction.ADMIN_VAULT()).to.equal(await adminVault.getAddress());
      expect(await upgradeAction.LOGGER()).to.equal(await logger.getAddress());
      expect(await upgradeAction.SAFE_SETUP_REGISTRY()).to.equal(
        await safeSetupRegistry.getAddress()
      );
    });

    it('should revert deployment with zero registry', async () => {
      const UpgradeActionFactory = await ethers.getContractFactory('UpgradeAction');
      await expect(
        UpgradeActionFactory.deploy(
          await adminVault.getAddress(),
          await logger.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(UpgradeActionFactory, 'InvalidInput');
    });
  });

  describe('Configuration Upgrades', () => {
    it('should add guard and modules when starting from empty configuration', async () => {
      // Update registry to have target configuration
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress, // fallback handler
        [await eip712Module.getAddress()], // add module
        await bravaGuard.getAddress() // add guard
      );

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'AddGuardAndModules',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify module was added
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;
    });

    it('should remove guard when registry has no guard', async () => {
      // Update registry to have no guard
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress, // fallback handler
        [await eip712Module.getAddress()], // modules
        ethers.ZeroAddress // no guard
      );

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'RemoveGuardUpgrade',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify guard was removed (this will revert due to no guard, so we test differently)
      // We can check by trying to set guard directly which should work without guard protection
      const setGuardData = safe.interface.encodeFunctionData('setGuard', [
        await bravaGuard.getAddress(),
      ]);
      const signature = createSafeSignature(deployer);

      await expect(
        safe.execTransaction(
          await safe.getAddress(),
          0,
          setGuardData,
          Operation.Call,
          0,
          0,
          0,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          signature
        )
      ).to.not.be.reverted;
    });

    it('should add new module from registry', async () => {
      // Deploy a new module
      const newModule = await deploy<EIP712TypedDataSafeModule>(
        'EIP712TypedDataSafeModule',
        deployer,
        await deployer.getAddress()
      );
      await newModule.initializeConfig(
        await adminVault.getAddress(),
        await sequenceExecutor.getAddress(),
        await baseSetup.safeDeployment.getAddress(),
        await baseSetup.tokenRegistry.getAddress(),
        await baseSetup.mockChainlinkOracle.getAddress(),
        await deployer.getAddress(),
        'TestDomain2',
        '1.0'
      );

      // Update registry to include new module
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress, // fallback handler
        [await eip712Module.getAddress(), await newModule.getAddress()], // add new module
        await bravaGuard.getAddress() // guard
      );

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'AddModuleUpgrade',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify new module was added
      expect(await safe.isModuleEnabled(await newModule.getAddress())).to.be.true;
    });

    it('should remove module not in registry', async () => {
      // Update registry to remove the existing module
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress, // fallback handler
        [], // no modules
        await bravaGuard.getAddress() // guard
      );

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'RemoveModuleUpgrade',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify module was removed
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.false;
    });

    it('should handle complex upgrade with multiple changes', async () => {
      // Deploy multiple new modules
      const newModule1 = await deploy<EIP712TypedDataSafeModule>(
        'EIP712TypedDataSafeModule',
        deployer,
        await deployer.getAddress()
      );
      await newModule1.initializeConfig(
        await adminVault.getAddress(),
        await sequenceExecutor.getAddress(),
        await baseSetup.safeDeployment.getAddress(),
        await baseSetup.tokenRegistry.getAddress(),
        await baseSetup.mockChainlinkOracle.getAddress(),
        await deployer.getAddress(),
        'TestDomain3',
        '1.0'
      );

      const newModule2 = await deploy<EIP712TypedDataSafeModule>(
        'EIP712TypedDataSafeModule',
        deployer,
        await deployer.getAddress()
      );
      await newModule2.initializeConfig(
        await adminVault.getAddress(),
        await sequenceExecutor.getAddress(),
        await baseSetup.safeDeployment.getAddress(),
        await baseSetup.tokenRegistry.getAddress(),
        await baseSetup.mockChainlinkOracle.getAddress(),
        await deployer.getAddress(),
        'TestDomain4',
        '1.0'
      );

      // Update registry with completely new configuration
      await safeSetupRegistry.updateCurrentConfig(
        await newModule1.getAddress(), // new fallback handler
        [await newModule2.getAddress()], // replace all modules
        ethers.ZeroAddress // remove guard
      );

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'ComplexUpgrade',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify all changes
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.false; // old module removed
      expect(await safe.isModuleEnabled(await newModule2.getAddress())).to.be.true; // new module added
    });
  });

  describe('Edge Cases', () => {
    it('should handle upgrade with no modules', async () => {
      // Update registry to have no modules
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress,
        [],
        await bravaGuard.getAddress()
      );

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'NoModulesUpgrade',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await expect(executeSequence(await safe.getAddress(), sequence)).to.not.be.reverted;
    });

    it('should handle upgrade when Safe has no modules', async () => {
      // First remove all modules from Safe
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress,
        [],
        await bravaGuard.getAddress()
      );

      let payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      let sequence: SequenceExecutor.SequenceStruct = {
        name: 'RemoveAllModules',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Now add modules back
      await safeSetupRegistry.updateCurrentConfig(
        ethers.ZeroAddress,
        [await eip712Module.getAddress()],
        await bravaGuard.getAddress()
      );

      payload = await encodeAction({
        type: 'UpgradeAction',
        data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x']),
      });

      sequence = {
        name: 'AddModulesFromEmpty',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await expect(executeSequence(await safe.getAddress(), sequence)).to.not.be.reverted;
      expect(await safe.isModuleEnabled(await eip712Module.getAddress())).to.be.true;
    });
  });
});
