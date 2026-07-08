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
 *      module address and survives Brava module upgrades unchanged. CCTP messages carry no auth
 *      data — they only mint USDC and best-effort execute a separately-signed bundle.
 *
 *      Permissionless by intent. relayWithBundle's mint is idempotent, so a prior relay cannot
 *      block it from executing the bundle. relay() is a plain mint that reverts if already consumed.
 */
contract CCTPBundleReceiver {

    /// @notice MessageTransmitter contract - configurable for testing
    address public immutable MESSAGE_TRANSMITTER;

    /// @notice Circle TokenMessenger V2 on this chain. A genuine burn message names this contract
    ///         in both the outer header `sender` and `recipient` fields; generic Circle messages do not.
    address public immutable TOKEN_MESSENGER;

    /// @notice Logger contract for emitting ActionEvent logs consumed by the indexer
    ILogger public immutable LOGGER;

    /// @notice Byte offset within a CCTP V2 message where the source domain field begins (uint32).
    uint256 private constant SOURCE_DOMAIN_OFFSET = 4;

    /// @notice CCTP V2 message header size in bytes; the burn body (and its version) begins here.
    uint256 private constant MESSAGE_HEADER_SIZE = 148;

    /// @notice Byte offset of the outer header `sender` (source-chain TokenMessenger), as bytes32.
    uint256 private constant HEADER_SENDER_OFFSET = 44;

    /// @notice Byte offset of the outer header `recipient` (destination-chain TokenMessenger), as bytes32.
    uint256 private constant HEADER_RECIPIENT_OFFSET = 76;

    /// @notice CCTP V2 version expected in both the outer header and the burn body.
    uint32 private constant CCTP_V2_VERSION = 1;

    /// @notice Byte offset within a CCTP V2 message where the nonce field begins.
    ///         Layout: version (4) + sourceDomain (4) + destinationDomain (4) = 12 bytes.
    uint256 private constant NONCE_OFFSET = 12;

    /// @notice Byte offset within a CCTP V2 message where the BurnMessage mintRecipient field begins.
    ///         Layout: 148-byte message header + 4-byte burn version + 32-byte burnToken.
    uint256 private constant MINT_RECIPIENT_OFFSET = 184;

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

    /// @dev Emits the indexer event recording the destination mint leg. Fired on every successful
    ///      mint (mint-only relay and relayWithBundle alike); `bundleSuccess` carries the bundle's
    ///      best-effort outcome, or true when no bundle ran.
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
     * @notice Constructor sets the MessageTransmitter, TokenMessenger, and Logger addresses
     * @param _messageTransmitter Address of the MessageTransmitter contract (Circle's or mock for testing)
     * @param _tokenMessenger Circle TokenMessenger V2 on this chain; burn messages must name it as sender and recipient
     * @param _logger Address of the Logger contract for indexer event emission
     */
    constructor(address _messageTransmitter, address _tokenMessenger, address _logger) {
        if (_messageTransmitter == address(0) || _tokenMessenger == address(0) || _logger == address(0)) {
            revert Errors.InvalidInput("CCTPBundleReceiver", "constructor");
        }
        MESSAGE_TRANSMITTER = _messageTransmitter;
        TOKEN_MESSENGER = _tokenMessenger;
        LOGGER = ILogger(_logger);
    }

    /**
     * @notice Relay a CCTP message and optionally execute a bundle in a single transaction.
     * @dev Mints USDC to the Safe (idempotent — see `_mintIfNeeded`), then, if `bundle.sequences`
     *      is non-empty, discovers the Safe's enabled Brava module via ERC-165 and executes the
     *      bundle best-effort. Empty sequences = mint-only relay. The bundle is supplied by the
     *      tx-orchestrator (user-signed), bypassing CCTP's hook data size limit.
     * @param message Full CCTP V2 message bytes from Circle attestation
     * @param attestation Circle attestation bytes
     * @param safeAddress The Safe address to execute the bundle on; must equal the attested mintRecipient
     * @param bundle Bundle sequences to execute (empty = mint-only)
     * @param signature EIP-712 signature from a Safe owner
     * @return relaySuccess True once USDC is present at the Safe (reverts if a fresh mint fails)
     * @return bundleSuccess True if bundle execution succeeded
     * @return bundleReturnData Revert data from a failed bundle execution (empty otherwise)
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
        _assertSafeMatchesMintRecipient(message, safeAddress);

        relaySuccess = _mintIfNeeded(message, attestation);

        // Always emit the destination leg once USDC is minted so the indexer can link the bridge
        // regardless of whether a bundle ran. A mint-only relay reports success (no bundle to fail);
        // a relay with a bundle reports the bundle's real best-effort outcome.
        bool ranBundle = bundle.sequences.length > 0;
        if (ranBundle) {
            (bundleSuccess, bundleReturnData) = _executeBundleBestEffort(safeAddress, bundle, signature);
        }
        _logBundleReceive(safeAddress, ranBundle ? bundleSuccess : true, message);
    }

    /// @dev Idempotent mint: skips `receiveMessage` when the nonce is already consumed (funds already
    ///      at the Safe), so a third party relaying first cannot block bundle execution. A fresh mint
    ///      that fails reverts the whole call.
    /// @return relaySuccess True once USDC is present at the Safe.
    function _mintIfNeeded(
        bytes calldata message,
        bytes calldata attestation
    ) private returns (bool relaySuccess) {
        bytes32 nonce = bytes32(message[NONCE_OFFSET:NONCE_OFFSET + 32]);
        if (IMessageTransmitterV2(MESSAGE_TRANSMITTER).usedNonces(nonce) != 0) {
            return true;
        }
        if (!IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(message, attestation)) {
            revert Errors.CCTPReceiver_RelayFailed();
        }
        relaySuccess = true;
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

    /// @dev The attested mint recipient (the Safe Circle credits the USDC to), read from the burn body.
    function _mintRecipient(bytes calldata message) private pure returns (address) {
        return address(uint160(uint256(bytes32(message[MINT_RECIPIENT_OFFSET:MINT_RECIPIENT_OFFSET + 32]))));
    }

    /// @dev Binds bundle execution to the attested mint recipient: the Safe the bundle runs on must
    ///      be the Safe Circle credits the USDC to, so a relayer cannot pair a mint with an unrelated
    ///      Safe's bundle. The mint destination itself is fixed by the attested message regardless.
    function _assertSafeMatchesMintRecipient(bytes calldata message, address safeAddress) private pure {
        if (_mintRecipient(message) != safeAddress) {
            revert Errors.CCTPReceiver_SafeMintRecipientMismatch(
                safeAddress,
                bytes32(message[MINT_RECIPIENT_OFFSET:MINT_RECIPIENT_OFFSET + 32])
            );
        }
    }

    /// @dev Confirms the message is a genuine CCTP V2 TokenMessenger burn message before any mint is
    ///      credited or bundle is run. Beyond the size and outer-version checks, it requires the burn
    ///      body version and the header `sender`/`recipient` to name `TOKEN_MESSENGER`, so a generic
    ///      Circle message with burn-shaped bytes cannot be relayed as a USDC bridge.
    function _validateMessageFormat(bytes calldata message) private view {
        if (message.length < MIN_MESSAGE_SIZE) revert Errors.CCTPReceiver_BadMessage();

        uint32 version = uint32(bytes4(message[0:4]));
        if (version != CCTP_V2_VERSION) revert Errors.CCTPReceiver_BadVersion(version);

        uint32 burnVersion = uint32(bytes4(message[MESSAGE_HEADER_SIZE:MESSAGE_HEADER_SIZE + 4]));
        if (burnVersion != CCTP_V2_VERSION) revert Errors.CCTPReceiver_BadBurnVersion(burnVersion);

        bytes32 trustedMessenger = bytes32(uint256(uint160(TOKEN_MESSENGER)));

        bytes32 headerSender = bytes32(message[HEADER_SENDER_OFFSET:HEADER_SENDER_OFFSET + 32]);
        if (headerSender != trustedMessenger) revert Errors.CCTPReceiver_UntrustedSender(headerSender);

        bytes32 headerRecipient = bytes32(message[HEADER_RECIPIENT_OFFSET:HEADER_RECIPIENT_OFFSET + 32]);
        if (headerRecipient != trustedMessenger) revert Errors.CCTPReceiver_UntrustedRecipient(headerRecipient);
    }

    /**
     * @notice Mint-only relay: delivers USDC to the Safe with no bundle execution.
     * @dev For callers that only need the mint (e.g. manual/ops relays). Always performs the relay
     *      and reverts if the message can't be relayed (including an already-consumed nonce); unlike
     *      `relayWithBundle`, the mint here is not idempotent.
     * @param message Full CCTP V2 message bytes
     * @param attestation Circle attestation bytes
     * @return relaySuccess True when this call performed the relay (reverts otherwise)
     */
    function relay(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (bool relaySuccess) {
        _validateMessageFormat(message);
        relaySuccess = IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(message, attestation);
        if (!relaySuccess) revert Errors.CCTPReceiver_RelayFailed();
        // Emit the destination leg so a mint-only relay is observable to the indexer just like a
        // relayWithBundle. No bundle ran here, so the receive is reported as successful.
        _logBundleReceive(_mintRecipient(message), true, message);
    }
}
