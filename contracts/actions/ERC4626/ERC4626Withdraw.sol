// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IERC4626} from "../../interfaces/ERC4626/IERC4626.sol";

/// @title ERC4626Withdraw - Burns vault shares and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from any ERC4626 vault
/// @dev Inherits from ActionBase and implements generic withdraw functionality
contract ERC4626Withdraw is ActionBase {
    /// @notice Parameters for the withdraw action
    /// @param poolId ID of vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawRequest Amount of underlying token to withdraw
    /// @param maxSharesBurned Maximum amount of shares to burn
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 withdrawRequest;
        uint256 maxSharesBurned;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);

        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address vault = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _withdrawFromVault(inputData, vault);

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @notice Withdraws all available tokens from the specified vault
    /// @param _vault Address of the vault contract
    function exit(address _vault) public {
        uint256 maxWithdrawAmount = _getMaxWithdraw(_vault);
        _executeWithdraw(_vault, maxWithdrawAmount, maxWithdrawAmount);
    }

    function _withdrawFromVault(
        Params memory _inputData,
        address _vault
    ) private returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        IERC4626 vault = IERC4626(_vault);

        sharesBefore = vault.balanceOf(address(this));
        feeInTokens = _takeFee(_vault, _inputData.feeBasis);

        if (_inputData.withdrawRequest != 0) {
            uint256 maxWithdrawAmount = _getMaxWithdraw(_vault);
            uint256 amountToWithdraw = _inputData.withdrawRequest > maxWithdrawAmount
                ? maxWithdrawAmount
                : _inputData.withdrawRequest;

            if (amountToWithdraw == 0) {
                revert Errors.Action_ZeroAmount(protocolName(), uint8(actionType()));
            }
            _executeWithdraw(_vault, amountToWithdraw, _inputData.maxSharesBurned);
        }
        sharesAfter = vault.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure virtual override returns (string memory) {
        return "ERC4626";
    }

    /// @dev Override for non-standard withdraw implementations
    function _executeWithdraw(
        address vault,
        uint256 amount,
        uint256 // maxShares not used for ERC4626
    ) internal virtual returns (uint256 amountWithdrawn) {
        return IERC4626(vault).withdraw(amount, address(this), address(this));
    }

    /// @dev Override for non-standard max withdraw calculations
    function _getMaxWithdraw(address vault) internal view virtual returns (uint256) {
        return IERC4626(vault).maxWithdraw(address(this));
    }
}
