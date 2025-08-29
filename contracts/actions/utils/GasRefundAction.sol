// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ActionBase} from "../../actions/ActionBase.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IEip712TypedDataSafeModule} from "../../interfaces/IEip712TypedDataSafeModule.sol";
import {ITokenRegistry} from "../../interfaces/ITokenRegistry.sol";
import {IAggregatorV3} from "../../interfaces/chainlink/IAggregatorV3.sol";
import {Errors} from "../../Errors.sol";

/// @title GasRefundAction
/// @notice Performs a guarded gas refund transfer from the Safe based on module-provided context
contract GasRefundAction is ActionBase {
    using SafeERC20 for IERC20;

    ITokenRegistry public immutable TOKEN_REGISTRY;
    IAggregatorV3 public immutable ETH_USD_ORACLE;
    address public immutable FEE_RECIPIENT;
    IEip712TypedDataSafeModule public immutable EIP712_MODULE;

    // Constants specific to refund calculation and oracle safety
    uint256 private constant GAS_OVERHEAD = 21000;
    uint256 private constant ORACLE_STALENESS_THRESHOLD = 1 hours;

    // Local enum for readability within the action
    enum RefundRecipient {
        EXECUTOR,
        FEE_RECIPIENT
    }

    event GasRefundProcessed(address indexed safe, address indexed refundToken, uint256 refundAmount, address indexed recipient);

    struct Params {
        address refundToken;
        uint256 maxRefundAmount;
        uint8 refundRecipient; // 0=executor, 1=fee recipient
    }

    constructor(
        address _adminVault,
        address _logger,
        address _tokenRegistry,
        address _ethUsdOracle,
        address _feeRecipient,
        address _eip712Module
    ) ActionBase(_adminVault, _logger) {
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
        ETH_USD_ORACLE = IAggregatorV3(_ethUsdOracle);
        FEE_RECIPIENT = _feeRecipient;
        EIP712_MODULE = IEip712TypedDataSafeModule(_eip712Module);
    }

    /// @notice Validate a refundRecipient value
    /// @dev Allows external callers (e.g., module) to validate typed-data value against action semantics
    function isValidRefundRecipient(uint8 value) external pure returns (bool) {
        return value == uint8(RefundRecipient.EXECUTOR) || value == uint8(RefundRecipient.FEE_RECIPIENT);
    }

    function executeAction(bytes memory _callData, uint16 /* _strategyId */) public payable override {
        Params memory p = abi.decode(_callData, (Params));

        if (p.refundRecipient > uint8(RefundRecipient.FEE_RECIPIENT)) {
            revert Errors.EIP712TypedDataSafeModule_InvalidRefundRecipient(p.refundRecipient);
        }

        // Consume context from the module; must be called by the Safe via delegatecall
        (bool ok, bytes memory ret) = address(EIP712_MODULE).call(
            abi.encodeWithSignature("consumeGasContext()")
        );
        if (!ok || ret.length == 0) revert("Gas context unavailable");
        (uint256 startGas, address executor) = abi.decode(ret, (uint256, address));
        if (startGas == 0) revert("Gas context empty");

        // Validate token approval
        if (!TOKEN_REGISTRY.isApprovedToken(p.refundToken)) {
            return; // skip silently if not approved
        }

        // Fetch ETH price and validate staleness
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
            
        ) = ETH_USD_ORACLE.latestRoundData();
        if (answer <= 0) {
            return;
        }
        if (block.timestamp - updatedAt > ORACLE_STALENESS_THRESHOLD) {
            return;
        }

        // Compute gas used just-in-time to include action overhead
        uint256 gasUsed = startGas > gasleft() ? (startGas - gasleft() + GAS_OVERHEAD) : 0;
        if (gasUsed == 0) {
            return;
        }

        uint256 refundAmount;
        {
            uint8 od = ETH_USD_ORACLE.decimals();
            uint8 td = IERC20Metadata(p.refundToken).decimals();
            if (uint256(td) > 18 + uint256(od)) {
                return; // avoid underflow in exponent calculation
            }
            uint256 denomExp = 18 + uint256(od) - uint256(td);
            refundAmount = ((gasUsed * tx.gasprice) * uint256(answer)) / (10 ** denomExp);
        }

        if (p.maxRefundAmount > 0 && refundAmount > p.maxRefundAmount) {
            refundAmount = p.maxRefundAmount;
        }
        if (refundAmount == 0) {
            return;
        }

        address recipient = p.refundRecipient == uint8(RefundRecipient.EXECUTOR)
            ? executor
            : FEE_RECIPIENT;
        if (recipient == address(0)) {
            return;
        }

        // Perform low-level transfer to avoid bubbling reverts
        (bool success, ) = p.refundToken.call(
            abi.encodeWithSelector(IERC20.transfer.selector, recipient, refundAmount)
        );
        if (success) {
            emit GasRefundProcessed(address(this), p.refundToken, refundAmount, recipient);
        }
    }

    function actionType() public pure override returns (uint8) {
        return uint8(ActionBase.ActionType.FEE_ACTION);
    }

    function protocolName() public pure override returns (string memory) {
        return "Brava";
    }
}


