// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../../Errors.sol";
import {IERC4626} from "../../interfaces/common/IERC4626.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title ERC4626Withdraw - Burns vault shares and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from any ERC4626 vault
/// @dev Inherits from ActionBase and implements generic withdraw functionality
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
abstract contract ERC4626Withdraw is ActionBase {
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

    ///  -----   Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address vault = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // Execute action
        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _withdrawFromVault(inputData, vault);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    /// @dev Withdraw logic, external calls are separated out to allow for overrides
    function _withdrawFromVault(
        Params memory _inputData,
        address _vaultAddress
    ) private returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        // for logging, get the balance before
        sharesBefore = _getBalance(_vaultAddress);

        feeInTokens = _processFee(_vaultAddress, _inputData.feeBasis, _vaultAddress);

        uint256 maxWithdrawAmount = _getMaxWithdraw(_vaultAddress);
        uint256 amountToWithdraw = _inputData.withdrawRequest > maxWithdrawAmount
            ? maxWithdrawAmount
            : _inputData.withdrawRequest;

        require(amountToWithdraw != 0, Errors.Action_ZeroAmount(protocolName(), uint8(actionType())));

        // Perform the withdraw
        uint256 sharesBurned = _executeWithdraw(_vaultAddress, amountToWithdraw);

        // check we didn't burn more shares than we were allowed to
        require(
            sharesBurned <= _inputData.maxSharesBurned,
            Errors.Action_MaxSharesBurnedExceeded(
                protocolName(),
                uint8(actionType()),
                sharesBurned,
                _inputData.maxSharesBurned
            )
        );

        // for logging, get the balance after
        sharesAfter = _getBalance(_vaultAddress);
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// -----  Protocol specific overrides ----- ///

    /// @notice Executes the withdraw from the vault
    /// @dev Override for non-standard withdraw implementations
    /// @param _vaultAddress The vault address
    /// @param amount The amount of underlying token to withdraw
    /// @return _sharesBurned The amount of shares burned
    function _executeWithdraw(address _vaultAddress, uint256 amount) internal virtual returns (uint256 _sharesBurned) {
        _sharesBurned = IERC4626(_vaultAddress).withdraw(amount, address(this), address(this));
    }

    /// @dev Override for non-standard balance calculations
    function _getBalance(address _vaultAddress) internal view virtual returns (uint256) {
        return IERC4626(_vaultAddress).balanceOf(address(this));
    }

    /// @dev Override for non-standard max withdraw calculations
    function _getMaxWithdraw(address _vaultAddress) internal view virtual returns (uint256) {
        return IERC4626(_vaultAddress).maxWithdraw(address(this));
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure virtual override returns (string memory);
}
