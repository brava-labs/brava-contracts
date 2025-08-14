import { ethers } from '..';
import { expect } from 'chai';
import {
  deploy,
  encodeAction,
  executeSequence,
  getBaseSetup,
  getBytes4,
  deploySafe,
} from '../utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { BravaGuard, SequenceExecutor, AdminVault, Logger } from '../../typechain-types';
import { ISafe } from '../../typechain-types';
import { tokenConfig } from '../constants';
import { fundAccountWithToken } from '../utils-stable';

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

describe('BravaGuard', () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let bravaGuard: BravaGuard;
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

  describe('Deployment', () => {
    it('should deploy with correct address', async () => {
      expect(await bravaGuard.SEQUENCE_EXECUTOR()).to.equal(await sequenceExecutor.getAddress());
    });

    it('should revert deployment with zero address', async () => {
      const BravaGuard = await ethers.getContractFactory('BravaGuard');
      await expect(BravaGuard.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        BravaGuard,
        'BravaGuard_InvalidAddress'
      );
    });
  });

  describe('Transaction Validation', () => {
    it('should allow transactions to sequence executor', async () => {
      const fluidSupplyContract = await deploy(
        'FluidV1Supply',
        deployer,
        await adminVault.getAddress(),
        await logger.getAddress()
      );
      const fluidSupplyAddress = await fluidSupplyContract.getAddress();
      await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.proposePool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
      await adminVault.addPool('FluidV1', tokenConfig.FLUID_V1_USDC.address);

      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(await safe.getAddress(), token, amount);

      const payload = await encodeAction({
        type: 'FluidV1Supply',
        amount,
      });

      await executeSequence(
        await safe.getAddress(),
        {
          name: 'FluidV1SupplySequence',
          callData: [payload],
          actionIds: [getBytes4(fluidSupplyAddress)],
        },
        false
      );
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
