import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { AdminVault, FluidV1Supply, IERC20, IFluidLending } from '../../typechain-types';
import { tokenConfig } from '../constants';
import {
  calculateExpectedFee,
  deploy,
  executeAction,
  getBaseSetup,
  getBytes4,
  getRoleBytes,
  log,
} from '../utils';
import { fundAccountWithToken, getTokenContract } from '../utils-stable';

describe('AdminVault', function () {
  let adminVault: AdminVault;
  let admin: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bobby: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let snapshotId: string;
  let USDC: IERC20;
  let safeAddr: string;

  describe('Direct tests', function () {
    before(async () => {
      [admin, owner, alice, bobby, carol, david] = await ethers.getSigners();

      const baseSetup = await getBaseSetup(admin);
      if (!baseSetup) {
        throw new Error('Base setup not deployed');
      }
      adminVault = await baseSetup.adminVault;

      // Fetch the USDC token
      USDC = await getTokenContract('USDC');

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

    describe('Constructor', function () {
      it('should revert with zero address owner', async function () {
        const AdminVaultFactory = await ethers.getContractFactory('AdminVault');
        await expect(
          AdminVaultFactory.deploy(ethers.ZeroAddress, 60 * 60 * 24, admin.address)
        ).to.be.revertedWithCustomError(AdminVaultFactory, 'InvalidInput');
      });

      it('should revert with zero address logger', async function () {
        const AdminVaultFactory = await ethers.getContractFactory('AdminVault');
        await expect(
          AdminVaultFactory.deploy(admin.address, 60 * 60 * 24, ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(AdminVaultFactory, 'InvalidInput');
      });
    });

    describe('Role management', function () {
      it('should be able to propose a role', async function () {
        // alice should not be able to propose a role (not an admin)
        await expect(
          adminVault.connect(alice).proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address)
        )
          .to.be.revertedWithCustomError(adminVault, 'AccessControlDelayed_MustHaveAdminRole')
          .withArgs(alice.address, getRoleBytes('POOL_PROPOSER_ROLE'));

        // admin should be able to propose POOL_PROPOSER_ROLE (admin is OWNER and OWNER is admin of ROLE_MANAGER_ROLE)
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address)
        ).to.not.equal(0);

        // admin should be able to propose OWNER_ROLE (OWNER is its own admin)
        await adminVault.connect(admin).proposeRole(getRoleBytes('OWNER_ROLE'), bobby.address);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('OWNER_ROLE'), bobby.address)
        ).to.not.equal(0);

        // role manager should NOT be able to propose OWNER_ROLE (not an admin of OWNER_ROLE)
        await adminVault.connect(admin).grantRole(getRoleBytes('ROLE_MANAGER_ROLE'), carol.address);
        await expect(
          adminVault.connect(carol).proposeRole(getRoleBytes('OWNER_ROLE'), david.address)
        )
          .to.be.revertedWithCustomError(adminVault, 'AccessControlDelayed_MustHaveAdminRole')
          .withArgs(carol.address, getRoleBytes('OWNER_ROLE'));
      });

      it('should allow OWNER_ROLE to bypass delay when granting roles', async function () {
        // OWNER can grant roles directly without proposal
        await adminVault.connect(admin).grantRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);
        expect(await adminVault.hasRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address)).to.be
          .true;

        // Clean up - revoke the role
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);
      });

      it('should be able to cancel a role proposal', async function () {
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address)
        ).to.not.equal(0);

        // Test cancel role proposal
        await expect(
          adminVault
            .connect(alice)
            .cancelRoleProposal(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address)
        )
          .to.be.revertedWithCustomError(
            adminVault,
            'AccessControlDelayed_MustHaveRoleManagerOrOwner'
          )
          .withArgs(alice.address);

        // admin should be able to cancel the role proposal
        await adminVault
          .connect(admin)
          .cancelRoleProposal(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address)
        ).to.equal(0);
      });

      it('should be able to grant a role through ROLE_MANAGER_ROLE', async function () {
        // First make alice a ROLE_MANAGER
        await adminVault.connect(admin).grantRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);

        // Alice proposes bobby for POOL_PROPOSER_ROLE
        await adminVault
          .connect(alice)
          .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address);

        // Wait for delay
        await time.increase(60 * 60 * 24);

        // Alice grants the role after proposal
        await adminVault
          .connect(alice)
          .grantRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address);
        expect(await adminVault.hasRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address)).to.be
          .true;

        // Clean up
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);
      });

      it('should be able to revoke a role', async function () {
        // First make alice a ROLE_MANAGER
        await adminVault.connect(admin).grantRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);

        // Alice proposes and grants POOL_PROPOSER_ROLE to bobby
        await adminVault
          .connect(alice)
          .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address);
        await time.increase(60 * 60 * 24);
        await adminVault
          .connect(alice)
          .grantRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address);

        // Carol should not be able to revoke a role
        await expect(
          adminVault.connect(carol).revokeRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        // Alice (as ROLE_MANAGER) should be able to revoke the role
        await adminVault
          .connect(alice)
          .revokeRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address);
        expect(await adminVault.hasRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address)).to.be
          .false;

        // Clean up
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);
      });

      it('should not be able to grant a role if the delay is not passed', async function () {
        // Make alice a ROLE_MANAGER
        await adminVault.connect(admin).grantRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);

        // Set a delay
        await adminVault.connect(admin).changeDelay(60 * 60 * 24); // 1 day delay

        // Alice proposes bobby for POOL_PROPOSER_ROLE
        await adminVault
          .connect(alice)
          .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address);

        // Try to grant immediately without waiting for delay
        await expect(
          adminVault.connect(alice).grantRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');

        // Clean up
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);
      });

      it('should not be able to grant a role if the role is not proposed', async function () {
        // Make alice a ROLE_MANAGER
        await adminVault.connect(admin).grantRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);

        // Try to grant without proposal
        await expect(
          adminVault.connect(alice).grantRole(getRoleBytes('POOL_PROPOSER_ROLE'), bobby.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');

        // Clean up
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);
      });

      it('should not be able to propose a role to the zero address', async function () {
        await expect(
          adminVault
            .connect(admin)
            .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });

      it('should be able to batch propose and grant roles', async function () {
        // Create the calldata for proposing roles
        const proposeRoleCalls = [
          // Alice as FEE_PROPOSER
          adminVault.interface.encodeFunctionData('proposeRole', [
            getRoleBytes('FEE_PROPOSER_ROLE'),
            alice.address,
          ]),
          // Bobby as FEE_CANCELER
          adminVault.interface.encodeFunctionData('proposeRole', [
            getRoleBytes('FEE_CANCELER_ROLE'),
            bobby.address,
          ]),
          // Carol as FEE_EXECUTOR
          adminVault.interface.encodeFunctionData('proposeRole', [
            getRoleBytes('FEE_EXECUTOR_ROLE'),
            carol.address,
          ]),
        ];

        // Execute multicall for proposals
        await adminVault.connect(admin).multicall(proposeRoleCalls);

        // Verify proposals were made
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('FEE_PROPOSER_ROLE'), alice.address)
        ).to.not.equal(0);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('FEE_CANCELER_ROLE'), bobby.address)
        ).to.not.equal(0);
        expect(
          await adminVault.getRoleProposalTime(getRoleBytes('FEE_EXECUTOR_ROLE'), carol.address)
        ).to.not.equal(0);

        // Create the calldata for granting roles
        const grantRoleCalls = [
          // Grant FEE_PROPOSER to Alice
          adminVault.interface.encodeFunctionData('grantRole', [
            getRoleBytes('FEE_PROPOSER_ROLE'),
            alice.address,
          ]),
          // Grant FEE_CANCELER to Bobby
          adminVault.interface.encodeFunctionData('grantRole', [
            getRoleBytes('FEE_CANCELER_ROLE'),
            bobby.address,
          ]),
          // Grant FEE_EXECUTOR to Carol
          adminVault.interface.encodeFunctionData('grantRole', [
            getRoleBytes('FEE_EXECUTOR_ROLE'),
            carol.address,
          ]),
        ];

        // Execute multicall for grants
        await adminVault.connect(admin).multicall(grantRoleCalls);

        // Verify roles were granted
        expect(await adminVault.hasRole(getRoleBytes('FEE_PROPOSER_ROLE'), alice.address)).to.be
          .true;
        expect(await adminVault.hasRole(getRoleBytes('FEE_CANCELER_ROLE'), bobby.address)).to.be
          .true;
        expect(await adminVault.hasRole(getRoleBytes('FEE_EXECUTOR_ROLE'), carol.address)).to.be
          .true;
      });
      it('should have the correct roles for each function', async function () {
        // First check all functions have some role assigned to them
        // Fee management
        await expect(
          adminVault.connect(alice).proposeFeeConfig(alice.address, 100, 200)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).cancelFeeConfigProposal()
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(adminVault.connect(alice).setFeeConfig()).to.be.revertedWithCustomError(
          adminVault,
          'AccessControlUnauthorizedAccount'
        );

        // Pool management
        await expect(
          adminVault.connect(alice).proposePool('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).cancelPoolProposal('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).addPool('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).removePool('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        // Action management
        await expect(
          adminVault.connect(alice).proposeAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).cancelActionProposal(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await expect(
          adminVault.connect(alice).removeAction(getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        // Now check the roles for each function are the correct ones.
        // Alice will be the proposer - "Addition" Alice
        // Bobby will be the canceler - "Bye bye" Bobby
        // Carol will be the executor - "Can do" Carol
        // David will be the disposer - David the Disposer

        // FEE MANAGEMENT
        // Lets make alice the fee proposer, bobby the fee executor and carol the canceller
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('FEE_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('FEE_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('FEE_EXECUTOR_ROLE'), carol.address);
        await adminVault.connect(admin).grantRole(getRoleBytes('FEE_PROPOSER_ROLE'), alice.address);
        await adminVault.connect(admin).grantRole(getRoleBytes('FEE_CANCELER_ROLE'), bobby.address);
        await adminVault.connect(admin).grantRole(getRoleBytes('FEE_EXECUTOR_ROLE'), carol.address);

        // Alice can now propose and Bobby can cancel a fee config
        await adminVault.connect(alice).proposeFeeConfig(alice.address, 100, 200);
        await adminVault.connect(bobby).cancelFeeConfigProposal();

        // Carol can set the fee config (after another proposal from alice)
        await adminVault.connect(alice).proposeFeeConfig(alice.address, 300, 400);
        await adminVault.connect(carol).setFeeConfig();

        // Remove their roles and now make them pool proposer, executor and disposer
        // lets add david as the pool disposer
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('FEE_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('FEE_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('FEE_EXECUTOR_ROLE'), carol.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('POOL_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('POOL_EXECUTOR_ROLE'), carol.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('POOL_DISPOSER_ROLE'), david.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('POOL_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('POOL_EXECUTOR_ROLE'), carol.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('POOL_DISPOSER_ROLE'), david.address);

        // POOL MANAGEMENT
        // Alice can now propose and bobby can cancel a pool
        await adminVault.connect(alice).proposePool('FluidV1', alice.address);
        await adminVault.connect(bobby).cancelPoolProposal('FluidV1', alice.address);

        // Carol can add a pool (after another proposal from alice)
        await adminVault.connect(alice).proposePool('FluidV1', alice.address);
        await adminVault.connect(carol).addPool('FluidV1', alice.address);

        // david can remove the pool
        await adminVault.connect(david).removePool('FluidV1', alice.address);

        // Remove their roles and now make them action proposer and executor
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('POOL_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('POOL_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('POOL_EXECUTOR_ROLE'), carol.address);
        await adminVault
          .connect(admin)
          .revokeRole(getRoleBytes('POOL_DISPOSER_ROLE'), david.address);

        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('ACTION_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('ACTION_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('ACTION_EXECUTOR_ROLE'), carol.address);
        await adminVault
          .connect(admin)
          .proposeRole(getRoleBytes('ACTION_DISPOSER_ROLE'), david.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('ACTION_PROPOSER_ROLE'), alice.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('ACTION_CANCELER_ROLE'), bobby.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('ACTION_EXECUTOR_ROLE'), carol.address);
        await adminVault
          .connect(admin)
          .grantRole(getRoleBytes('ACTION_DISPOSER_ROLE'), david.address);

        // ACTION MANAGEMENT
        // Alice can now propose and bobby can cancel an action
        await adminVault.connect(alice).proposeAction(getBytes4(alice.address), alice.address);
        await adminVault
          .connect(bobby)
          .cancelActionProposal(getBytes4(alice.address), alice.address);

        // Carol can add an action (after another proposal from alice)
        await adminVault.connect(alice).proposeAction(getBytes4(alice.address), alice.address);
        await adminVault.connect(carol).addAction(getBytes4(alice.address), alice.address);

        // David can remove the action
        await adminVault.connect(david).removeAction(getBytes4(alice.address));
      });
    });

    describe('Fee configuration', function () {
      it('should be able to propose a fee config', async function () {
        await expect(
          adminVault.connect(alice).proposeFeeConfig(alice.address, 100, 200)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);
        const pendingConfig = await adminVault.pendingFeeConfig();
        expect(pendingConfig.recipient).to.equal(alice.address);
        expect(pendingConfig.minBasis).to.equal(100);
        expect(pendingConfig.maxBasis).to.equal(200);
      });

      it('should not be able to propose invalid fee ranges', async function () {
        await expect(
          adminVault.connect(admin).proposeFeeConfig(alice.address, 200, 100)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_InvalidFeeRange');

        await expect(
          adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 1001)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_FeePercentageOutOfRange');
      });

      it('should be able to cancel a fee config proposal', async function () {
        await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);
        await expect(
          adminVault.connect(alice).cancelFeeConfigProposal()
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

        await adminVault.connect(admin).cancelFeeConfigProposal();
        const pendingConfig = await adminVault.pendingFeeConfig();
        expect(pendingConfig.proposalTime).to.equal(0);
      });

      it('should not be able to cancel a non-existent fee config proposal', async function () {
        // Try to cancel when no proposal exists
        await adminVault.connect(admin).cancelFeeConfigProposal();

        // Verify nothing changed
        const pendingConfig = await adminVault.pendingFeeConfig();
        expect(pendingConfig.proposalTime).to.equal(0);
      });

      it('should be able to set a fee config', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);

        // alice should not be able to set a fee config
        await expect(adminVault.connect(alice).setFeeConfig()).to.be.revertedWithCustomError(
          adminVault,
          'AccessControlUnauthorizedAccount'
        );

        // admin should be able to set a fee config
        await adminVault.connect(admin).setFeeConfig();
        const activeConfig = await adminVault.feeConfig();
        expect(activeConfig.recipient).to.equal(alice.address);
        expect(activeConfig.minBasis).to.equal(100);
        expect(activeConfig.maxBasis).to.equal(200);
        expect(activeConfig.proposalTime).to.equal(0);
        this.test!.ctx!.set = true;
      });

      it('should not be able to set a fee config if the delay is not passed', async function () {
        if (!this.test!.ctx!.set) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);
        await expect(adminVault.connect(admin).setFeeConfig()).to.be.revertedWithCustomError(
          adminVault,
          'AdminVault_DelayNotPassed'
        );
      });

      it('should not be able to set a fee config if not proposed', async function () {
        if (!this.test!.ctx!.set) this.skip();
        await expect(adminVault.connect(admin).setFeeConfig()).to.be.revertedWithCustomError(
          adminVault,
          'AdminVault_NotProposed'
        );
      });

      it('should enforce fee basis range checks', async function () {
        if (!this.test!.ctx!.set) this.skip();
        // Set up a fee config with range 100-200
        await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);
        await adminVault.connect(admin).setFeeConfig();

        // Check valid fee
        await expect(adminVault.checkFeeBasis(150)).to.not.be.reverted;

        // Check below minimum
        await expect(adminVault.checkFeeBasis(50))
          .to.be.revertedWithCustomError(adminVault, 'AdminVault_FeePercentageOutOfRange')
          .withArgs(50, 100, 200);

        // Check above maximum
        await expect(adminVault.checkFeeBasis(250))
          .to.be.revertedWithCustomError(adminVault, 'AdminVault_FeePercentageOutOfRange')
          .withArgs(250, 100, 200);
      });
    });

    describe('Fee configuration execution', function () {
      beforeEach(async function () {
        // Set a delay of 1 day
        const oneDay = 86400n;
        await adminVault.connect(admin).changeDelay(oneDay);

        // Grant necessary roles to admin
        await adminVault
          .connect(admin)
          .grantRole(await adminVault.FEE_EXECUTOR_ROLE(), admin.address);
        await adminVault
          .connect(admin)
          .grantRole(await adminVault.FEE_PROPOSER_ROLE(), admin.address);

        // Set up a fee config proposal first
        await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);
      });

      it('should revert when non-executor tries to set fee config', async function () {
        await expect(adminVault.connect(alice).setFeeConfig()).to.be.revertedWithCustomError(
          adminVault,
          'AccessControlUnauthorizedAccount'
        );
      });

      it('should successfully set fee config after delay', async function () {
        // Fast forward past the delay
        await network.provider.send('evm_increaseTime', [Number(await adminVault.delay())]);
        await network.provider.send('evm_mine');

        await adminVault.connect(admin).setFeeConfig();
        const config = await adminVault.feeConfig();
        expect(config.recipient).to.equal(alice.address);
        expect(config.minBasis).to.equal(100);
        expect(config.maxBasis).to.equal(200);
      });

      it('should revert when setting fee config before delay passes', async function () {
        // Try to set immediately without waiting for delay
        await expect(adminVault.connect(admin).setFeeConfig()).to.be.revertedWithCustomError(
          adminVault,
          'AdminVault_DelayNotPassed'
        );
      });
    });

    describe('Pool management', function () {
      it('should be able to propose a pool', async function () {
        // alice should not be able to propose a pool (not an admin)
        await expect(adminVault.connect(alice).proposePool('FluidV1', alice.address))
          .to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount')
          .withArgs(alice.address, getRoleBytes('POOL_PROPOSER_ROLE'));

        // admin should be able to propose a pool
        await adminVault.connect(admin).proposePool('FluidV1', alice.address);
        expect(await adminVault.getPoolProposalTime('FluidV1', alice.address)).to.not.equal(0);
        this.test!.ctx!.proposed = true;
      });

      it('should be able to cancel a pool proposal', async function () {
        await expect(adminVault.connect(alice).cancelPoolProposal('FluidV1', alice.address))
          .to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount')
          .withArgs(alice.address, getRoleBytes('POOL_CANCELER_ROLE'));
      });

      it('should be able to add a pool', async function () {
        await expect(adminVault.connect(alice).addPool('FluidV1', alice.address))
          .to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount')
          .withArgs(alice.address, getRoleBytes('POOL_EXECUTOR_ROLE'));
      });

      it('should not be able to add a pool if the delay is not passed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposePool('FluidV1', alice.address);
        await expect(
          adminVault.connect(admin).addPool('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');
      });

      it('should not be able to add a pool if the pool is not proposed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).addPool('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });

      it('should not be able to add a pool if any values are empty', async function () {
        if (!this.test!.ctx!.added) this.skip();
        // protocol name is empty
        await expect(
          adminVault.connect(admin).addPool('', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
        // pool address is zero address
        await expect(
          adminVault.connect(admin).addPool('FluidV1', ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });
      it('should revert if pool is not found', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).getPoolAddress('FluidV1', getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotFound');
      });
      it('should be able to remove a pool', async function () {
        await adminVault.connect(admin).proposePool('FluidV1', alice.address);
        await adminVault.connect(admin).addPool('FluidV1', alice.address);
        expect(await adminVault.getPoolAddress('FluidV1', getBytes4(alice.address))).to.not.equal(
          ethers.ZeroAddress
        );
        await adminVault.connect(admin).removePool('FluidV1', alice.address);
        await expect(
          adminVault.connect(admin).getPoolAddress('FluidV1', getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotFound');
      });
      it('should not be able to reuse a proposed pool', async function () {
        await adminVault.connect(admin).proposePool('FluidV1', alice.address);
        await adminVault.connect(admin).addPool('FluidV1', alice.address);
        await adminVault.connect(admin).removePool('FluidV1', alice.address);
        await expect(
          adminVault.connect(admin).addPool('FluidV1', alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });
    });

    describe('Action management', function () {
      it('should be able to propose an action', async function () {
        // alice should not be able to propose an action (not an admin)
        await expect(
          adminVault.connect(alice).proposeAction(getBytes4(alice.address), alice.address)
        )
          .to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount')
          .withArgs(alice.address, getRoleBytes('ACTION_PROPOSER_ROLE'));

        // admin should be able to propose an action
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        expect(
          await adminVault.getActionProposalTime(getBytes4(alice.address), alice.address)
        ).to.not.equal(0);
        this.test!.ctx!.proposed = true;
      });

      it('should be able to cancel an action proposal', async function () {
        await expect(
          adminVault.connect(alice).cancelActionProposal(getBytes4(alice.address), alice.address)
        )
          .to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount')
          .withArgs(alice.address, getRoleBytes('ACTION_CANCELER_ROLE'));
      });
      it('should be able to add an action', async function () {
        await expect(adminVault.connect(alice).addAction(getBytes4(alice.address), alice.address))
          .to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount')
          .withArgs(alice.address, getRoleBytes('ACTION_EXECUTOR_ROLE'));
      });

      it('should not be able to add an action if the delay is not passed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        const delay = 60 * 60 * 24;
        await adminVault.connect(admin).changeDelay(delay);
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        await expect(
          adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_DelayNotPassed');
      });

      it('should not be able to add an action if the action is not proposed', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });

      it('should not be able to propose an action if the action is the zero address', async function () {
        if (!this.test!.ctx!.proposed) this.skip();
        await expect(
          adminVault.connect(admin).proposeAction(getBytes4(alice.address), ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
        await expect(
          adminVault.connect(admin).proposeAction(ethers.ZeroHash.slice(0, 10), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'InvalidInput');
      });
      it('should revert if action not found', async function () {
        if (!this.test!.ctx!.added) this.skip();
        await expect(
          adminVault.connect(admin).getActionAddress(getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotFound');
      });

      it('should be able to remove an action', async function () {
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        await adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address);
        expect(await adminVault.getActionAddress(getBytes4(alice.address))).to.not.equal(
          ethers.ZeroAddress
        );
        await adminVault.connect(admin).removeAction(getBytes4(alice.address));
        await expect(
          adminVault.connect(admin).getActionAddress(getBytes4(alice.address))
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotFound');
      });

      it('should not be able to reuse a proposed action', async function () {
        await adminVault.connect(admin).proposeAction(getBytes4(alice.address), alice.address);
        await adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address);
        await adminVault.connect(admin).removeAction(getBytes4(alice.address));
        await expect(
          adminVault.connect(admin).addAction(getBytes4(alice.address), alice.address)
        ).to.be.revertedWithCustomError(adminVault, 'AdminVault_NotProposed');
      });
    });

    // TODO: Update test to use AccessControl
    it('should set fee percentage correctly', async function () {
      await expect(
        adminVault.connect(alice).proposeFeeConfig(alice.address, 100, 200)
      ).to.be.revertedWithCustomError(adminVault, 'AccessControlUnauthorizedAccount');

      await expect(adminVault.connect(admin).setFeeConfig()).to.be.revertedWithCustomError(
        adminVault,
        'AdminVault_NotProposed'
      );

      await adminVault.connect(admin).proposeFeeConfig(alice.address, 100, 200);
      await adminVault.connect(admin).setFeeConfig();
      const feeConfig = await adminVault.feeConfig();
      expect(feeConfig.minBasis).to.equal(100);
      expect(feeConfig.maxBasis).to.equal(200);
    });
    it('should set fee timestamp correctly', async function () {
      await adminVault.proposePool('FluidV1', alice.address);
      await adminVault.addPool('FluidV1', alice.address);
      const tx = await adminVault.connect(owner).setFeeTimestamp(alice.address);

      const receipt = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp;
      expect(await adminVault.lastFeeTimestamp(owner.address, alice.address)).to.equal(
        blockTimestamp
      );
    });
    describe('Governance delay adjustments', function () {
      const oneDay = 86400n; // 1 day in seconds
      const halfDay = 43200n; // 12 hours in seconds

      beforeEach(async function () {
        // Set initial delay to one day before each test
        await adminVault.connect(admin).changeDelay(oneDay);
        expect(await adminVault.delay()).to.equal(oneDay);
      });

      it('should revert when non-owner tries to change delay', async function () {
        await expect(adminVault.connect(alice).changeDelay(oneDay)).to.be.revertedWithCustomError(
          adminVault,
          'AccessControlUnauthorizedAccount'
        );
      });

      it('should increase the delay', async function () {
        const newDelay = oneDay + halfDay; // Increase to 1.5 days
        await adminVault.connect(admin).changeDelay(newDelay);
        expect(await adminVault.delay()).to.equal(newDelay);
      });

      it('should reduce the delay', async function () {
        const newDelay = halfDay; // Decrease to 12 hours
        await adminVault.connect(admin).changeDelay(newDelay);

        // Check that proposedDelay is set
        expect(await adminVault.proposedDelay()).to.equal(newDelay);

        // Check that delayReductionLockTime is set
        const lockTime = await adminVault.delayReductionLockTime();
        expect(lockTime).to.be.gt(0);

        // Fast forward time to after the lock time
        await time.increaseTo(lockTime);

        // Trigger the delay update by proposing a role
        await adminVault.proposeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);

        // Check that the delay has been updated
        expect(await adminVault.delay()).to.equal(newDelay);
      });

      it('should not set the delay beyond 5 days', async function () {
        const fiveDaysAndOneSecond = 5n * 86400n + 1n;
        await expect(
          adminVault.connect(admin).changeDelay(fiveDaysAndOneSecond)
        ).to.be.revertedWithCustomError(adminVault, 'AccessControlDelayed_InvalidDelay');
      });

      it('should handle reducing the delay twice in succession', async function () {
        const firstReduction = halfDay; // Decrease to 12 hours
        await adminVault.connect(admin).changeDelay(firstReduction);

        const firstLockTime = await adminVault.delayReductionLockTime();

        // Attempt second reduction before lock time
        const secondReduction = halfDay / 2n; // Decrease to 6 hours
        await adminVault.connect(admin).changeDelay(secondReduction);

        // Check that the lock time has been increased
        // This will be enforcing the old delay, so will be one second (one simulated block) after the first lock time
        expect(await adminVault.delayReductionLockTime()).to.equal(firstLockTime + 1n);

        // Fast forward time to after the lock time
        await time.increaseTo(firstLockTime);

        // Trigger the delay update
        await adminVault.proposeRole(getRoleBytes('ROLE_MANAGER_ROLE'), alice.address);

        // Check that the delay has been updated to the second reduction
        expect(await adminVault.delay()).to.equal(secondReduction);
      });

      it('should allow resetting the delay immediately after an attacker attempts to remove it', async function () {
        const attackerDelay = 0n; // Attacker tries to set delay to zero

        // Simulate attacker trying to remove the delay
        await adminVault.connect(admin).changeDelay(attackerDelay);

        // Check that proposedDelay is set to zero
        expect(await adminVault.proposedDelay()).to.equal(attackerDelay);

        // Check that delayReductionLockTime is set
        const lockTime = await adminVault.delayReductionLockTime();
        expect(lockTime).to.be.gt(0);

        // Immediately reset the delay back to one day (simulating defensive action)
        await adminVault.connect(admin).changeDelay(oneDay);

        // This reset should take effect immediately
        expect(await adminVault.delay()).to.equal(oneDay);

        // The proposedDelay should be cleared
        expect(await adminVault.proposedDelay()).to.equal(0);

        // The delayReductionLockTime should be cleared
        expect(await adminVault.delayReductionLockTime()).to.equal(0);

        // Fast forward time to after the original lock time
        await time.increaseTo(lockTime);

        // Trigger a delay check by proposing a role
        await adminVault.proposeRole(getRoleBytes('ROLE_MANAGER_ROLE'), carol.address);

        // The delay should still be one day
        expect(await adminVault.delay()).to.equal(oneDay);
      });
    });
  });
  // tests that need to be run via inheritance
  // lets deploy an action contract and test via that
  describe('Indirect tests', function () {
    let signer: SignerWithAddress;
    let loggerAddress: string;
    let fUSDC: IFluidLending;
    let fluidSupplyContract: FluidV1Supply;
    let fluidSupplyAddress: string;
    before(async () => {
      [signer] = await ethers.getSigners();
      const baseSetup = await getBaseSetup(signer);
      if (!baseSetup) {
        throw new Error('Base setup not deployed');
      }
      safeAddr = (await baseSetup.safe.getAddress()) as string;
      adminVault = await baseSetup.adminVault;
      loggerAddress = (await baseSetup.logger.getAddress()) as string;
      // Fetch the USDC token
      USDC = await getTokenContract('USDC');

      // Initialize FluidV1Supply and FluidV1Withdraw actions
      fluidSupplyContract = await deploy(
        'FluidV1Supply',
        signer,
        await adminVault.getAddress(),
        loggerAddress
      );
      fluidSupplyAddress = await fluidSupplyContract.getAddress();
      fUSDC = await ethers.getContractAt('IFluidLending', tokenConfig.FLUID_V1_USDC.address);
      await adminVault.proposePool('FluidV1', await fUSDC.getAddress());
      await adminVault.addPool('FluidV1', await fUSDC.getAddress());
    });
    it('should calculate fee correctly for a given period', async function () {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);

      await fundAccountWithToken(safeAddr, token, amount);

      const feeConfig = await adminVault.feeConfig();
      const feeRecipient = feeConfig.recipient;
      const feeRecipientUSDCBalanceBefore = await USDC.balanceOf(feeRecipient);
      const feeRecipientfUSDCBalanceBefore = await fUSDC.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'FluidV1Supply',
        amount,
      });

      const fUSDCBalanceAfterSupply = await fUSDC.balanceOf(safeAddr);

      const protocolId = BigInt(
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['FluidV1']))
      );
      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.FLUID_V1_USDC.address
      );
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel like you're Dr Emmett Brown
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      const withdrawTx = await executeAction({
        type: 'FluidV1Supply',
        poolAddress: tokenConfig.FLUID_V1_USDC.address,
        feeBasis: 10,
        amount: '0',
      });

      const expectedFee = await calculateExpectedFee(
        (await supplyTx.wait()) ??
          (() => {
            throw new Error('Supply transaction failed');
          })(),
        (await withdrawTx.wait()) ??
          (() => {
            throw new Error('Withdraw transaction failed');
          })(),
        10,
        fUSDCBalanceAfterSupply
      );
      const expectedFeeRecipientBalance = feeRecipientfUSDCBalanceBefore + expectedFee;

      // don't take fees in the underlying asset
      expect(await USDC.balanceOf(feeRecipient)).to.equal(feeRecipientUSDCBalanceBefore);
      // take fees in the fToken
      expect(await fUSDC.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });
  });
});
