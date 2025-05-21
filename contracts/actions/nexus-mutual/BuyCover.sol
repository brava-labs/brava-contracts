// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ICoverBroker, BuyCoverParams, PoolAllocationRequest} from "../../interfaces/nexus-mutual/ICoverBroker.sol";
import {TokenAddressesMainnet} from "../../libraries/TokenAddressesMainnet.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title BuyCover - Purchases cover for a specific asset and protocol
/// @notice This contract allows users to buy cover from Nexus Mutual
/// @dev Inherits from ActionBase and implements the buy cover functionality for Nexus Mutual protocol
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract BuyCover is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the buy cover action
    /// @param owner The owner of the cover
    /// @param buyCoverParams The params for the buyCover function
    /// @param poolAllocationRequests The pool allocation requests
    /// @dev poolAllocationRequests are passed in an encoded form, because of their dynamic length
    ///      and the fact that we're just passing them through from the cover router
    struct Params {
        address owner;
        bytes buyCoverParams;
        bytes[] poolAllocationRequests;
    }

    /// @notice Address of the Nexus Mutual Cover Broker contract
    ICoverBroker public constant COVER_BROKER = ICoverBroker(0xCB2B736652D2dBf7d72e4dB880Cf6B7d99507814);

    /// @notice Thrown when an invalid asset ID is provided
    error InvalidAssetID();

    /// @notice Initializes the BuyCover contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        require(
            inputData.buyCoverParams.length != 0 && inputData.poolAllocationRequests.length != 0,
            Errors.InvalidInput("BuyCover", "executeAction")
        );

        // Execute action
        (uint32 period, uint256 amount, uint256 premiumPaid, uint256 coverId) = _buyCover(inputData);

        // Log event
        LOGGER.logActionEvent(LogType.BUY_COVER_WITH_PREMIUM, _encodeBuyCover(_strategyId, period, amount, premiumPaid, coverId));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.COVER_ACTION);
    }

    /// @notice Executes the buy cover action
    /// @param _inputData Struct containing buy cover parameters
    function _buyCover(Params memory _inputData) private returns (uint32 period, uint256 amount, uint256 premiumPaid, uint256 coverId) {
        BuyCoverParams memory params = abi.decode(_inputData.buyCoverParams, (BuyCoverParams));

        PoolAllocationRequest[] memory poolAllocationRequests = new PoolAllocationRequest[](
            _inputData.poolAllocationRequests.length
        );
        for (uint256 i = 0; i < _inputData.poolAllocationRequests.length; i++) {
            poolAllocationRequests[i] = abi.decode(_inputData.poolAllocationRequests[i], (PoolAllocationRequest));
        }

        if (params.paymentAsset == 0) {

            uint256 balanceBefore = address(this).balance;

            coverId = COVER_BROKER.buyCover{value: params.maxPremiumInAsset}(params, poolAllocationRequests);
            
            uint256 balanceAfter = address(this).balance;
            
            premiumPaid = balanceBefore - balanceAfter; 
        } else {

            IERC20 paymentAsset = IERC20(_assetIdToTokenAddress(params.paymentAsset));
            uint256 balanceBefore = paymentAsset.balanceOf(address(this));

            paymentAsset.safeIncreaseAllowance(address(COVER_BROKER), params.maxPremiumInAsset);
            coverId = COVER_BROKER.buyCover(params, poolAllocationRequests);

            uint256 balanceAfter = paymentAsset.balanceOf(address(this));
            
            premiumPaid = balanceBefore - balanceAfter;
        }

        return (params.period, params.amount, premiumPaid, coverId);
    }

    /// @notice Converts asset ID to token address
    /// @param _assetId ID of the asset
    /// @dev Asset ID 0 is ETH, but this case is handled separately in _buyCover. 
    ///      We keep the ETH check here for code clarity/future-proofing, though it's never reached.
    /// @return address Token address corresponding to the asset ID
    function _assetIdToTokenAddress(uint256 _assetId) private pure returns (address) {
        if (_assetId == 0) {
            return TokenAddressesMainnet.ETH;
        } else if (_assetId == 1) {
            return TokenAddressesMainnet.DAI;
        } else if (_assetId == 6) {
            return TokenAddressesMainnet.USDC;
        } else {
            revert InvalidAssetID();
        }
    }

    /// @notice Encodes buy cover information for logging
    /// @param _strategyId ID of the strategy
    /// @param _period Cover period
    /// @param _amount Cover amount
    /// @param _premiumPaid Actual premium paid after refunds
    /// @param _coverId ID of the purchased cover
    /// @return bytes Encoded buy cover information
    function _encodeBuyCover(
        uint16 _strategyId,
        uint32 _period,
        uint256 _amount,
        uint256 _premiumPaid,
        uint256 _coverId
    ) private pure returns (bytes memory) {
        return abi.encode(_strategyId, _period, _amount, _premiumPaid, _coverId);
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "Nexus";
    }
}
