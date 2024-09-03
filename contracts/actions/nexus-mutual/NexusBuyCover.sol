// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IERC721} from "../../interfaces/IERC721.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {SafeUIntCast} from "../../libraries/SafeUIntCast.sol";
import {ICoverBroker, BuyCoverParams, PoolAllocationRequest} from "../../interfaces/nexus-mutual/ICoverBroker.sol";
import {TokenAddressesMainnet} from "../../libraries/TokenAddressesMainnet.sol";

/// @title Buys cover for a specific asset and protocol
contract NexusBuyCover is ActionBase {
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
    /// @param poolId - The Athena pool id for which the cover is bought
    /// @dev poolAllocationRequests are passed in an encoded form, because of their dynamic length
    ///      and the fact that we're just passing them through from the cover router
    struct Params {
        address owner;
        uint24 productId;
        uint8 coverAsset;
        uint96 amount;
        uint32 period;
        uint256 maxPremiumInAsset;
        uint8 paymentAsset;
        bytes[] poolAllocationRequests;
        bytes4 poolId;
    }

    ICoverBroker public constant coverBroker = ICoverBroker(0x0000cbD7a26f72Ff222bf5f136901D224b08BE4E);
    IERC721 public constant coverNft = IERC721(0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb);

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues,
        uint16 _strategyId
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        inputData.owner = _parseParamAddr(inputData.owner, _paramMapping[0], _returnValues);

        (uint256 coverId, bytes memory logData) = _buyCover(inputData, _strategyId);
        logger.logActionEvent("NexusBuyCover", logData);
        return bytes32(coverId);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.COVER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _buyCover(Params memory _inputData, uint16 _strategyId) private returns (uint256 coverId, bytes memory logData) {
        BuyCoverParams memory params = BuyCoverParams({
            coverId: 0,
            owner: address(this), // TODO should this be owner EOA wallet of safe?
            productId: _inputData.productId,
            coverAsset: _inputData.coverAsset,
            amount: _inputData.amount,
            period: _inputData.period,
            maxPremiumInAsset: _inputData.maxPremiumInAsset,
            paymentAsset: _inputData.paymentAsset,
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

        logger.logActionEvent("BuyCover", _encodeBuyCover(_strategyId, _inputData.poolId, _inputData.period, _inputData.amount));
    }

    function _assetIdToTokenAddress(uint256 _assetId) private pure returns (address) {
        if (_assetId == 0) {
            return TokenAddressesMainnet.ETH;
        } else if (_assetId == 1) {
            return TokenAddressesMainnet.DAI;
        } else if (_assetId == 6) {
            return TokenAddressesMainnet.USDC;
        } else {
            revert("Invalid assetId");
        }
    }

    function _encodeBuyCover(uint16 _strategyId, bytes4 _poolId, uint32 _period, uint256 _amount) private pure returns (bytes memory) {
        return abi.encode(_strategyId, _poolId, _period, _amount);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
