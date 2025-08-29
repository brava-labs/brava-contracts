// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title ShareBasedWithdraw - Burns vault shares and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from vaults that require share-based withdrawals
/// @dev Inherits from ActionBase and implements generic share-based withdraw functionality
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
abstract contract ShareBasedWithdraw is ActionBase {
    /// @notice Parameters for the withdraw action
    /// @param poolId ID of vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param sharesToBurn Amount of shares to burn
    /// @param minUnderlyingReceived Minimum amount of underlying tokens to receive
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 sharesToBurn;
        uint256 minUnderlyingReceived;
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

        uint256 maxShares = _getBalance(_vaultAddress);
        uint256 sharesToWithdraw = _inputData.sharesToBurn > maxShares ? maxShares : _inputData.sharesToBurn;

        require(sharesToWithdraw != 0, Errors.Action_ZeroAmount(protocolName(), actionType()));

        // Perform the withdraw
        _executeWithdraw(_vaultAddress, sharesToWithdraw, _inputData.minUnderlyingReceived);

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
    /// @param _sharesToBurn The amount of shares to burn
    /// @param _minUnderlyingReceived The minimum amount of underlying tokens to receive
    function _executeWithdraw(
        address _vaultAddress,
        uint256 _sharesToBurn,
        uint256 _minUnderlyingReceived
    ) internal virtual;

    /// @dev Override for non-standard balance calculations
    function _getBalance(address _vaultAddress) internal view virtual returns (uint256);

    /// @inheritdoc ActionBase
    function protocolName() public pure virtual override returns (string memory);
}
