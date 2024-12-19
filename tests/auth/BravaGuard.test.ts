import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  deploy,
  encodeAction,
  executeAction,
  executeSequence,
  getBaseSetup,
  getBytes4,
} from '../utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  BravaGuard,
  TransactionRegistry,
  SequenceExecutor,
  AdminVault,
  Logger,
} from '../../typechain-types';
import { ISafe } from '../../typechain-types/contracts/interfaces/safe/ISafe';
import { tokenConfig } from '../constants';
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
  to: string,
  data: string,
  operation: Operation
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'bytes', 'uint8'],
      [to, data, operation]
    )
  );
}

describe('BravaGuard', () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let bravaGuard: BravaGuard;
  let transactionRegistry: TransactionRegistry;
  let sequenceExecutor: SequenceExecutor;
  let adminVault: AdminVault;
  let safe: ISafe;
  let logger: Logger;
  beforeEach(async () => {
    [deployer, user] = await ethers.getSigners();

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

      const txHash = calculateTransactionHash(tx.to, tx.data, tx.operation);

      // Propose and approve the transaction (testing delay is zero)
      await transactionRegistry.proposeTransaction(txHash);
      await transactionRegistry.approveTransaction(txHash);

      const isApproved = await transactionRegistry.isApprovedTransaction(txHash);
      expect(isApproved).to.be.true;


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
  });
});
