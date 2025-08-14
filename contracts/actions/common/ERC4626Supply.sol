// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Errors} from "../../Errors.sol";
import {IERC4626} from "../../interfaces/common/IERC4626.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title ERC4626Supply - Supplies tokens to any ERC4626 vault
/// @notice This contract allows users to supply tokens to any ERC4626-compliant vault
/// @dev Inherits from ActionBase and implements generic supply functionality
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
abstract contract ERC4626Supply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the supply action
    /// @param poolId ID of vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    /// @param minSharesReceived Minimum amount of shares to receive
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
    }

    /// @notice Initializes the ERC4626Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    ///  ----- Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        
        address vault = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // Execute action
        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _supplyToVault(inputData, vault);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    /// @notice Executes the vault supply logic
    /// @param _inputData Struct containing supply parameters
    /// @param _vaultAddress Address of the ERC4626 vault
    /// @return sharesBefore Balance of vault shares before the supply
    /// @return sharesAfter Balance of vault shares after the supply
    /// @return feeInTokens Amount of fees taken in tokens
    function _supplyToVault(
        Params memory _inputData,
        address _vaultAddress
    ) private returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        // For logging, get the balance before
        sharesBefore = _getBalance(_vaultAddress);

        feeInTokens = _processFee(_vaultAddress, _inputData.feeBasis, _vaultAddress);

        // This may be a zero value deposit (a fee collection)
        // If not, then we need to do the deposit
        if (_inputData.amount != 0) {
            // We can only deposit up to whatever we have, how much do we have?
            IERC20 underlyingToken = IERC20(_getUnderlying(_vaultAddress));
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingToken.balanceOf(address(this))
                : _inputData.amount;

            require(amountToDeposit != 0, Errors.Action_ZeroAmount(protocolName(), uint8(actionType())));

            // Check max deposit limit
            uint256 maxDeposit = _getMaxDeposit(_vaultAddress);
            amountToDeposit = amountToDeposit > maxDeposit 
                ? maxDeposit 
                : amountToDeposit;

            // Perform the deposit
            _increaseAllowance(address(underlyingToken), _vaultAddress, amountToDeposit);
            uint256 shares = _deposit(_vaultAddress, amountToDeposit);

            // Did that work as expected?
            require(
                shares >= _inputData.minSharesReceived,
                Errors.Action_InsufficientSharesReceived(
                    protocolName(),
                    uint8(actionType()),
                    shares,
                    _inputData.minSharesReceived
                )
            );
        }

        // For logging, get the new balance
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
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    ///  -----  Protocol specific overrides -----  ///

    ///@notice Incerases the allowance to the vault
    ///@param _underlying The underlying token address
    ///@param _destination The destination address
    ///@param _amount The amount of underlying token to deposit
    function _increaseAllowance(address _underlying, address _destination, uint256 _amount) internal virtual {
        IERC20(_underlying).safeIncreaseAllowance(_destination, _amount);
    }

    /// @notice Gets the underlying token address from the vault
    /// @dev Override this for non-standard ERC4626 implementations
    /// @param _vaultAddress The vault address
    /// @return The underlying token address
    function _getUnderlying(address _vaultAddress) internal view virtual returns (address) {
        return IERC4626(_vaultAddress).asset();
    }

    /// @notice Gets the balance of the vault
    /// @dev Override this for non-standard ERC4626 implementations
    /// @param _vaultAddress The vault address
    /// @return The user balance of the vault
    function _getBalance(address _vaultAddress) internal view virtual returns (uint256) {
        return IERC4626(_vaultAddress).balanceOf(address(this));
    }

    /// @notice Executes the deposit to the vault
    /// @dev Override this for non-standard ERC4626 implementations
    /// @param _vaultAddress The vault address
    /// @param _amount The amount of underlying token to deposit
    function _deposit(address _vaultAddress, uint256 _amount) internal virtual returns (uint256 _shares) {
        return IERC4626(_vaultAddress).deposit(_amount, address(this));
    }

    /// @inheritdoc ActionBase
    /// @notice Returns the protocol name
    /// @return string Protocol name for the specific implementation
    function protocolName() public pure virtual override returns (string memory);

    /// @dev Override for non-standard max deposit calculations
    function _getMaxDeposit(address _vaultAddress) internal view virtual returns (uint256) {
        return IERC4626(_vaultAddress).maxDeposit(address(this));
    }
}
