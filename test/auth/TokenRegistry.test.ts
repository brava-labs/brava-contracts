import { ethers } from '..';
import { network } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { deploy, getBaseSetup, log } from '../utils';
import { AdminVault, Logger, TokenRegistry } from '../../typechain-types';
import { tokenConfig } from '../constants';

describe('TokenRegistry', () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let tokenRegistry: TokenRegistry;
  let adminVault: AdminVault;
  let logger: Logger;
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

    // Use TokenRegistry from base setup
    tokenRegistry = baseSetup.tokenRegistry;

    // Grant roles to deployer
    const TRANSACTION_PROPOSER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_PROPOSER_ROLE')
    );
    const TRANSACTION_EXECUTOR_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_EXECUTOR_ROLE')
    );
    const TRANSACTION_CANCELER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_CANCELER_ROLE')
    );
    const TRANSACTION_DISPOSER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_DISPOSER_ROLE')
    );

    await adminVault.grantRole(TRANSACTION_PROPOSER_ROLE, deployer.address);
    await adminVault.grantRole(TRANSACTION_EXECUTOR_ROLE, deployer.address);
    await adminVault.grantRole(TRANSACTION_CANCELER_ROLE, deployer.address);
    await adminVault.grantRole(TRANSACTION_DISPOSER_ROLE, deployer.address);
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
      expect(await tokenRegistry.ADMIN_VAULT()).to.equal(await adminVault.getAddress());
      expect(await tokenRegistry.LOGGER()).to.equal(await logger.getAddress());
    });

    it('should revert deployment with zero addresses', async () => {
      const TokenRegistryFactory = await ethers.getContractFactory('TokenRegistry');
      await expect(
        TokenRegistryFactory.deploy(ethers.ZeroAddress, await logger.getAddress())
      ).to.be.revertedWithCustomError(TokenRegistryFactory, 'InvalidInput');
      await expect(
        TokenRegistryFactory.deploy(await adminVault.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(TokenRegistryFactory, 'InvalidInput');
    });
  });

  describe('Token Management', () => {
    const testToken = tokenConfig.USDC.address;

    it('should propose a token', async () => {
      await tokenRegistry.proposeToken(testToken);
      expect(await tokenRegistry.tokenProposals(testToken)).to.not.equal(0);
    });

    it('should revert when proposing zero address token', async () => {
      await expect(tokenRegistry.proposeToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        tokenRegistry,
        'InvalidInput'
      );
    });

    it('should revert when proposing already approved token', async () => {
      await tokenRegistry.proposeToken(testToken);
      await tokenRegistry.approveToken(testToken);

      await expect(tokenRegistry.proposeToken(testToken)).to.be.revertedWithCustomError(
        tokenRegistry,
        'AdminVault_TransactionAlreadyApproved'
      );
    });

    it('should cancel a token proposal', async () => {
      await tokenRegistry.proposeToken(testToken);
      await tokenRegistry.cancelTokenProposal(testToken);
      expect(await tokenRegistry.tokenProposals(testToken)).to.equal(0);
    });

    it('should revert when canceling non-existent proposal', async () => {
      await expect(tokenRegistry.cancelTokenProposal(testToken)).to.be.revertedWithCustomError(
        tokenRegistry,
        'AdminVault_TransactionNotProposed'
      );
    });

    it('should approve a proposed token after delay', async () => {
      await tokenRegistry.proposeToken(testToken);
      await tokenRegistry.approveToken(testToken);
      expect(await tokenRegistry.isApprovedToken(testToken)).to.be.true;
    });

    it('should revert when approving token before delay period', async () => {
      // Set a delay
      const delay = 60 * 60 * 24; // 1 day
      await adminVault.changeDelay(delay);

      await tokenRegistry.proposeToken(testToken);

      await expect(tokenRegistry.approveToken(testToken)).to.be.revertedWithCustomError(
        tokenRegistry,
        'AdminVault_DelayNotPassed'
      );
    });

    it('should revert when approving non-proposed token', async () => {
      await expect(tokenRegistry.approveToken(testToken)).to.be.revertedWithCustomError(
        tokenRegistry,
        'AdminVault_TransactionNotProposed'
      );
    });

    it('should revert when approving zero address token', async () => {
      await expect(tokenRegistry.approveToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        tokenRegistry,
        'InvalidInput'
      );
    });

    it('should revoke an approved token', async () => {
      await tokenRegistry.proposeToken(testToken);
      await tokenRegistry.approveToken(testToken);
      await tokenRegistry.revokeToken(testToken);
      expect(await tokenRegistry.isApprovedToken(testToken)).to.be.false;
    });

    it('should revert when revoking non-approved token', async () => {
      await expect(tokenRegistry.revokeToken(testToken)).to.be.revertedWithCustomError(
        tokenRegistry,
        'TokenRegistry_TokenNotApproved'
      );
    });

    it('should check token approval status correctly', async () => {
      expect(await tokenRegistry.isApprovedToken(testToken)).to.be.false;

      await tokenRegistry.proposeToken(testToken);
      expect(await tokenRegistry.isApprovedToken(testToken)).to.be.false;

      await tokenRegistry.approveToken(testToken);
      expect(await tokenRegistry.isApprovedToken(testToken)).to.be.true;

      await tokenRegistry.revokeToken(testToken);
      expect(await tokenRegistry.isApprovedToken(testToken)).to.be.false;
    });

    it('should revert operations when caller lacks required role', async () => {
      await expect(
        tokenRegistry.connect(user).proposeToken(testToken)
      ).to.be.revertedWithCustomError(tokenRegistry, 'AdminVault_MissingRole');

      await tokenRegistry.proposeToken(testToken);

      await expect(
        tokenRegistry.connect(user).cancelTokenProposal(testToken)
      ).to.be.revertedWithCustomError(tokenRegistry, 'AdminVault_MissingRole');

      await expect(
        tokenRegistry.connect(user).approveToken(testToken)
      ).to.be.revertedWithCustomError(tokenRegistry, 'AdminVault_MissingRole');

      await tokenRegistry.approveToken(testToken);

      await expect(
        tokenRegistry.connect(user).revokeToken(testToken)
      ).to.be.revertedWithCustomError(tokenRegistry, 'AdminVault_MissingRole');
    });
  });
});
