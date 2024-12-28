import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  deploy,
  encodeAction,
  executeSequence,
  getBaseSetup,
  getBytes4,
  deploySafe
} from '../utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  BravaGuard,
  TransactionRegistry,
  SequenceExecutor,
  AdminVault,
  Logger,
  Proxy
} from '../../typechain-types';
import { ISafe } from '../../typechain-types/contracts/interfaces/safe/ISafe';
import { SAFE_PROXY_FACTORY_ADDRESS, tokenConfig } from '../constants';
import { fundAccountWithToken } from '../utils-stable';

// Operation enum from the contract
enum Operation {
  Call,
  DelegateCall,
}

// Helper function to generate role bytes
function getRoleBytes(role: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(role));
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

// Helper function to calculate transaction hash
function calculateTransactionHash(
  data: string,
  operation: Operation
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['bytes', 'uint8'],
      [data, operation]
    )
  );
}

describe('BravaGuard', () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let alice: SignerWithAddress;
  let bravaGuard: BravaGuard;
  let transactionRegistry: TransactionRegistry;
  let sequenceExecutor: SequenceExecutor;
  let adminVault: AdminVault;
  let safe: ISafe;
  let logger: Logger;
  beforeEach(async () => {
    [deployer, user, alice] = await ethers.getSigners();

    // Get base setup with AdminVault
    const baseSetup = await getBaseSetup(deployer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    adminVault = baseSetup.adminVault;
    safe = baseSetup.safe;
    logger = baseSetup.logger;
    sequenceExecutor = baseSetup.sequenceExecutor;

    // Deploy additional contracts
    transactionRegistry = await deploy<TransactionRegistry>(
      'TransactionRegistry',
      deployer,
      await adminVault.getAddress(),
      await logger.getAddress()
    );
    bravaGuard = await deploy<BravaGuard>(
      'BravaGuard',
      deployer,
      await sequenceExecutor.getAddress(),
      await transactionRegistry.getAddress()
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

  describe('Deployment', () => {
    it('should deploy with correct addresses', async () => {
      expect(await bravaGuard.SEQUENCE_EXECUTOR()).to.equal(await sequenceExecutor.getAddress());
      expect(await bravaGuard.ADMIN_VAULT()).to.equal(await transactionRegistry.getAddress());
    });

    it('should revert deployment with zero addresses', async () => {
      const BravaGuard = await ethers.getContractFactory('BravaGuard');
      await expect(
        BravaGuard.deploy(ethers.ZeroAddress, await transactionRegistry.getAddress())
      ).to.be.revertedWithCustomError(bravaGuard, 'BravaGuard_InvalidAddress');
      await expect(
        BravaGuard.deploy(await sequenceExecutor.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bravaGuard, 'BravaGuard_InvalidAddress');
    });
  });

  describe('Transaction Validation', () => {
    it('should allow transactions to sequence executor', async () => {
      const fluidSupplyContract = await deploy(
        'FluidSupply',
        deployer,
        await adminVault.getAddress(),
        await logger.getAddress()
      );
      const fluidSupplyAddress = await fluidSupplyContract.getAddress();
      await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.proposePool('Fluid', tokenConfig.fUSDC.address);
      await adminVault.addPool('Fluid', tokenConfig.fUSDC.address);

      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(await safe.getAddress(), token, amount);

      const payload = await encodeAction({
        type: 'FluidSupply',
        amount,
      });

      await executeSequence(await safe.getAddress(), {
        name: 'FluidSupplySequence',
        callData: [payload],
        actionIds: [getBytes4(fluidSupplyAddress)],
      }, false);
      
    });

    it('should allow pre-approved admin transactions', async () => {
      const tx = {
        to: await safe.getAddress(),
        value: 0,
        data: safe.interface.encodeFunctionData('setGuard', [ethers.ZeroAddress]),
        operation: Operation.Call,
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
      };

      // Calculate the guard storage slot
      const guardSlot = ethers.keccak256(ethers.toUtf8Bytes("guard_manager.guard.address"));
      

      const signature = createSafeSignature(deployer);

      // Should fail because this is not a pre-approved transaction
      await expect(
        safe.execTransaction(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.safeTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          signature
        )
      ).to.be.revertedWithCustomError(bravaGuard, 'BravaGuard_TransactionNotAllowed');

      const txHash = calculateTransactionHash(tx.data, tx.operation);

      // Propose and approve the transaction (testing delay is zero)
      await transactionRegistry.proposeTransaction(txHash);
      await transactionRegistry.approveTransaction(txHash);

      const isApproved = await transactionRegistry.isApprovedTransaction(txHash);
      expect(isApproved).to.be.true;

      // Validate our method for reading the storage slot
      // as we're expecting zero later, which is equivalent to 
      // reading the wrong slot.
      const initialGuardAddress = await ethers.provider.getStorage(
        await safe.getAddress(),
        guardSlot
      );
      expect(initialGuardAddress).to.not.equal(ethers.ZeroAddress);


      // Should now succeed because the transaction is pre-approved
      await expect(
        safe.execTransaction(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.safeTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          signature
        )
      ).to.not.be.reverted;

      // Read the storage slot directly
      const finalGuardAddress = await ethers.provider.getStorage(
        await safe.getAddress(),
        guardSlot
      );

      // The value should be padded to 32 bytes, so we need to extract the address from it
      const actualGuardAddress = ethers.getAddress('0x' + finalGuardAddress.slice(-40));
      expect(actualGuardAddress).to.equal(ethers.ZeroAddress);
    });

    it('should block unauthorized transactions', async () => {
      const tx = {
        to: await user.getAddress(),
        value: 0,
        data: '0x',
        operation: Operation.Call,
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
      };

      const signature = createSafeSignature(deployer);

      await expect(
        safe.execTransaction(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.safeTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          signature
        )
      ).to.be.revertedWithCustomError(bravaGuard, 'BravaGuard_TransactionNotAllowed');
    });

    it('should allow reusing pre-approved transaction across different safes', async () => {
      // Deploy a second Safe 
      const secondSafe = await ethers.getContractAt(
        'ISafe',
        await deploySafe(alice )
      );

      // Set guard on second Safe
      const signature = createSafeSignature(deployer);
      const aliceSignature = createSafeSignature(alice);
    
      await secondSafe.connect(alice).execTransaction(
        await secondSafe.getAddress(),
        0,
        safe.interface.encodeFunctionData('setGuard', [ethers.ZeroAddress]),
        Operation.Call,
        0,
        0,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        aliceSignature
      );

      // Create identical transaction for both safes (setting guard to zero)
      const tx1 = {
        to: await safe.getAddress(),
        value: 0,
        data: safe.interface.encodeFunctionData('setGuard', [ethers.ZeroAddress]),
        operation: Operation.Call,
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
      };

      const tx2 = {
        ...tx1,
        to: await secondSafe.getAddress(),
        data: secondSafe.interface.encodeFunctionData('setGuard', [ethers.ZeroAddress])
      };

      // Calculate transaction hashes for both safes
      const txHash1 = calculateTransactionHash(tx1.data, tx1.operation);
      const txHash2 = calculateTransactionHash(tx2.data, tx2.operation);

      // These hashes should be the same since it's the same operation
      // Note: This will fail with current implementation but should pass after fix
      expect(txHash1).to.equal(txHash2);

      // Approve transaction once
      await transactionRegistry.proposeTransaction(txHash1);
      await transactionRegistry.approveTransaction(txHash1);

      // Execute on first safe - should succeed
      await expect(
        safe.execTransaction(
          tx1.to,
          tx1.value,
          tx1.data,
          tx1.operation,
          tx1.safeTxGas,
          tx1.baseGas,
          tx1.gasPrice,
          tx1.gasToken,
          tx1.refundReceiver,
          signature
        )
      ).to.not.be.reverted;

      // Execute on second safe - should also succeed with same approval
      await expect(
        secondSafe.connect(alice).execTransaction(
          tx2.to,
          tx2.value,
          tx2.data,
          tx2.operation,
          tx2.safeTxGas,
          tx2.baseGas,
          tx2.gasPrice,
          tx2.gasToken,
          tx2.refundReceiver,
          aliceSignature
        )
      ).to.not.be.reverted;
    });
  });
});
