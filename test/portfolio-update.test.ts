import { network } from 'hardhat';
import { Balance, Asset, Portfolio, Cover, Sequence } from 'brava-ts-client';
import { portfolioUpdateToSequenceWithTokenAmounts } from 'brava-ts-client';
import {
  AdminVault,
  SequenceExecutor,
  SafeDeployment,
  EIP712TypedDataSafeModule,
} from '../typechain-types';
import { ethers, Signer } from './.';
import { tokenConfig } from './constants';
import { deploy, getBaseSetup, log, getBytes4 } from './utils';
import { fundAccountWithToken } from './utils-stable';
import { createBundle, signBundle, Bundle } from './utils-eip712';
import { HardhatEthersSigner } from '.';
import { expect } from 'chai';

describe.skip('Portfolio Update with TypedData Tests', () => {
  let snapshotId: string;
  let signer: HardhatEthersSigner;
  let safeAddr: string;
  let adminVault: AdminVault;
  let loggerAddress: string;
  let sequenceExecutor: SequenceExecutor;
  let safeDeployment: SafeDeployment;
  let eip712Module: EIP712TypedDataSafeModule;
  let chainId: number;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not found');
    }

    safeAddr = await baseSetup.safe.getAddress();
    adminVault = baseSetup.adminVault;
    loggerAddress = await baseSetup.logger.getAddress();
    sequenceExecutor = baseSetup.sequenceExecutor;
    safeDeployment = baseSetup.safeDeployment;
    eip712Module = baseSetup.eip712Module;
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    log('Test setup complete:');
    log('Safe address:', safeAddr);
    log('Chain ID:', chainId);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  it('should generate sequence using portfolioUpdateToSequenceWithTokenAmounts', async () => {
    // Prepare test data for portfolio update
    const depositAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
    await fundAccountWithToken(safeAddr, 'USDC', depositAmount);

    // Define token deposits (what user wants to deposit)
    const tokenDeposits: Balance[] = [
      {
        asset: 'USDC',
        amount: depositAmount,
      },
    ];

    // Define withdrawal asset (none in this case)
    const withdrawalAsset: Asset | undefined = undefined;

    // Define current portfolio (empty - starting fresh)
    const currentPortfolio: Portfolio = {
      positions: [],
    };

    // Define target portfolio (want to put USDC into Fluid)
    const targetPortfolio: Portfolio = {
      positions: [
        {
          pool: 'fluid-usdc-116',
          amount: depositAmount,
          strategyId: 0,
        },
      ],
    };

    // No insurance covers for this test
    const covers: Cover[] = [];

    log('Generating sequence with portfolioUpdateToSequenceWithTokenAmounts...');

    // Call the portfolioUpdateToSequenceWithTokenAmounts function
    const sequence: Sequence = await portfolioUpdateToSequenceWithTokenAmounts(
      tokenDeposits,
      withdrawalAsset,
      currentPortfolio,
      targetPortfolio,
      covers,
      await signer.getAddress(), // user address
      safeAddr, // safe address
      chainId
    );

    log('Generated sequence with', sequence.actions.length, 'actions');

    // Verify the sequence has actions
    expect(sequence.actions.length).to.be.greaterThan(0);

    // Get typed data from the sequence
    const typedDataSequence = sequence.getTypedDataSequence('Portfolio Update');

    log('TypedData sequence name:', typedDataSequence.name);
    log('TypedData actions count:', typedDataSequence.actions.length);

    // Verify typed data structure
    expect(typedDataSequence.name).to.equal('Portfolio Update');
    expect(typedDataSequence.actions.length).to.equal(sequence.actions.length);
    expect(typedDataSequence.actionIds.length).to.equal(sequence.actions.length);
    expect(typedDataSequence.callData.length).to.equal(sequence.actions.length);

    log('Portfolio update sequence generated successfully with typed data');
  });

  it('should create, sign and execute bundle from portfolio update sequence', async () => {
    // Prepare test data - deposit DOUBLE the target amount to ensure we have enough
    const targetAmount = ethers.parseUnits('500', tokenConfig.USDC.decimals);
    const depositAmount = targetAmount * 2n; // Double to account for USD vs token value differences
    await fundAccountWithToken(safeAddr, 'USDC', depositAmount);

    // Deploy the required action contracts
    const fluidSupplyAction = await deploy(
      'FluidV1Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    const fluidSupplyAddress = await fluidSupplyAction.getAddress();

    const pullTokenAction = await deploy(
      'PullToken',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    const pullTokenAddress = await pullTokenAction.getAddress();

    const sendTokenAction = await deploy(
      'SendToken',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    const sendTokenAddress = await sendTokenAction.getAddress();

    // Set environment variables to override ts-client contract addresses
    process.env.CONTRACT_ADDRESS_PullToken = pullTokenAddress;
    process.env.CONTRACT_ADDRESS_SendToken = sendTokenAddress;
    process.env.CONTRACT_ADDRESS_FluidV1Supply = fluidSupplyAddress;

    log('Set environment variables:');
    log(`  CONTRACT_ADDRESS_PullToken=${pullTokenAddress}`);
    log(`  CONTRACT_ADDRESS_SendToken=${sendTokenAddress}`);
    log(`  CONTRACT_ADDRESS_FluidV1Supply=${fluidSupplyAddress}`);

    // Force reload of the ts-client module to pick up environment variables
    // Note: Dynamic imports don't use require.cache, so we'll re-import directly

    // Re-import to get fresh addresses
    const { portfolioUpdateToSequenceWithTokenAmounts: freshPortfolioUpdate } = await import(
      'brava-ts-client'
    );

    // Register the action contracts in AdminVault with correct action IDs
    const actionRegistrations = [
      {
        contract: pullTokenAction,
        address: pullTokenAddress,
        name: 'PullToken',
      },
      {
        contract: sendTokenAction,
        address: sendTokenAddress,
        name: 'SendToken',
      },
      {
        contract: fluidSupplyAction,
        address: fluidSupplyAddress,
        name: 'FluidV1Supply',
      },
    ];

    for (const registration of actionRegistrations) {
      const actionId = getBytes4(registration.address);
      log(`Registering ${registration.name} at ${registration.address} with ID ${actionId}`);
      await adminVault.proposeAction(actionId, registration.address);
      await adminVault.addAction(actionId, registration.address);
    }

    // Register the pool
    const FLUID_USDC_ADDRESS = tokenConfig.FLUID_V1_USDC.address;
    await adminVault.proposePool('FluidV1', FLUID_USDC_ADDRESS);
    await adminVault.addPool('FluidV1', FLUID_USDC_ADDRESS);

    // Define portfolio update parameters - use depositAmount for deposits but targetAmount for portfolio
    const tokenDeposits: Balance[] = [
      {
        asset: 'USDC',
        amount: depositAmount, // Full deposit amount
      },
    ];

    const currentPortfolio: Portfolio = {
      positions: [],
    };

    const targetPortfolio: Portfolio = {
      positions: [
        {
          pool: 'fluid-usdc-116',
          amount: targetAmount, // Target amount (half of deposit)
          strategyId: 0,
        },
      ],
    };

    log('Generating portfolio update sequence for execution...');
    log('Deposit amount:', depositAmount.toString(), 'USDC');
    log('Target amount:', targetAmount.toString(), 'USDC');

    // Generate the sequence using the fresh import with updated addresses
    const sequence: Sequence = await freshPortfolioUpdate(
      tokenDeposits,
      'USDC', // Set withdrawal asset to get the excess back
      currentPortfolio,
      targetPortfolio,
      [], // no covers
      await signer.getAddress(),
      safeAddr,
      chainId
    );

    // Get typed data sequence
    const typedDataSequence = sequence.getTypedDataSequence('Portfolio Execution Test');

    // Debug: log the action IDs to see what we're dealing with
    log('Action IDs in sequence:');
    typedDataSequence.actionIds.forEach((id, index) => {
      log(`  ${index}: ${id} (${typedDataSequence.actions[index].protocolName})`);
    });

    // Create a bundle for EIP712 execution
    const bundle: Bundle = createBundle({
      actions: typedDataSequence.actions,
      actionIds: typedDataSequence.actionIds,
      callData: typedDataSequence.callData,
      chainId: BigInt(chainId),
      sequenceNonce: BigInt(0),
      sequenceName: typedDataSequence.name,
      expiryOffset: 3600, // 1 hour
    });

    log('Created bundle with', bundle.sequences[0].sequence.actions.length, 'actions');

    // Sign the bundle - use Safe address as verifying contract with chainID 1 for cross-chain compatibility
    const signature = await signBundle(
      signer,
      bundle,
      safeAddr, // Use Safe address as verifying contract
      1 // Use chainID 1 for cross-chain compatibility
    );

    log('Bundle signed successfully');

    // Execute the bundle via EIP712 module
    log('Executing bundle...');
    const tx = await eip712Module.executeBundle(safeAddr, bundle, signature);
    const receipt = await tx.wait();

    log('Transaction executed successfully!');
    log('Gas used:', receipt?.gasUsed.toString());
    log('Block number:', receipt?.blockNumber);

    // Verify execution succeeded
    expect(receipt?.status).to.equal(1);
    expect(receipt?.gasUsed).to.be.greaterThan(0);

    log('Portfolio update bundle executed successfully via EIP-712 typed data');
  });
});
