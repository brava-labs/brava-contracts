// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ITokenMessengerV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPBridgeSend - Cross-chain USDC bridging via CCTP V2
/// @notice Bridges USDC via CCTP V2 using a hookless `depositForBurn`; the orchestrator picks the
///         `destinationCaller` (typically `CCTPBundleReceiver`).
/// @dev The action executes via delegatecall from the Safe, so address(this) is the Safe during execution.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract CCTPBridgeSend is ActionBase {
    using SafeERC20 for IERC20;

    uint32 public constant FAST_FINALITY_THRESHOLD = 1000;
    uint32 public constant STANDARD_FINALITY_THRESHOLD = 2000;
    uint256 public constant DEFAULT_FAST_MAX_FEE = 1000000;
    uint256 public constant DEFAULT_STANDARD_MAX_FEE = 0;

    struct CCTPParams {
        address usdcToken;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
    }

    ITokenMessengerV2 public immutable TOKEN_MESSENGER;

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
        address _tokenMessenger
    ) ActionBase(_adminVault, _logger) {
        if (_tokenMessenger == address(0)) {
            revert Errors.InvalidInput("CCTPBridgeSend", "constructor");
        }
        TOKEN_MESSENGER = ITokenMessengerV2(_tokenMessenger);
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
            params.minFinalityThreshold
        ) = abi.decode(_callData, (address, uint256, uint32, bytes32, uint256, uint32));

        if (
            params.usdcToken == address(0) ||
            params.amount == 0 ||
            params.destinationCaller == bytes32(0)
        ) revert Errors.InvalidInput("CCTPBridgeSend", "executeAction");

        // Pin the bridged asset to the chain's USDC, configured per-chain in AdminVault. CCTP V2's
        // TokenMessenger can burn other registered tokens (e.g. EURC), so matching against an
        // admin-set address stops an authorised manager from bridging the wrong asset. The bytecode
        // stays chain-agnostic: a new chain is enabled with a single setActionConfig, no redeploy.
        address expectedUsdc = _configAddress();
        if (params.usdcToken != expectedUsdc) {
            revert Errors.CCTPBridgeSend_UnexpectedToken(params.usdcToken, expectedUsdc);
        }

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

        TOKEN_MESSENGER.depositForBurn(
            params.amount,
            params.destinationDomain,
            mintRecipient,
            params.usdcToken,
            params.destinationCaller,
            params.maxFee,
            params.minFinalityThreshold
        );

        uint256 balanceAfter = IERC20(params.usdcToken).balanceOf(address(this));
        if (balanceBefore - balanceAfter != params.amount) {
            revert Errors.CCTPBridgeSend_BalanceMismatch(balanceBefore, balanceAfter, params.amount);
        }

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

    function createFastTransferParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller,
        uint256 customMaxFee
    ) external pure returns (CCTPParams memory) {
        return CCTPParams({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: customMaxFee > 0 ? customMaxFee : DEFAULT_FAST_MAX_FEE,
            minFinalityThreshold: FAST_FINALITY_THRESHOLD
        });
    }

    function createStandardTransferParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller
    ) external pure returns (CCTPParams memory) {
        return CCTPParams({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: DEFAULT_STANDARD_MAX_FEE,
            minFinalityThreshold: STANDARD_FINALITY_THRESHOLD
        });
    }
}
