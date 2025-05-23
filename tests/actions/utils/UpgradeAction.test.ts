import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  deploy,
  getBaseSetup,
  getBytes4,
  executeAction,
  executeSequence,
  encodeAction,
  log,
} from '../../utils';
import {
  UpgradeAction,
  AdminVault,
  Logger,
  TransactionRegistry,
  SequenceExecutor,
  BravaGuard,
} from '../../../typechain-types';
import { ISafe } from '../../../typechain-types/contracts/interfaces/safe/ISafe';

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
  let transactionRegistry: TransactionRegistry;
  let sequenceExecutor: SequenceExecutor;
  let bravaGuard: BravaGuard;
  let snapshotId: string;

  before(async () => {
    [deployer, user] = await ethers.getSigners();

    // Get base setup
    const baseSetup = await getBaseSetup(deployer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    safe = baseSetup.safe;
    sequenceExecutor = baseSetup.sequenceExecutor;

    // Deploy TransactionRegistry
    transactionRegistry = await deploy<TransactionRegistry>(
      'TransactionRegistry',
      deployer,
      await adminVault.getAddress(),
      await logger.getAddress()
    );

    // Deploy UpgradeAction
    upgradeAction = await deploy<UpgradeAction>(
      'UpgradeAction',
      deployer,
      await adminVault.getAddress(),
      await logger.getAddress(),
      await transactionRegistry.getAddress()
    );

    // Grant roles to transaction registry
    const TRANSACTION_PROPOSER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_PROPOSER_ROLE')
    );
    const TRANSACTION_EXECUTOR_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_EXECUTOR_ROLE')
    );
    await adminVault.grantRole(TRANSACTION_PROPOSER_ROLE, deployer.address);
    await adminVault.grantRole(TRANSACTION_EXECUTOR_ROLE, deployer.address);

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

    // Set guard on Safe through execTransaction
    const setGuardData = safe.interface.encodeFunctionData('setGuard', [
      await bravaGuard.getAddress(),
    ]);
    const signature = createSafeSignature(deployer);

    await safe.execTransaction(
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
      expect(await upgradeAction.TRANSACTION_REGISTRY()).to.equal(
        await transactionRegistry.getAddress()
      );
    });

    it('should revert deployment with zero transaction registry', async () => {
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

  describe('Action Execution', () => {
    it('should revert if transaction is not approved', async () => {
      const data = safe.interface.encodeFunctionData('setGuard', [ethers.ZeroAddress]);

      const payload = await encodeAction({
        type: 'UpgradeAction',
        data,
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'NotApprovedSequence',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await expect(executeSequence(await safe.getAddress(), sequence)).to.be.revertedWith(
        'GS013'
      );
    });

    it('should execute approved transaction to remove guard', async () => {
      // Removing the guard is the minimum we need to be able to make other admin changes.

      // Calculate the guard storage slot for verification
      const guardSlot = ethers.keccak256(ethers.toUtf8Bytes('guard_manager.guard.address'));

      // Verify initial guard is set
      const initialGuardAddress = await ethers.provider.getStorage(
        await safe.getAddress(),
        guardSlot
      );
      const actualInitialGuardAddress = ethers.getAddress('0x' + initialGuardAddress.slice(-40));
      expect(actualInitialGuardAddress).to.equal(await bravaGuard.getAddress());

      // Now remove the guard through the upgrade action
      const data = safe.interface.encodeFunctionData('setGuard', ['0x60dBc1735ad834dD8206F1089E24b3B21BD10604']);

      // Calculate and approve transaction hash
      const txHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [data]));

      // Propose and approve the transaction through TransactionRegistry
      await transactionRegistry.proposeTransaction(txHash);
      await transactionRegistry.approveTransaction(txHash);

      // Execute the upgrade action through sequence executor
      const payload = await encodeAction({
        type: 'UpgradeAction',
        data,
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'RemoveGuardSequence',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify guard was removed
      const finalGuardAddress = await ethers.provider.getStorage(
        await safe.getAddress(),
        guardSlot
      );
      const actualGuardAddress = ethers.getAddress('0x' + finalGuardAddress.slice(-40));
      expect(actualGuardAddress).to.equal('0x60dBc1735ad834dD8206F1089E24b3B21BD10604');
    });

    it('should execute approved transaction to set new FallbackHandler', async () => {
      // To save creating our own, this is the cowswap one, which is a known good one.
      //   we probably wouldn't use this in production, but it's a good test of changing the fallback handler.
      const newFallbackHandler = '0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5';

      const data = safe.interface.encodeFunctionData('setFallbackHandler', [newFallbackHandler]);

      // Calculate and approve transaction hash
      const txHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [data]));

      // Propose and approve the transaction through TransactionRegistry
      await transactionRegistry.proposeTransaction(txHash);
      await transactionRegistry.approveTransaction(txHash);

      // Execute the upgrade action through sequence executor
      const payload = await encodeAction({
        type: 'UpgradeAction',
        data,
      });

      const sequence: SequenceExecutor.SequenceStruct = {
        name: 'SetFallbackHandlerSequence',
        callData: [payload],
        actionIds: [getBytes4(await upgradeAction.getAddress())],
      };

      await executeSequence(await safe.getAddress(), sequence);

      // Verify new fallback handler is set by checking storage slot
      // The fallback handler slot is at keccak256("fallback_manager.handler.address")
      const fallbackHandlerSlot = ethers.keccak256(
        ethers.toUtf8Bytes('fallback_manager.handler.address')
      );
      const fallbackHandlerAddress = await ethers.provider.getStorage(
        await safe.getAddress(),
        fallbackHandlerSlot
      );
      const actualFallbackHandler = ethers.getAddress('0x' + fallbackHandlerAddress.slice(-40));
      expect(actualFallbackHandler).to.equal(newFallbackHandler);
    });
  });
});
