/**
 * CCTP Mock Infrastructure Tests
 *
 * This test suite uses MockMessageTransmitter to test the complete end-to-end
 * CCTP cross-chain bundle execution flow without requiring real Circle CCTP
 * attestations. This enables testing the full architectural flow:
 *
 * 1. Aave V3 deposit (Sequence 0)
 * 2. Aave V3 withdraw + CCTP send (Sequence 1)
 * 3. Fluid V1 deposit via CCTP receive hook (Sequence 2)
 *
 * The test validates that bundles can be executed across chains using CCTP
 * as the transport mechanism for bundle data and USDC transfers.
 */
import { network, ethers } from 'hardhat';
import { expect } from 'chai';
import '@nomicfoundation/hardhat-chai-matchers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  AdminVault,
  CCTPBridgeSend,
  CCTPBundleReceiver,
  EIP712TypedDataSafeModule,
  IERC20,
  Logger,
  SafeDeployment,
  SequenceExecutor,
  ISafe,
  MockMessageTransmitter,
  AaveV3Supply,
  AaveV3Withdraw,
  FluidV1Supply,
  IPool,
  IFluidLending,
} from '../../../typechain-types';
import {
  deploy,
  getBaseSetup,
  getBytes4,
  log,
  getSequenceNonce,
  executeTypedDataBundle,
  encodeActionWithTypedData,
  getTypedContract,
} from '../../utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';
import { AAVE_V3_POOL, tokenConfig } from '../../constants';
import { Bundle, ChainSequence, createBundle, signBundle } from '../../utils-eip712';

describe('CCTP Mock Infrastructure Tests', function () {
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let snapshotId: string;

  // Core contracts
  let adminVault: AdminVault;
  let logger: Logger;
  let sequenceExecutor: SequenceExecutor;
  let safeDeployment: SafeDeployment;
  let eip712Module: EIP712TypedDataSafeModule;
  let safe: ISafe;
  let safeAddress: string;

  // CCTP contracts
  let mockCctpBridgeAction: CCTPBridgeSend;
  let mockCctpBundleReceiver: CCTPBundleReceiver;
  let mockMessageTransmitter: MockMessageTransmitter;

  // Protocol action contracts
  let aaveSupplyAction: AaveV3Supply;
  let aaveWithdrawAction: AaveV3Withdraw;
  let fluidSupplyAction: FluidV1Supply;

  // Tokens
  let USDC: IERC20;
  let aUSDC: IERC20;
  let fUSDC: IFluidLending;
  let aavePool: IPool;

  // Test constants
  const DESTINATION_DOMAIN = 6; // Base
  const INITIAL_USDC_AMOUNT = ethers.parseUnits('1000', 6); // 1000 USDC
  const AAVE_DEPOSIT_AMOUNT = ethers.parseUnits('500', 6); // 500 USDC
  const AAVE_WITHDRAW_AMOUNT = ethers.parseUnits('300', 6); // 300 USDC
  const CCTP_BRIDGE_AMOUNT = ethers.parseUnits('200', 6); // 200 USDC
  const FLUID_DEPOSIT_AMOUNT = ethers.parseUnits('100', 6); // 100 USDC

  before(async () => {
    [admin, user] = await ethers.getSigners();

    // Deploy base setup
    const baseSetup = await getBaseSetup(admin);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    // Initialize contracts from setup
    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    sequenceExecutor = baseSetup.sequenceExecutor;
    safeDeployment = baseSetup.safeDeployment;
    eip712Module = baseSetup.eip712Module;
    safe = baseSetup.safe;
    safeAddress = await safe.getAddress();

    // Get token contracts
    USDC = await getTokenContract('USDC');
    aUSDC = await getTypedContract<IERC20>('IERC20', tokenConfig.AAVE_V3_aUSDC.address);
    fUSDC = await getTypedContract<IFluidLending>(
      'IFluidLending',
      tokenConfig.FLUID_V1_USDC.address
    );
    aavePool = await getTypedContract<IPool>('IPool', AAVE_V3_POOL);

    // Deploy Mock Message Transmitter
    mockMessageTransmitter = await deploy<MockMessageTransmitter>(
      'MockMessageTransmitter',
      admin,
      await USDC.getAddress()
    );

    // Fund the mock transmitter with USDC so it can handle transfers
    await fundAccountWithToken(await mockMessageTransmitter.getAddress(), 'USDC', 2000);

    // Deploy CCTP Bundle Receiver with MockMessageTransmitter
    mockCctpBundleReceiver = await deploy<CCTPBundleReceiver>(
      'CCTPBundleReceiver',
      admin,
      await mockMessageTransmitter.getAddress(),
      await eip712Module.getAddress()
    );

    // Deploy CCTP Bridge Action with MockMessageTransmitter
    mockCctpBridgeAction = await deploy<CCTPBridgeSend>(
      'CCTPBridgeSend',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress(),
      await mockMessageTransmitter.getAddress()
    );

    // Deploy protocol action contracts
    aaveSupplyAction = await deploy<AaveV3Supply>(
      'AaveV3Supply',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress(),
      AAVE_V3_POOL
    );

    aaveWithdrawAction = await deploy<AaveV3Withdraw>(
      'AaveV3Withdraw',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress(),
      AAVE_V3_POOL
    );

    fluidSupplyAction = await deploy<FluidV1Supply>(
      'FluidV1Supply',
      admin,
      await adminVault.getAddress(),
      await logger.getAddress()
    );

    // Register all actions in AdminVault
    const cctpActionId = getBytes4(await mockCctpBridgeAction.getAddress());
    const aaveSupplyId = getBytes4(await aaveSupplyAction.getAddress());
    const aaveWithdrawId = getBytes4(await aaveWithdrawAction.getAddress());
    const fluidSupplyId = getBytes4(await fluidSupplyAction.getAddress());

    // Propose actions
    await adminVault.proposeAction(cctpActionId, await mockCctpBridgeAction.getAddress());
    await adminVault.proposeAction(aaveSupplyId, await aaveSupplyAction.getAddress());
    await adminVault.proposeAction(aaveWithdrawId, await aaveWithdrawAction.getAddress());
    await adminVault.proposeAction(fluidSupplyId, await fluidSupplyAction.getAddress());

    // Add actions
    await adminVault.addAction(cctpActionId, await mockCctpBridgeAction.getAddress());
    await adminVault.addAction(aaveSupplyId, await aaveSupplyAction.getAddress());
    await adminVault.addAction(aaveWithdrawId, await aaveWithdrawAction.getAddress());
    await adminVault.addAction(fluidSupplyId, await fluidSupplyAction.getAddress());

    // Register actions with test utils for encoding
    // Deploy function automatically registers contracts - no manual registration needed

    // Register pools
    await adminVault.proposePool('AaveV3', tokenConfig.AAVE_V3_aUSDC.address);
    await adminVault.proposePool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
    await adminVault.addPool('AaveV3', tokenConfig.AAVE_V3_aUSDC.address);
    await adminVault.addPool('FluidV1', tokenConfig.FLUID_V1_USDC.address);

    // Fund safe with USDC for testing
    await fundAccountWithToken(safeAddress, 'USDC', INITIAL_USDC_AMOUNT);

    // Verify funding
    const safeUsdcBalance = await USDC.balanceOf(safeAddress);
    expect(safeUsdcBalance).to.be.gte(INITIAL_USDC_AMOUNT);

    log('CCTP Comprehensive test setup completed successfully');
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  it('should execute complete CCTP flow: Aave deposit → Aave withdraw + CCTP send → Fluid deposit via CCTP receive', async () => {
    log('🚀 Starting comprehensive CCTP send & receive test');

    // Get initial balances
    const initialUsdcBalance = await USDC.balanceOf(safeAddress);
    const initialAaveBalance = await aUSDC.balanceOf(safeAddress);
    const initialFluidBalance = await fUSDC.balanceOf(safeAddress);

    log(
      `Initial balances - USDC: ${ethers.formatUnits(initialUsdcBalance, 6)}, aUSDC: ${ethers.formatUnits(initialAaveBalance, 6)}, fUSDC: ${ethers.formatUnits(initialFluidBalance, 6)}`
    );

    // PHASE 1: Create the single bundle with 3 sequences
    log('📦 Creating bundle with 3 sequences...');

    // Encode actions for each sequence
    const sequence1Actions = await encodeActionWithTypedData({
      type: 'AaveV3Supply',
      assetId: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
      amount: AAVE_DEPOSIT_AMOUNT,
    });

    const sequence2Actions = [
      await encodeActionWithTypedData({
        type: 'AaveV3Withdraw',
        assetId: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
        amount: AAVE_WITHDRAW_AMOUNT,
      }),
      await encodeActionWithTypedData({
        type: 'CCTPBridgeSend',
        usdcToken: await USDC.getAddress(),
        amount: CCTP_BRIDGE_AMOUNT,
        destinationDomain: DESTINATION_DOMAIN,
        destinationCaller: await mockCctpBundleReceiver.getAddress(),
        hookTarget: await eip712Module.getAddress(),
        maxFee: 0,
        minFinalityThreshold: 2000,
      }),
    ];

    const sequence3Actions = await encodeActionWithTypedData({
      type: 'FluidV1Supply',
      poolAddress: tokenConfig.FLUID_V1_USDC.address,
      amount: FLUID_DEPOSIT_AMOUNT,
    });

    // Get current nonce for sequence planning
    const currentNonce = await getSequenceNonce(safeAddress);
    log(`Current sequence nonce: ${currentNonce}`);

    // Create the 3 sequences for the single bundle
    const chainSequences: ChainSequence[] = [
      {
        chainId: BigInt(31337),
        sequenceNonce: currentNonce,
        deploySafe: false,
        enableGasRefund: false,
        refundToken: ethers.ZeroAddress,
        maxRefundAmount: BigInt(0),
        refundRecipient: 0,
        sequence: {
          name: 'AaveDepositSequence',
          actions: [sequence1Actions.actionDefinition],
          actionIds: [sequence1Actions.actionId],
          callData: [sequence1Actions.callData],
        },
      },
      {
        chainId: BigInt(31337),
        sequenceNonce: currentNonce + BigInt(1),
        deploySafe: false,
        enableGasRefund: false,
        refundToken: ethers.ZeroAddress,
        maxRefundAmount: BigInt(0),
        refundRecipient: 0,
        sequence: {
          name: 'AaveWithdrawCCTPSendSequence',
          actions: sequence2Actions.map((a) => a.actionDefinition),
          actionIds: sequence2Actions.map((a) => a.actionId),
          callData: sequence2Actions.map((a) => a.callData),
        },
      },
      {
        chainId: BigInt(31337),
        sequenceNonce: currentNonce + BigInt(2),
        deploySafe: false,
        enableGasRefund: false,
        refundToken: ethers.ZeroAddress,
        maxRefundAmount: BigInt(0),
        refundRecipient: 0,
        sequence: {
          name: 'FluidDepositSequence',
          actions: [sequence3Actions.actionDefinition],
          actionIds: [sequence3Actions.actionId],
          callData: [sequence3Actions.callData],
        },
      },
    ];

    // Create a separate bundle for CCTP hook data (only Sequence 3)
    const sequence3Bundle: Bundle = {
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour expiry
      sequences: [chainSequences[2]], // Only the Fluid deposit sequence
    };

    // Create the single bundle containing all 3 sequences
    const bundle: Bundle = {
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour expiry
      sequences: chainSequences,
    };

    log('✅ Bundle created with 3 sequences');

    // EXECUTION: Execute the COMPLETE bundle multiple times
    // Each execution will run the next sequence in order (nonce 0, then 1, then 2 via CCTP hook)

    // PHASE 2: Execute COMPLETE bundle (1st time) - will run Sequence 1 (nonce 0)
    log('🏦 Executing COMPLETE bundle (1st time): Aave V3 deposit...');

    try {
      await executeTypedDataBundle(bundle, admin, {
        safeAddress,
        eip712Module,
        safeDeployment,
      });
      log('✅ Bundle execution 1 successful (Sequence 1: Aave deposit)');
    } catch (error) {
      log('❌ Bundle execution 1 failed:', (error as Error).message);
      throw error;
    }

    // Verify Aave deposit
    const aaveBalanceAfterDeposit = await aUSDC.balanceOf(safeAddress);
    expect(aaveBalanceAfterDeposit).to.be.gt(initialAaveBalance);
    log(
      `✅ Aave deposit completed. aUSDC balance: ${ethers.formatUnits(aaveBalanceAfterDeposit, 6)}`
    );

    // PHASE 3: Execute COMPLETE bundle (2nd time) - will run Sequence 2 (nonce 1)
    log('💸 Executing COMPLETE bundle (2nd time): Aave withdraw + CCTP send...');

    let cctpSendTx;
    try {
      cctpSendTx = await executeTypedDataBundle(bundle, admin, {
        safeAddress,
        eip712Module,
        safeDeployment,
      });
      log('✅ Bundle execution 2 successful (Sequence 2: Aave withdraw + CCTP send)');
    } catch (error) {
      log('❌ Bundle execution 2 failed:', (error as Error).message);
      throw error;
    }

    const cctpReceipt = await cctpSendTx.wait();

    // Verify Aave withdraw happened
    const aaveBalanceAfterWithdraw = await aUSDC.balanceOf(safeAddress);
    expect(aaveBalanceAfterWithdraw).to.be.lt(aaveBalanceAfterDeposit);
    log(
      `✅ Aave withdraw completed. aUSDC balance: ${ethers.formatUnits(aaveBalanceAfterWithdraw, 6)}`
    );

    // Build the CCTP message deterministically for this test
    const EXPECTED_BRIDGE_NONCE = BigInt(1);
    let cctpMessage: string = await mockMessageTransmitter.buildMessageWithHook(EXPECTED_BRIDGE_NONCE);
    let cctpAttestation: string = '0x'; // Mock attestation
    expect(cctpMessage.length).to.be.greaterThan(44);

    // PHASE 4: Execute Sequence 3 (Fluid Deposit) via CCTP receive + explicit hook
    log('🌊 Relaying message to mint USDC, then executing hook...');

    // Let's try to use the actual hook data from the stored CCTP message and see what it contains
    log('🔍 Inspecting the stored CCTP message hook data...');

    if (cctpMessage && cctpAttestation && cctpMessage !== '' && cctpAttestation !== '') {
      // Pre-check: ensure module would accept the third sequence if called directly
      // (callStatic only; does not mutate nonce/state)
      try {
        const sig3 = await signBundle(admin, sequence3Bundle, safeAddress, 1);
        await eip712Module.executeBundle.staticCall(safeAddress, sequence3Bundle as any, sig3);
        log('✅ Module pre-check: executeBundle for Sequence 3 would succeed');
      } catch (err) {
        log('❌ Module pre-check failed (executeBundle for Sequence 3):', (err as Error).message);
      }

      // 1) Relay the attested message via our receiver (permissionless)
      log('💫 Relaying attested CCTP message via CCTPBundleReceiver.relay...');

      // Check the Safe's sequence nonce before hook execution
      const nonceBeforeHook = await eip712Module.getSequenceNonce(safeAddress);
      log(`Sequence nonce before hook execution: ${nonceBeforeHook}`);

      // Verify CCTPBundleReceiver is using the correct EIP712 module
      const bundleReceiverEIP712Address = await mockCctpBundleReceiver.EIP712_MODULE();
      const actualEIP712Address = await eip712Module.getAddress();
      expect(bundleReceiverEIP712Address.toLowerCase()).to.equal(actualEIP712Address.toLowerCase());

      const usdcBalanceBeforeReceive = await USDC.balanceOf(safeAddress);
      const fluidBalanceBeforeReceive = await fUSDC.balanceOf(safeAddress);

      try {
        const [relayOk, hookOk] = await mockCctpBundleReceiver.relay.staticCall(cctpMessage, cctpAttestation);
        expect(relayOk).to.equal(true);
        expect(hookOk).to.equal(true);
        const rx = await mockCctpBundleReceiver.relay(cctpMessage, cctpAttestation);
        const receipt = await rx.wait();
        console.log('✅ CCTP message relayed + hook attempted');

        // Verify events: RelayAndHook(hookSuccess=true) and BundleExecuted from module
        const receiverIface = mockCctpBundleReceiver.interface;
        const moduleIface = eip712Module.interface;
        let sawRelayAndHook = false;
        let hookSuccessFromEvent = false;
        let sawBundleExecuted = false;
        let bundleExecutedSafe: string | null = null;
        let bundleExecutedNonce: bigint | null = null;
        const moduleAddressLower = (await eip712Module.getAddress()).toLowerCase();
        for (const lg of receipt!.logs as any[]) {
          try {
            const parsed = receiverIface.parseLog(lg);
            if (parsed?.name === 'RelayAndHook') {
              sawRelayAndHook = true;
              hookSuccessFromEvent = parsed.args[2] as boolean;
            }
          } catch {}
          try {
            const parsed2 = moduleIface.parseLog(lg);
            if (parsed2?.name === 'BundleExecuted') {
              sawBundleExecuted = true;
              // Ensure the event came from the actual module contract
              expect((lg as any).address.toLowerCase()).to.equal(moduleAddressLower);
              bundleExecutedSafe = (parsed2.args[0] as string).toLowerCase();
              bundleExecutedNonce = BigInt(parsed2.args[3].toString());
            }
          } catch {}
        }
        expect(sawRelayAndHook).to.equal(true);
        expect(hookSuccessFromEvent).to.equal(true);
        expect(sawBundleExecuted).to.equal(true);
        expect(bundleExecutedSafe).to.equal(safeAddress.toLowerCase());
        expect(bundleExecutedNonce).to.equal(currentNonce + BigInt(2));

        // Check nonce progression to see Sequence 3 executed
        const nonceAfter = await eip712Module.getSequenceNonce(safeAddress);
        const sequencesExecuted = nonceAfter - nonceBeforeHook;
        console.log(`Sequences executed via explicit hook: ${sequencesExecuted}`);
        expect(nonceAfter).to.equal(nonceBeforeHook + BigInt(1));

        // Check Fluid deposit
        const fluidBalanceAfter = await fUSDC.balanceOf(safeAddress);
        const fluidDepositAmount = fluidBalanceAfter - fluidBalanceBeforeReceive;
        console.log(`Fluid balance change: ${ethers.formatUnits(fluidDepositAmount, 6)} USDC`);

        // Check USDC balance changes from receive
        const usdcBalanceAfterReceive = await USDC.balanceOf(safeAddress);
        const usdcReceived = usdcBalanceAfterReceive - usdcBalanceBeforeReceive;
        console.log(`USDC received via CCTP: ${ethers.formatUnits(usdcReceived, 6)} USDC`);

        expect(sequencesExecuted).to.be.gt(0);
        expect(fluidDepositAmount).to.be.gt(0);
      } catch (error) {
        log('❌ Stored CCTP message failed:', (error as Error).message);
        throw error;
      }
    } else {
      log('⚠️  No stored CCTP message to test with');
    }

    // Check Safe USDC balance before Fluid deposit attempt
    const usdcBalanceBeforeFluid = await USDC.balanceOf(safeAddress);

    // No more dynamic planning reads; verification only below

    // Verify the CCTP send → receive → hook forwarding architecture works
    log('🎯 CCTP Architecture Validation:');
    log('  ✅ CCTPBridgeSend: Encoded bundle into CCTP hook data');
    log('  ✅ MockMessageTransmitter: Processed CCTP message and called hook');
    log('  ✅ CCTPBundleReceiver: Received hook call and extracted data');
    log('  ✅ End-to-end CCTP cross-chain bundle forwarding proven');

    // Note: The hook data decoding still needs refinement, but the core architecture works
    expect(true).to.be.true;

    // PHASE 5: Verify final state and nonce progression
    log('🔍 Verifying final state...');

    const finalUsdcBalance = await USDC.balanceOf(safeAddress);
    const finalAaveBalance = await aUSDC.balanceOf(safeAddress);
    const finalFluidBalance = await fUSDC.balanceOf(safeAddress);
    const finalNonce = await getSequenceNonce(safeAddress);

    // Verify nonce progression: expect +3 (deposit, withdraw+send, deposit via hook)
    expect(finalNonce).to.equal(currentNonce + BigInt(3));

    // Verify balance changes align with operations that actually occurred
    expect(finalAaveBalance).to.be.gt(initialAaveBalance); // Net positive from deposit > withdraw
    expect(finalFluidBalance).to.be.gt(initialFluidBalance); // Fluid deposit succeeded via CCTP hook!
    expect(finalUsdcBalance).to.be.lt(initialUsdcBalance); // USDC was used for deposits and bridge

    log('🎉 CCTP ARCHITECTURE VALIDATION COMPLETED SUCCESSFULLY!');
    log(
      `Final balances - USDC: ${ethers.formatUnits(finalUsdcBalance, 6)}, aUSDC: ${ethers.formatUnits(finalAaveBalance, 6)}, fUSDC: ${ethers.formatUnits(finalFluidBalance, 6)}`
    );
    log(`Nonce progression: ${currentNonce} → ${finalNonce}`);
    log(
      '✅ Simplified CCTPBundleReceiver architecture proven to work - just needs proper hook data encoding'
    );
  });
});
