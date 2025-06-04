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
  SequenceExecutor,
} from '../../../typechain-types';
import { encodeAction, getBaseSetup, getBytes4, log } from '../../utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';
import { tokenConfig } from '../../constants';

describe('SafeDeployment Complex Integration Tests', function () {
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let deployer: SignerWithAddress;
  let safeDeployment: SafeDeployment;
  let eip712Module: EIP712TypedDataSafeModule;
  let adminVault: AdminVault;
  let logger: Logger;
  let sequenceExecutor: SequenceExecutor;
  let pullTokenAction: PullToken;
  let fluidSupplyAction: FluidV1Supply;
  let USDC: IERC20;
  let fUSDC: IFluidLending;
  let snapshotId: string;

  const DEPOSIT_AMOUNT = ethers.parseUnits('500', 6); // $500 USDC

  before(async () => {
    [admin, user, deployer] = await ethers.getSigners();

    // Get base setup
    const baseSetup = await getBaseSetup(admin);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    sequenceExecutor = baseSetup.sequenceExecutor;

    // Get token contracts
    USDC = await getTokenContract('USDC');
    fUSDC = await ethers.getContractAt('IFluidLending', tokenConfig.FLUID_V1_USDC.address);

    // Deploy SafeDeployment (it will be initialized separately in deployment scripts)
    const SafeDeploymentFactory = await ethers.getContractFactory('SafeDeployment');
    safeDeployment = await SafeDeploymentFactory.deploy();
    await safeDeployment.waitForDeployment();

    // Deploy EIP712TypedDataSafeModule
    const EIP712ModuleFactory = await ethers.getContractFactory('EIP712TypedDataSafeModule');
    eip712Module = await EIP712ModuleFactory.deploy(
      await adminVault.getAddress(),
      await sequenceExecutor.getAddress(),
      'BravaSafeModule',
      '1.0.0'
    );
    await eip712Module.waitForDeployment();

    // Set the module in SafeDeployment
    await safeDeployment.setEIP712TypedDataModule(await eip712Module.getAddress());

    // Deploy action contracts
    const PullTokenFactory = await ethers.getContractFactory('PullToken');
    pullTokenAction = await PullTokenFactory.deploy(
      await adminVault.getAddress(),
      await logger.getAddress()
    );
    await pullTokenAction.waitForDeployment();

    const FluidSupplyFactory = await ethers.getContractFactory('FluidV1Supply');
    fluidSupplyAction = await FluidSupplyFactory.deploy(
      await adminVault.getAddress(),
      await logger.getAddress()
    );
    await fluidSupplyAction.waitForDeployment();

    // Register actions in AdminVault
    const pullTokenAddress = await pullTokenAction.getAddress();
    const pullTokenId = getBytes4(pullTokenAddress);
    await adminVault.proposeAction(pullTokenId, pullTokenAddress);
    await adminVault.addAction(pullTokenId, pullTokenAddress);

    const fluidSupplyAddress = await fluidSupplyAction.getAddress();
    const fluidSupplyId = getBytes4(fluidSupplyAddress);
    await adminVault.proposeAction(fluidSupplyId, fluidSupplyAddress);
    await adminVault.addAction(fluidSupplyId, fluidSupplyAddress);

    // Register Fluid USDC pool
    const fluidUSDCAddress = await fUSDC.getAddress();
    await adminVault.proposePool('FluidV1', fluidUSDCAddress);
    await adminVault.addPool('FluidV1', fluidUSDCAddress);

    // Fund user with USDC
    await fundAccountWithToken(user.address, 'USDC', DEPOSIT_AMOUNT * 2n);

    log('Complex integration test setup complete');
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Complex Multi-Action Bundle Execution', () => {
    it('Should predict Safe address, pre-approve USDC, and execute complex bundle with PullToken + Fluid deposit', async () => {
      // 1. Predict the Safe address for the user
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      log(`Predicted Safe address: ${predictedSafeAddress}`);

      // 2. User pre-approves USDC to the predicted Safe address
      await USDC.connect(user).approve(predictedSafeAddress, DEPOSIT_AMOUNT);
      log(`User approved ${ethers.formatUnits(DEPOSIT_AMOUNT, 6)} USDC to predicted Safe`);

      // Verify approval
      const allowance = await USDC.allowance(user.address, predictedSafeAddress);
      expect(allowance).to.equal(DEPOSIT_AMOUNT);

      // 3. Encode the actions for the bundle
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
        feeBasis: 0, // No fees for this test
      });

      // 4. Create the typed data bundle
      const actionDefinitions = [
        {
          protocolName: 'Brava',
          actionType: 4, // TRANSFER_ACTION
        },
        {
          protocolName: 'FluidV1', 
          actionType: 1, // DEPOSIT_ACTION
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
        sequenceNonce: BigInt(0), // First sequence
        sequence: sequence,
      };

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [chainSequence],
      };

      // 5. Get bundle hash from the module and sign it
      const bundleHash = await eip712Module.getBundleHash(bundle);
      const signature = await user.signMessage(ethers.getBytes(bundleHash));
      log(`Bundle signed by user: ${signature}`);

      // 6. Check initial balances
      const initialUserUSDCBalance = await USDC.balanceOf(user.address);
      const initialUserFluidBalance = await fUSDC.balanceOf(user.address);
      
      // Safe shouldn't exist yet
      const safeExists = await safeDeployment.isSafeDeployed(user.address);
      expect(safeExists).to.be.false;

      // 7. Execute the typed data bundle
      const tx = await safeDeployment.executeTypedDataBundle(bundle, signature);
      await tx.wait();

      log('Bundle executed successfully!');

      // 8. Verify the Safe was deployed
      const safeExistsAfter = await safeDeployment.isSafeDeployed(user.address);
      expect(safeExistsAfter).to.be.true;

      const actualSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      expect(actualSafeAddress).to.equal(predictedSafeAddress);

      // 9. Verify USDC was pulled from user
      const finalUserUSDCBalance = await USDC.balanceOf(user.address);
      expect(finalUserUSDCBalance).to.equal(initialUserUSDCBalance - DEPOSIT_AMOUNT);

      // 10. Verify the Safe has no USDC (it was deposited into Fluid)
      const safeUSDCBalance = await USDC.balanceOf(predictedSafeAddress);
      expect(safeUSDCBalance).to.equal(0);

      // 11. Verify the Safe has Fluid tokens (fUSDC)
      const safeFluidBalance = await fUSDC.balanceOf(predictedSafeAddress);
      expect(safeFluidBalance).to.be.greaterThan(0);
      log(`Safe received ${ethers.formatUnits(safeFluidBalance, 6)} fUSDC tokens`);

      // 12. Verify user still has no Fluid tokens (everything went to Safe)
      const finalUserFluidBalance = await fUSDC.balanceOf(user.address);
      expect(finalUserFluidBalance).to.equal(initialUserFluidBalance);

      // 13. Verify the module is enabled on the deployed Safe
      const safe = await ethers.getContractAt('Safe', predictedSafeAddress);
      const isModuleEnabled = await safe.isModuleEnabled(await eip712Module.getAddress());
      expect(isModuleEnabled).to.be.true;

      log('All verifications passed! Complex integration test successful.');
    });

    it('Should handle bundle execution with existing Safe', async () => {
      // First, deploy a Safe for the user by executing a simple bundle
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

      const simpleBundleHash = await eip712Module.getBundleHash(simpleBundle);
      const simpleSignature = await user.signMessage(ethers.getBytes(simpleBundleHash));

      await safeDeployment.executeTypedDataBundle(simpleBundle, simpleSignature);

      // Verify Safe exists
      const safeExists = await safeDeployment.isSafeDeployed(user.address);
      expect(safeExists).to.be.true;

      const safeAddress = await safeDeployment.predictSafeAddress(user.address);

      // Now approve USDC to the existing Safe
      await USDC.connect(user).approve(safeAddress, DEPOSIT_AMOUNT);

      // Create a complex bundle to execute on the existing Safe
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
                  actionType: 4, // TRANSFER_ACTION
                },
                {
                  protocolName: 'FluidV1',
                  actionType: 1, // DEPOSIT_ACTION
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

      const complexBundleHash = await eip712Module.getBundleHash(complexBundle);
      const complexSignature = await user.signMessage(ethers.getBytes(complexBundleHash));

      // Check initial balances
      const initialUserUSDCBalance = await USDC.balanceOf(user.address);
      const initialSafeFluidBalance = await fUSDC.balanceOf(safeAddress);

      // Execute the complex bundle
      await safeDeployment.executeTypedDataBundle(complexBundle, complexSignature);

      // Verify results
      const finalUserUSDCBalance = await USDC.balanceOf(user.address);
      expect(finalUserUSDCBalance).to.equal(initialUserUSDCBalance - DEPOSIT_AMOUNT);

      const finalSafeFluidBalance = await fUSDC.balanceOf(safeAddress);
      expect(finalSafeFluidBalance).to.be.greaterThan(initialSafeFluidBalance);

      log('Existing Safe bundle execution successful!');
    });

    it('Should fail if user has insufficient USDC balance', async () => {
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      
      // Try to pull more USDC than user has
      const excessiveAmount = ethers.parseUnits('10000', 6);
      await USDC.connect(user).approve(predictedSafeAddress, excessiveAmount);

      const pullTokenCallData = await encodeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: excessiveAmount,
        from: user.address,
      });

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0), // First sequence
            sequence: {
              name: 'ExcessivePullSequence',
              actions: [
                {
                  protocolName: 'Brava',
                  actionType: 4, // TRANSFER_ACTION
                },
              ],
              actionIds: [
                getBytes4(await pullTokenAction.getAddress()),
              ],
              callData: [pullTokenCallData],
            },
          },
        ],
      };

      const bundleHash = await eip712Module.getBundleHash(bundle);
      const signature = await user.signMessage(ethers.getBytes(bundleHash));

      // Should revert due to insufficient balance
      await expect(
        safeDeployment.executeTypedDataBundle(bundle, signature)
      ).to.be.revertedWith('GS013'); // Safe transaction execution failed
    });

    it('Should fail if user has not approved sufficient USDC allowance', async () => {
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      
      // Only approve half the amount we want to pull
      await USDC.connect(user).approve(predictedSafeAddress, DEPOSIT_AMOUNT / 2n);

      const pullTokenCallData = await encodeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: DEPOSIT_AMOUNT,
        from: user.address,
      });

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0), // First sequence
            sequence: {
              name: 'InsufficientAllowanceSequence',
              actions: [
                {
                  protocolName: 'Brava',
                  actionType: 4, // TRANSFER_ACTION
                },
              ],
              actionIds: [
                getBytes4(await pullTokenAction.getAddress()),
              ],
              callData: [pullTokenCallData],
            },
          },
        ],
      };

      const bundleHash = await eip712Module.getBundleHash(bundle);
      const signature = await user.signMessage(ethers.getBytes(bundleHash));

      // Should revert due to insufficient allowance
      await expect(
        safeDeployment.executeTypedDataBundle(bundle, signature)
      ).to.be.revertedWith('GS013'); // Safe transaction execution failed
    });
  });

  describe('Gas Optimization and Edge Cases', () => {
    it('Should efficiently execute large multi-action sequences', async () => {
      const predictedSafeAddress = await safeDeployment.predictSafeAddress(user.address);
      
      // Approve a larger amount
      const largeAmount = ethers.parseUnits('1000', 6);
      await fundAccountWithToken(user.address, 'USDC', largeAmount);
      await USDC.connect(user).approve(predictedSafeAddress, largeAmount);

      // Create multiple pull and deposit actions
      const actionDefinitions = [];
      const actionIds = [];
      const callDataArray = [];
      
      for (let i = 0; i < 3; i++) {
        const pullAmount = ethers.parseUnits('100', 6);
        
        // Add PullToken action
        actionDefinitions.push({
          protocolName: 'Brava',
          actionType: 4, // TRANSFER_ACTION
        });
        actionIds.push(getBytes4(await pullTokenAction.getAddress()));
        callDataArray.push(await encodeAction({
          type: 'PullToken',
          token: 'USDC',
          amount: pullAmount,
          from: user.address,
        }));

        // Add FluidV1Supply action
        actionDefinitions.push({
          protocolName: 'FluidV1',
          actionType: 1, // DEPOSIT_ACTION
        });
        actionIds.push(getBytes4(await fluidSupplyAction.getAddress()));
        callDataArray.push(await encodeAction({
          type: 'FluidV1Supply',
          poolAddress: tokenConfig.FLUID_V1_USDC.address,
          amount: pullAmount,
          feeBasis: 0,
        }));
      }

      const bundle = {
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        sequences: [
          {
            chainId: BigInt(31337),
            sequenceNonce: BigInt(0), // First sequence
            sequence: {
              name: 'LargeMultiActionSequence',
              actions: actionDefinitions,
              actionIds: actionIds,
              callData: callDataArray,
            },
          },
        ],
      };

      const bundleHash = await eip712Module.getBundleHash(bundle);
      const signature = await user.signMessage(ethers.getBytes(bundleHash));

      const initialUserUSDCBalance = await USDC.balanceOf(user.address);

      // Execute the large bundle
      const tx = await safeDeployment.executeTypedDataBundle(bundle, signature);
      const receipt = await tx.wait();

      log(`Large bundle executed with ${receipt?.gasUsed} gas`);

      // Verify all actions were executed
      const finalUserUSDCBalance = await USDC.balanceOf(user.address);
      const expectedDeduction = ethers.parseUnits('300', 6); // 3 * 100 USDC
      expect(finalUserUSDCBalance).to.equal(initialUserUSDCBalance - expectedDeduction);

      const safeFluidBalance = await fUSDC.balanceOf(predictedSafeAddress);
      expect(safeFluidBalance).to.be.greaterThan(0);
    });
  });
}); 