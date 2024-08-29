// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IERC721} from "../../interfaces/IERC721.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {SafeUIntCast} from "../../libraries/SafeUIntCast.sol";
import {ICoverBroker, BuyCoverParams, PoolAllocationRequest} from "../../interfaces/nexus-mutual/ICoverBroker.sol";

/// @title Buys cover for a specific asset and protocol
contract BuyCover is ActionBase {
    using TokenUtils for address;
    using SafeUIntCast for uint256;

    /// @param owner -  The owner of the cover
    /// @param productId - The cover product id
    /// @param coverAsset - The asset to be covered
    /// @param amount - The amount to be covered
    /// @param period - The period of the cover
    /// @param maxPremiumInAsset - The maximum premium in asset 
    /// @param paymentAsset - The asset to be used for payment
    /// @param poolAllocationRequests - The pool allocation requests
    /// @dev poolAllocationRequests are passed in an encoded form, because of their dynamic length
    ///      and the fact that we're just passing them through from the cover router
    struct Params {
        address owner;
        uint256 productId;
        uint256 coverAsset;
        uint256 amount;
        uint256 period;
        uint256 maxPremiumInAsset;
        uint256 paymentAsset;
        bytes[] poolAllocationRequests;
    }

    /// @notice Tokens supported by the action
    address public constant ETH_ADDR = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public constant DAI_ADDR = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC_ADDR = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    ICoverBroker public constant coverBroker = ICoverBroker(0x0000cbD7a26f72Ff222bf5f136901D224b08BE4E);
    IERC721 public constant coverNft = IERC721(0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb);

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        inputData.owner = _parseParamAddr(inputData.owner, _paramMapping[0], _returnValues);
        inputData.productId = _parseParamUint(inputData.productId, _paramMapping[1], _returnValues);

        inputData.coverAsset = _parseParamUint(inputData.coverAsset, _paramMapping[2], _returnValues);

        inputData.amount = _parseParamUint(inputData.amount, _paramMapping[3], _returnValues);

        inputData.period = _parseParamUint(inputData.period, _paramMapping[4], _returnValues);

        inputData.maxPremiumInAsset = _parseParamUint(inputData.maxPremiumInAsset, _paramMapping[5], _returnValues);

        inputData.paymentAsset = _parseParamUint(inputData.paymentAsset, _paramMapping[6], _returnValues);

        (uint256 coverId, bytes memory logData) = _buyCover(inputData);
        emit ActionEvent("BuyCover", logData);
        return bytes32(coverId);
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes memory _callData) public payable override {
        Params memory inputData = _parseInputs(_callData);
        (, bytes memory logData) = _buyCover(inputData);
        logger.logActionDirectEvent("BuyCover", logData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.INSURE_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _buyCover(Params memory _inputData) private returns (uint256 coverId, bytes memory logData) {
        BuyCoverParams memory params = BuyCoverParams({
            coverId: 0,
            owner: address(this), // TODO should this be owner EOA wallet of safe?
            productId: _inputData.productId.toUint24(),
            coverAsset: _inputData.coverAsset.toUint8(),
            amount: _inputData.amount.toUint96(),
            period: _inputData.period.toUint32(),
            maxPremiumInAsset: _inputData.maxPremiumInAsset,
            paymentAsset: _inputData.paymentAsset.toUint8(),
            commissionRatio: 0,
            commissionDestination: address(0),
            ipfsData: ""
        });

        PoolAllocationRequest[] memory poolAllocationRequests = new PoolAllocationRequest[](_inputData.poolAllocationRequests.length);
        for (uint256 i = 0; i < _inputData.poolAllocationRequests.length; i++) {
            poolAllocationRequests[i] = abi.decode(_inputData.poolAllocationRequests[i], (PoolAllocationRequest));
        }

        address paymentAsset = _assetIdToTokenAddress(_inputData.paymentAsset);
        paymentAsset.approveToken(address(coverBroker), _inputData.maxPremiumInAsset);

        if (_inputData.paymentAsset == 0) {
            coverId = coverBroker.buyCover{value: _inputData.maxPremiumInAsset}(params, poolAllocationRequests);
        } else {
            coverId = coverBroker.buyCover(params, poolAllocationRequests);
        }
        
        coverNft.safeTransferFrom(address(this), _inputData.owner, coverId);

        logData = abi.encode(_inputData, coverId);
    }

    function _assetIdToTokenAddress(uint256 _assetId) private pure returns (address) {
        if (_assetId == 0) {
            return ETH_ADDR;
        } else if (_assetId == 1) {
            return DAI_ADDR;
        } else if (_assetId == 6) {
            return USDC_ADDR;
        } else {
            revert("Invalid assetId");
        }
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
