import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import {
  AdminVault,
  EIP712TypedDataSafeModule,
  FluidV1Supply,
  IERC20,
  IFluidLending,
  Logger,
  PullToken,
  SafeDeployment,
  SafeSetupRegistry,
  SequenceExecutor,
} from '../../typechain-types';
import { encodeAction, getBaseSetup, getBytes4, log } from '../utils';
import { fundAccountWithToken, getTokenContract } from '../utils-stable';
import { tokenConfig } from '../constants';
import { 
  signBundle, 
  createEIP712Domain,
  EIP712_TYPES,
  type Bundle 
} from './eip712-helpers';

describe('EIP712TypedDataSafeModule Complex Flow Tests', function () {
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let adminVault: AdminVault;
  let logger: Logger;
  let sequenceExecutor: SequenceExecutor;
  let safeDeployment: SafeDeployment;
  let safeSetupRegistry: SafeSetupRegistry;
  let eip712Module: EIP712TypedDataSafeModule;
  let pullTokenAction: PullToken;
  let fluidSupplyAction: FluidV1Supply;
  let USDC: IERC20;
  let fUSDC: IFluidLending;
  let snapshotId: string;

  const DEPOSIT_AMOUNT = ethers.parseUnits('500', 6); // $500 USDC

  before(async () => {
    [admin, user] = await ethers.getSigners();

    // Get enhanced base setup with SafeDeployment and EIP712Module
    const baseSetup = await getBaseSetup(admin);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    sequenceExecutor = baseSetup.sequenceExecutor;
    safeDeployment = baseSetup.safeDeployment;
    safeSetupRegistry = baseSetup.safeSetupRegistry;
    eip712Module = baseSetup.eip712Module;

    // Get token contracts
    USDC = await getTokenContract('USDC');
    fUSDC = await ethers.getContractAt('IFluidLending', tokenConfig.FLUID_V1_USDC.address);

    // Deploy action contracts using the deploy helper (automatically registers them)
    const { deploy } = await import('../utils');
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

    // Propose actions
    await adminVault.proposeAction(pullTokenId, pullTokenAddress);
    await adminVault.proposeAction(fluidSupplyId, fluidSupplyAddress);

    // Add actions (skip delay for testing)
    await adminVault.addAction(pullTokenId, pullTokenAddress);
    await adminVault.addAction(fluidSupplyId, fluidSupplyAddress);

    // Register Fluid pool
    await adminVault.proposePool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
    await adminVault.addPool('FluidV1', tokenConfig.FLUID_V1_USDC.address);

    // Note: SafeDeployment and TYPED_DATA_SAFE_CONFIG are already set up in base deployment

    // Fund user with USDC for the test
    await fundAccountWithToken(user.address, 'USDC', DEPOSIT_AMOUNT + ethers.parseUnits('100', 6));

    log('Complex flow test setup completed');
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Complex Multi-Action Bundle with Safe Deployment', () => {
    it('Should predict Safe address, pre-approve USDC, and execute complex bundle with PullToken + Fluid deposit', async () => {
      // Use fresh accounts for this test - Alice (user) and Bob (executor)
      const [, , alice, bob] = await ethers.getSigners();
      
      // Fund Alice with USDC for the test
      await fundAccountWithToken(alice.address, 'USDC', DEPOSIT_AMOUNT + ethers.parseUnits('100', 6));

      // 1. Alice predicts her future Safe address
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(alice.address);

      // 2. Verify Alice's Safe doesn't exist yet
      const isDeployedBefore = await safeDeployment.isSafeDeployed(alice.address);
      expect(isDeployedBefore).to.be.false;

      // 3. Alice pre-approves USDC to her predicted Safe address
      await USDC.connect(alice).approve(predictedSafeAddress, DEPOSIT_AMOUNT);

      // Verify Alice's approval
      const allowance = await USDC.allowance(alice.address, predictedSafeAddress);
      expect(allowance).to.equal(DEPOSIT_AMOUNT);

      // 4. Create the call data for both actions
      const pullTokenCallData = await encodeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: DEPOSIT_AMOUNT,
        from: alice.address,
      });

      const fluidSupplyCallData = await encodeAction({
        type: 'FluidV1Supply',
        poolAddress: tokenConfig.FLUID_V1_USDC.address,
        amount: DEPOSIT_AMOUNT,
        feeBasis: 0, // No fees for this test
      });

      // 5. Create the typed data bundle
      const actionDefinitions = [
        {
          protocolName: 'Brava',
          actionType: 5, // TRANSFER_ACTION (PullToken)
        },
        {
          protocolName: 'FluidV1',
          actionType: 0, // DEPOSIT_ACTION (FluidV1Supply)
        },
      ];

      const sequence = {
        name: 'PullAndDepositSequence',
        actions: actionDefinitions,
        actionIds: [
          getBytes4(await pullTokenAction.getAddress()),
          getBytes4(await fluidSupplyAction.getAddress()),
        ],
        callData: [pullTokenCallData, fluidSupplyCallData],
      };

      const chainSequence = {
        chainId: BigInt(31337), // Hardhat chain ID
        sequenceNonce: BigInt(0), // First sequence for this chain
        sequence: sequence,
      };

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [chainSequence],
      };

      // 6. Alice signs the bundle using proper EIP-712 signTypedData
      const signature = await signBundle(alice, bundle, await eip712Module.getAddress());

      // Test what the contract will actually recover
      const contractDomainSeparator = await eip712Module.getDomainSeparator();
      const rawBundleHash = await eip712Module.getRawBundleHash(bundle);
      const contractDigest = ethers.keccak256(ethers.concat([
        ethers.toUtf8Bytes('\x19\x01'),
        contractDomainSeparator,
        rawBundleHash
      ]));
      const contractRecovered = ethers.recoverAddress(contractDigest, signature);

      // 7. Check initial balances
      const aliceUSDCBefore = await USDC.balanceOf(alice.address);
      const safeFUSDCBefore = await fUSDC.balanceOf(predictedSafeAddress);

      // 8. Bob executes Alice's signed bundle (anyone can call this)
      const tx = await safeDeployment.connect(bob).executeTypedDataBundle(bundle, signature);
      const receipt = await tx.wait();

      // 9. Verify Alice's Safe was deployed to the predicted address
      const isDeployedAfter = await safeDeployment.isSafeDeployed(alice.address);
      expect(isDeployedAfter).to.be.true;

      const actualSafeAddress = await safeDeployment.predictSafeAddress(alice.address);
      expect(actualSafeAddress).to.equal(predictedSafeAddress);

      // 10. Verify the actions were executed correctly
      const aliceUSDCAfter = await USDC.balanceOf(alice.address);
      const safeFUSDCAfter = await fUSDC.balanceOf(predictedSafeAddress);

      // Alice should have 500 USDC less
      expect(aliceUSDCBefore - aliceUSDCAfter).to.equal(DEPOSIT_AMOUNT);

      // Alice's Safe should have received fUSDC from the Fluid deposit
      expect(safeFUSDCAfter).to.be.gt(0);
      expect(safeFUSDCAfter).to.be.gt(safeFUSDCBefore);

      // 11. Verify the sequence nonce was incremented
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      const sequenceNonce = await eip712Module.getSequenceNonce(predictedSafeAddress, chainId);
      expect(sequenceNonce).to.equal(1); // Should be incremented from 0 to 1

      // 12. Verify events were emitted
      const events = receipt?.logs || [];
      const bundleExecutedEvents = events.filter(log => {
        try {
          const parsed = eip712Module.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          return parsed?.name === 'BundleExecuted';
        } catch {
          return false;
        }
      });

      expect(bundleExecutedEvents).to.have.length.greaterThan(0);
      
      const typedDataBundleExecutedEvents = events.filter(log => {
        try {
          const parsed = safeDeployment.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          return parsed?.name === 'TypedDataBundleExecuted';
        } catch {
          return false;
        }
      });

      expect(typedDataBundleExecutedEvents).to.have.length(1);
    });

    it('Should work with an existing Safe (no deployment needed)', async () => {

      // 1. First, deploy a Safe for the user by executing a simple bundle
      const simpleBundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0),
            sequence: {
              name: 'SimpleSequence',
              actions: [], // Empty sequence just to deploy Safe
              actionIds: [],
              callData: [],
            },
          },
        ],
      };

      const simpleSignature = await signBundle(user, simpleBundle, await eip712Module.getAddress());

      await safeDeployment.connect(admin).executeTypedDataBundle(simpleBundle, simpleSignature);

      // Verify Safe exists
      const safeExists = await safeDeployment.isSafeDeployed(user.address);
      expect(safeExists).to.be.true;

      const safeAddress = await safeDeployment.predictSafeAddress(user.address);

      // 2. Now execute a complex bundle on the existing Safe
      await USDC.connect(user).approve(safeAddress, DEPOSIT_AMOUNT);

      const pullTokenCallData = await encodeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: DEPOSIT_AMOUNT,
        from: user.address,
      });

      const fluidSupplyCallData = await encodeAction({
        type: 'FluidV1Supply',
        poolAddress: tokenConfig.FLUID_V1_USDC.address,
        amount: DEPOSIT_AMOUNT,
        feeBasis: 0,
      });

      const complexBundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(1), // Second sequence
            sequence: {
              name: 'ExistingSafePullAndDeposit',
                             actions: [
                 {
                   protocolName: 'Brava',
                   actionType: 5, // TRANSFER_ACTION (PullToken)
                 },
                 {
                   protocolName: 'FluidV1',
                   actionType: 0, // DEPOSIT_ACTION (FluidV1Supply)
                 },
               ],
              actionIds: [
                getBytes4(await pullTokenAction.getAddress()),
                getBytes4(await fluidSupplyAction.getAddress()),
              ],
              callData: [pullTokenCallData, fluidSupplyCallData],
            },
          },
        ],
      };

      const complexSignature = await signBundle(user, complexBundle, await eip712Module.getAddress());

      const userUSDCBefore = await USDC.balanceOf(user.address);
      const safeFUSDCBefore = await fUSDC.balanceOf(safeAddress);

      const tx = await safeDeployment.connect(admin).executeTypedDataBundle(complexBundle, complexSignature);
      await tx.wait();

      const userUSDCAfter = await USDC.balanceOf(user.address);
      const safeFUSDCAfter = await fUSDC.balanceOf(safeAddress);

      // Verify the actions worked
      expect(userUSDCBefore - userUSDCAfter).to.equal(DEPOSIT_AMOUNT);
      expect(safeFUSDCAfter).to.be.gt(safeFUSDCBefore);

      // Verify sequence nonce incremented
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      const sequenceNonce = await eip712Module.getSequenceNonce(safeAddress, chainId);
      expect(sequenceNonce).to.equal(2); // Should be 2 now (started at 0, then 1, now 2)

      log('✅ Existing Safe flow test passed');
    });
  });

  describe('Error Handling', () => {
    it('Should fail when user tries to pull more USDC than approved', async () => {
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      
      // Only approve half the amount we're trying to pull
      const approvedAmount = DEPOSIT_AMOUNT / BigInt(2);
      await USDC.connect(user).approve(predictedSafeAddress, approvedAmount);

      const pullTokenCallData = await encodeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: DEPOSIT_AMOUNT, // Trying to pull more than approved
        from: user.address,
      });

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0),
                         sequence: {
               name: 'ExcessivePullSequence',
               actions: [
                 {
                   protocolName: 'Brava',
                   actionType: 5, // TRANSFER_ACTION (PullToken)
                 },
               ],
               actionIds: [getBytes4(await pullTokenAction.getAddress())],
               callData: [pullTokenCallData],
             },
          },
        ],
      };

      const bundleHash = await eip712Module.getBundleHash(bundle);
      const signature = await user.signMessage(ethers.getBytes(bundleHash));

      // This should fail due to insufficient allowance
      await expect(
        safeDeployment.connect(admin).executeTypedDataBundle(bundle, signature)
      ).to.be.reverted;

      log('✅ Insufficient allowance test passed');
    });

    it('Should fail when user has insufficient USDC balance', async () => {
      // Create a new user with no USDC
      const [, , poorUser] = await ethers.getSigners();
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(poorUser.address);

      // Poor user approves USDC they don't have
      await USDC.connect(poorUser).approve(predictedSafeAddress, DEPOSIT_AMOUNT);

      const pullTokenCallData = await encodeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: DEPOSIT_AMOUNT,
        from: poorUser.address,
      });

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0),
                         sequence: {
               name: 'InsufficientAllowanceSequence',
               actions: [
                 {
                   protocolName: 'Brava',
                   actionType: 5, // TRANSFER_ACTION (PullToken)
                 },
               ],
               actionIds: [getBytes4(await pullTokenAction.getAddress())],
               callData: [pullTokenCallData],
             },
          },
        ],
      };

      const bundleHash = await eip712Module.getBundleHash(bundle);
      const signature = await poorUser.signMessage(ethers.getBytes(bundleHash));

      // This should fail due to insufficient balance
      await expect(
        safeDeployment.connect(admin).executeTypedDataBundle(bundle, signature)
      ).to.be.reverted;

      log('✅ Insufficient balance test passed');
    });
  });

  describe('Gas Efficiency and Scaling', () => {
    it('Should handle multiple actions efficiently', async () => {
      
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      
      // Approve enough for multiple operations
      const totalAmount = DEPOSIT_AMOUNT * BigInt(3);
      await USDC.connect(user).approve(predictedSafeAddress, totalAmount);

      // Create multiple pull and deposit actions
      const actionDefinitions = [];
      const actionIds = [];
      const callDataArray = [];
      
      for (let i = 0; i < 3; i++) {
        const pullAmount = ethers.parseUnits('100', 6);
        
                 actionDefinitions.push({
           protocolName: 'Brava',
           actionType: 5, // TRANSFER_ACTION (PullToken)
         });
         
         actionDefinitions.push({
           protocolName: 'FluidV1',
           actionType: 0, // DEPOSIT_ACTION (FluidV1Supply)
         });

        actionIds.push(getBytes4(await pullTokenAction.getAddress()));
        actionIds.push(getBytes4(await fluidSupplyAction.getAddress()));

        callDataArray.push(await encodeAction({
          type: 'PullToken',
          token: 'USDC',
          amount: pullAmount,
          from: user.address,
        }));

        callDataArray.push(await encodeAction({
          type: 'FluidV1Supply',
          poolAddress: tokenConfig.FLUID_V1_USDC.address,
          amount: pullAmount,
          feeBasis: 0,
        }));
      }

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0),
            sequence: {
              name: 'LargeMultiActionSequence',
              actions: actionDefinitions,
              actionIds: actionIds,
              callData: callDataArray,
            },
          },
        ],
      };

      const signature = await signBundle(user, bundle, await eip712Module.getAddress());

      const userUSDCBefore = await USDC.balanceOf(user.address);
      const safeFUSDCBefore = await fUSDC.balanceOf(predictedSafeAddress);

      const tx = await safeDeployment.connect(admin).executeTypedDataBundle(bundle, signature);
      const receipt = await tx.wait();

      const userUSDCAfter = await USDC.balanceOf(user.address);
      const safeFUSDCAfter = await fUSDC.balanceOf(predictedSafeAddress);

      // Verify all actions executed
      expect(userUSDCBefore - userUSDCAfter).to.equal(ethers.parseUnits('300', 6)); // 3 * 100 USDC
      expect(safeFUSDCAfter).to.be.gt(safeFUSDCBefore);

      log(`✅ Multi-action test passed. Gas used: ${receipt?.gasUsed?.toString()}`);
    });
  });
}); 