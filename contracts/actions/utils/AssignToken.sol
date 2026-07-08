// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Errors} from "../../Errors.sol";
import {ITokenRegistry} from "../../interfaces/ITokenRegistry.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title AssignToken - Declares a token balance as belonging to a portfolio
/// @notice Emits a BALANCE_UPDATE log attributing a token amount to a strategyId.
///         Does NOT move tokens — purely declarative logging so the indexer can
///         track held-token positions using the same infrastructure as vault positions.
/// @dev The ts-client provides balanceBefore/balanceAfter to produce the correct
///      delta for the indexer's cumulative accounting. The poolId is derived from
///      the token address via _poolIdFromAddress().
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract AssignToken is ActionBase {
    /// @notice The TokenRegistry contract for verifying allowed tokens
    ITokenRegistry public immutable TOKEN_REGISTRY;

    /// @param token Address of the token to assign
    /// @param balanceBefore Previous cumulative balance for this strategy (provided by ts-client)
    /// @param balanceAfter New cumulative balance for this strategy
    /// @dev `balanceBefore` is trusted off-chain input: it represents the indexer's prior cumulative
    ///      balance for which there is no on-chain source of truth, so it is emitted for delta
    ///      accounting only and is not validated here. `balanceAfter` is the only field checked
    ///      against the Safe's actual holdings. Submitting this action requires an authorised signer.
    struct Params {
        address token;
        uint256 balanceBefore;
        uint256 balanceAfter;
    }

    /// @notice Initializes the AssignToken contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _tokenRegistry Address of the TokenRegistry contract
    constructor(
        address _adminVault,
        address _logger,
        address _tokenRegistry
    ) ActionBase(_adminVault, _logger) {
        require(_tokenRegistry != address(0), Errors.InvalidInput("AssignToken", "constructor"));
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory params = _parseInputs(_callData);

        require(
            TOKEN_REGISTRY.isApprovedToken(params.token),
            Errors.InvalidInput(protocolName(), "token")
        );

        // When assigning a non-zero balance, verify the Safe actually holds enough
        if (params.balanceAfter > 0) {
            uint256 safeBalance = IERC20(params.token).balanceOf(address(this));
            require(
                safeBalance >= params.balanceAfter,
                Errors.InvalidInput(protocolName(), "balanceAfter")
            );
        }

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(
                _strategyId,
                _poolIdFromAddress(params.token),
                params.balanceBefore,
                params.balanceAfter,
                0 // no fee
            )
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.CUSTOM_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "Held";
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }
}
