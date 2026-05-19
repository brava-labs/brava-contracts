// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ITokenMessengerV2} from "../../interfaces/ICCTP.sol";
import {IAuthRegistry} from "../../interfaces/IAuthRegistry.sol";

/// @title CCTPBridgeSend - Cross-chain USDC bridging via CCTP V2
/// @notice Bridges USDC via CCTP V2, optionally propagating the source-chain auth config snapshot
///         to the destination chain's `AuthRegistry` in the same attested message.
/// @dev Two modes selected by `CCTPParams.propagateAuth`:
///        - `false`: hookless `depositForBurn`; orchestrator picks any `destinationCaller`
///                   (typically `CCTPBundleReceiver` for non-auth flows).
///        - `true`:  reads the full auth config (managers, co-signers, thresholds) from the local
///                   `AUTH_REGISTRY` for `address(this)` (the Safe under delegatecall), encodes
///                   them into the CCTP V2 `hookData`, and forces
///                   `destinationCaller = address(AUTH_REGISTRY)`.
/// @dev The action executes via delegatecall from the Safe, so address(this) is the Safe during execution.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract CCTPBridgeSend is ActionBase {
    using SafeERC20 for IERC20;

    uint32 public constant FAST_FINALITY_THRESHOLD = 1000;
    uint32 public constant STANDARD_FINALITY_THRESHOLD = 2000;
    uint256 public constant DEFAULT_FAST_MAX_FEE = 1000000;
    uint256 public constant DEFAULT_STANDARD_MAX_FEE = 0;

    /// @notice Hook envelope version for auth config snapshots embedded in CCTP V2 messages.
    uint8 internal constant AUTH_HOOK_VERSION = 1;

    /// @param propagateAuth When true, reads the Safe's auth config from `AUTH_REGISTRY` and
    ///        embeds it into the CCTP V2 hookData; receiving registry triple-checks Safe identity
    ///        and applies the snapshot in the same attested message.
    struct CCTPParams {
        address usdcToken;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bool propagateAuth;
    }

    ITokenMessengerV2 public immutable TOKEN_MESSENGER;

    /// @notice Per-chain canonical store of auth state (managers, co-signers, thresholds).
    IAuthRegistry public immutable AUTH_REGISTRY;

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return 12;
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "CCTP_V2";
    }

    constructor(
        address _adminVault,
        address _logger,
        address _tokenMessenger,
        address _authRegistry
    ) ActionBase(_adminVault, _logger) {
        if (_tokenMessenger == address(0) || _authRegistry == address(0)) {
            revert Errors.InvalidInput("CCTPBridgeSend", "constructor");
        }
        TOKEN_MESSENGER = ITokenMessengerV2(_tokenMessenger);
        AUTH_REGISTRY = IAuthRegistry(_authRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        CCTPParams memory params;
        (
            params.usdcToken,
            params.amount,
            params.destinationDomain,
            params.destinationCaller,
            params.maxFee,
            params.minFinalityThreshold,
            params.propagateAuth
        ) = abi.decode(_callData, (address, uint256, uint32, bytes32, uint256, uint32, bool));

        if (
            params.usdcToken == address(0) ||
            params.amount == 0 ||
            (!params.propagateAuth && params.destinationCaller == bytes32(0))
        ) revert Errors.InvalidInput("CCTPBridgeSend", "executeAction");

        _executeCCTPBridge(params, _strategyId);
    }

    function _executeCCTPBridge(
        CCTPParams memory params,
        uint16 /* strategyId */
    ) internal {
        uint256 balanceBefore = IERC20(params.usdcToken).balanceOf(address(this));

        if (balanceBefore < params.amount) revert Errors.CCTPBridgeSend_InsufficientBalance(balanceBefore, params.amount);

        IERC20(params.usdcToken).safeIncreaseAllowance(address(TOKEN_MESSENGER), params.amount);

        bytes32 mintRecipient = bytes32(uint256(uint160(address(this))));

        if (params.propagateAuth) {
            _bridgeWithAuth(params, mintRecipient);
        } else {
            _bridgeHookless(params, mintRecipient);
        }

        uint256 balanceAfter = IERC20(params.usdcToken).balanceOf(address(this));
        if (balanceBefore - balanceAfter != params.amount) {
            revert Errors.CCTPBridgeSend_BalanceMismatch(balanceBefore, balanceAfter, params.amount);
        }

        if (params.propagateAuth) {
            uint256 version = AUTH_REGISTRY.getVersion(address(this));
            LOGGER.logActionEvent(
                LogType.CCTP_BRIDGE_SEND_WITH_AUTH,
                abi.encode(
                    address(this),
                    params.amount,
                    params.destinationDomain,
                    bytes32(uint256(uint160(address(AUTH_REGISTRY)))),
                    version
                )
            );
        } else {
            LOGGER.logActionEvent(
                LogType.CCTP_BRIDGE_SEND,
                abi.encode(
                    address(this),
                    params.amount,
                    params.destinationDomain,
                    params.destinationCaller
                )
            );
        }
    }

    function _bridgeHookless(CCTPParams memory params, bytes32 mintRecipient) private {
        TOKEN_MESSENGER.depositForBurn(
            params.amount,
            params.destinationDomain,
            mintRecipient,
            params.usdcToken,
            params.destinationCaller,
            params.maxFee,
            params.minFinalityThreshold
        );
    }

    /// @dev Auth-propagating path. Reads the full auth config for `address(this)` (the Safe
    ///      under delegatecall), encodes it into a hookVersion-1 envelope, and forces
    ///      `destinationCaller = address(AUTH_REGISTRY)`.
    function _bridgeWithAuth(CCTPParams memory params, bytes32 mintRecipient) private {
        bytes memory hookData = _buildAuthHookData();
        bytes32 destinationCaller = bytes32(uint256(uint160(address(AUTH_REGISTRY))));

        TOKEN_MESSENGER.depositForBurnWithHook(
            params.amount,
            params.destinationDomain,
            mintRecipient,
            params.usdcToken,
            destinationCaller,
            params.maxFee,
            params.minFinalityThreshold,
            hookData
        );
    }

    /// @dev Reads the full auth config snapshot from `AUTH_REGISTRY` for this Safe
    ///      and encodes it into a hook envelope for cross-chain propagation.
    ///      This reads the registry AFTER any authUpdate in the same bundle has applied.
    ///      That ordering is intentional and load-bearing — the destination chain
    ///      receives the post-update state.
    function _buildAuthHookData() private view returns (bytes memory) {
        address safe = address(this);
        address[] memory managers = AUTH_REGISTRY.getManagers(safe);

        uint256[] memory bitmaps = new uint256[](managers.length);
        for (uint256 i; i < managers.length; ++i) {
            bitmaps[i] = AUTH_REGISTRY.getManagerActionBitmap(safe, managers[i]);
        }

        bytes memory payload = abi.encode(
            safe,
            AUTH_REGISTRY.getVersion(safe),
            managers,
            AUTH_REGISTRY.getCoSigners(safe),
            AUTH_REGISTRY.getManagerCoSignThreshold(safe),
            bitmaps
        );
        return abi.encode(AUTH_HOOK_VERSION, payload);
    }


    function createFastTransferParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller,
        uint256 customMaxFee,
        bool propagateAuth
    ) external pure returns (CCTPParams memory) {
        return CCTPParams({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: customMaxFee > 0 ? customMaxFee : DEFAULT_FAST_MAX_FEE,
            minFinalityThreshold: FAST_FINALITY_THRESHOLD,
            propagateAuth: propagateAuth
        });
    }

    function createStandardTransferParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller,
        bool propagateAuth
    ) external pure returns (CCTPParams memory) {
        return CCTPParams({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: DEFAULT_STANDARD_MAX_FEE,
            minFinalityThreshold: STANDARD_FINALITY_THRESHOLD,
            propagateAuth: propagateAuth
        });
    }
}
