// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {BravaModuleLookup} from "../../libraries/BravaModuleLookup.sol";
import {Errors} from "../../Errors.sol";
import {IActionBase} from "../../interfaces/IActionBase.sol";
import {IBravaSafeModule} from "../../interfaces/IBravaSafeModule.sol";
import {IEip712TypedDataSafeModule} from "../../interfaces/IEip712TypedDataSafeModule.sol";
import {ILogger} from "../../interfaces/ILogger.sol";
import {IMessageTransmitterV2} from "../../interfaces/IMessageTransmitterV2.sol";
import {ISafe} from "../../interfaces/safe/ISafe.sol";

/**
 * @title CCTPBundleReceiver
 * @notice Relays attested CCTP messages and executes bundles passed from tx-orchestrator
 * @dev Designed for hookless CCTP bridging - bundle data comes from offchain, not from CCTP message
 *
 *      Key design principles:
 *      - USDC mint MUST succeed (reverts if Circle's receiveMessage fails)
 *      - Bundle execution is BEST EFFORT (does not revert on failure)
 *      - If bundle fails, USDC is safely in the Safe and can be retried
 *
 *      The destination Brava module is discovered at relay time via ERC-165 introspection
 *      on the Safe's enabled modules (`BravaModuleLookup`). The receiver therefore holds no
 *      module address and survives Brava module upgrades unchanged. Auth-carrying CCTP
 *      messages route through `AuthRegistry.relayCCTPAndExecute` instead of this contract.
 *
 *      Permissionless by intent: any executor may call relay/relayWithBundle.
 */
contract CCTPBundleReceiver {

    /// @notice MessageTransmitter contract - configurable for testing
    address public immutable MESSAGE_TRANSMITTER;

    /// @notice Logger contract for emitting ActionEvent logs consumed by the indexer
    ILogger public immutable LOGGER;

    /// @notice Byte offset within a CCTP V2 message where the source domain field begins (uint32).
    uint256 private constant SOURCE_DOMAIN_OFFSET = 4;

    /// @notice Byte offset within a CCTP V2 message where the nonce field begins.
    ///         Layout: version (4) + sourceDomain (4) + destinationDomain (4) = 12 bytes.
    uint256 private constant NONCE_OFFSET = 12;

    /// @notice Byte offset within a CCTP V2 message where the BurnMessage amount field begins.
    ///         Layout: 148-byte message header + 68-byte BurnMessage prefix (version + burnToken + mintRecipient).
    uint256 private constant AMOUNT_OFFSET = 216;

    /// @notice Minimum valid CCTP V2 message size: 148-byte header + 228-byte BurnMessage fixed fields.
    uint256 private constant MIN_MESSAGE_SIZE = 376;

    function _decodeBridgeLogFields(
        bytes calldata message
    ) private pure returns (uint256 amount, bytes32 cctpNonce, uint32 sourceDomain) {
        amount = uint256(bytes32(message[AMOUNT_OFFSET:AMOUNT_OFFSET + 32]));
        sourceDomain = uint32(bytes4(message[SOURCE_DOMAIN_OFFSET:SOURCE_DOMAIN_OFFSET + 4]));
        cctpNonce = bytes32(message[NONCE_OFFSET:NONCE_OFFSET + 32]);
    }

    function _logBundleReceive(
        address safeAddress,
        bool bundleSuccess,
        bytes calldata message
    ) private {
        (uint256 amount, bytes32 cctpNonce, uint32 sourceDomain) = _decodeBridgeLogFields(message);
        LOGGER.logActionEvent(
            IActionBase.LogType.CCTP_BUNDLE_RECEIVE,
            abi.encode(safeAddress, amount, bundleSuccess, cctpNonce, sourceDomain)
        );
    }

    /**
     * @notice Constructor sets the MessageTransmitter and Logger addresses
     * @param _messageTransmitter Address of the MessageTransmitter contract (Circle's or mock for testing)
     * @param _logger Address of the Logger contract for indexer event emission
     */
    constructor(address _messageTransmitter, address _logger) {
        if (_messageTransmitter == address(0) || _logger == address(0)) {
            revert Errors.InvalidInput("CCTPBundleReceiver", "constructor");
        }
        MESSAGE_TRANSMITTER = _messageTransmitter;
        LOGGER = ILogger(_logger);
    }

    /**
     * @notice Relay a CCTP message and execute a bundle in a single transaction
     * @dev Called by tx-orchestrator with bundle data from offchain storage
     *
     *      Flow:
     *      1. Relay CCTP message via Circle's MessageTransmitter (mints USDC to Safe)
     *      2. Discover the Safe's enabled Brava module via ERC-165 (`BravaModuleLookup`)
     *      3. Execute bundle on the discovered module (best-effort, non-reverting)
     *
     *      The bundle comes from tx-orchestrator (signed by user), not from CCTP message.
     *      This bypasses CCTP's hook data size limit.
     *
     * @param message Full CCTP V2 message bytes from Circle attestation
     * @param attestation Circle attestation bytes
     * @param safeAddress The Safe address to execute the bundle on
     * @param bundle The bundle containing sequences for execution
     * @param signature EIP-712 signature from a Safe owner
     * @return relaySuccess True if receiveMessage succeeded (USDC minted)
     * @return bundleSuccess True if bundle execution succeeded
     * @return bundleReturnData Return data from bundle execution (useful for debugging)
     */
    function relayWithBundle(
        bytes calldata message,
        bytes calldata attestation,
        address safeAddress,
        IEip712TypedDataSafeModule.Bundle calldata bundle,
        bytes calldata signature
    ) external returns (
        bool relaySuccess,
        bool bundleSuccess,
        bytes memory bundleReturnData
    ) {
        _validateMessageFormat(message);

        relaySuccess = IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(message, attestation);
        if (!relaySuccess) revert Errors.CCTPReceiver_RelayFailed();

        (bundleSuccess, bundleReturnData) = _executeBundleBestEffort(safeAddress, bundle, signature);

        _logBundleReceive(safeAddress, bundleSuccess, message);
    }

    /// @dev Discovers the Safe's currently-enabled Brava module via ERC-165 and forwards the
    ///      bundle. Fully best-effort: both module discovery and execution are non-reverting
    ///      so a missing/misconfigured module cannot unwind the USDC mint.
    function _executeBundleBestEffort(
        address safeAddress,
        IEip712TypedDataSafeModule.Bundle calldata bundle,
        bytes calldata signature
    ) private returns (bool bundleSuccess, bytes memory bundleReturnData) {
        (bool found, address module) = BravaModuleLookup.tryFindEnabledBravaModule(ISafe(safeAddress));
        if (!found) {
            return (false, "");
        }
        try IBravaSafeModule(module).executeBundle(safeAddress, bundle, signature) {
            bundleSuccess = true;
        } catch (bytes memory err) {
            bundleReturnData = err;
        }
    }

    /// @dev Reverts if the message is too short or the CCTP V2 version field is not 1.
    function _validateMessageFormat(bytes calldata message) private pure {
        if (message.length < MIN_MESSAGE_SIZE) revert Errors.CCTPReceiver_BadMessage();

        uint32 version = uint32(bytes4(message[0:4]));
        if (version != 1) revert Errors.CCTPReceiver_BadVersion(version);
    }

    /**
     * @notice Simple relay without bundle execution (for USDC-only transfers or manual bundle execution)
     * @dev Useful when bundle should be executed separately or when no bundle is needed
     * @param message Full CCTP V2 message bytes
     * @param attestation Circle attestation bytes
     * @return relaySuccess True if receiveMessage succeeded
     */
    function relay(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (bool relaySuccess) {
        _validateMessageFormat(message);
        relaySuccess = IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(message, attestation);
        if (!relaySuccess) revert Errors.CCTPReceiver_RelayFailed();
    }
}
