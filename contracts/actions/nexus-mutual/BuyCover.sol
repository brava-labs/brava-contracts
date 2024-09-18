// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IERC721} from "../../interfaces/IERC721.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {SafeUIntCast} from "../../libraries/SafeUIntCast.sol";
import {ICoverBroker, BuyCoverParams, PoolAllocationRequest} from "../../interfaces/nexus-mutual/ICoverBroker.sol";
import {TokenAddressesMainnet} from "../../libraries/TokenAddressesMainnet.sol";

/// @title Buys cover for a specific asset and protocol
contract BuyCover is ActionBase {
    using TokenUtils for address;
    using SafeUIntCast for uint256;

    /// @param owner -  The owner of the cover
    /// @param buyCoverParams - The params for the buyCover function
    /// @param poolAllocationRequests - The pool allocation requests
    /// @dev poolAllocationRequests are passed in an encoded form, because of their dynamic length
    ///      and the fact that we're just passing them through from the cover router
    struct Params {
        address owner;
        bytes buyCoverParams;
        bytes[] poolAllocationRequests;
    }

    ICoverBroker public constant COVER_BROKER = ICoverBroker(0x0000cbD7a26f72Ff222bf5f136901D224b08BE4E);
    IERC721 public constant COVER_NFT = IERC721(0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb);

    error InvalidAssetID();

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint16 _strategyId
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        uint256 coverId = _buyCover(inputData, _strategyId);
        return bytes32(coverId);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.COVER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _buyCover(Params memory _inputData, uint16 _strategyId) private returns (uint256 coverId) {
        BuyCoverParams memory params = abi.decode(_inputData.buyCoverParams, (BuyCoverParams));

        PoolAllocationRequest[] memory poolAllocationRequests = new PoolAllocationRequest[](
            _inputData.poolAllocationRequests.length
        );
        for (uint256 i = 0; i < _inputData.poolAllocationRequests.length; i++) {
            poolAllocationRequests[i] = abi.decode(_inputData.poolAllocationRequests[i], (PoolAllocationRequest));
        }

        address paymentAsset = _assetIdToTokenAddress(params.paymentAsset);
        paymentAsset.approveToken(address(COVER_BROKER), params.maxPremiumInAsset);

        if (params.paymentAsset == 0) {
            coverId = COVER_BROKER.buyCover{value: params.maxPremiumInAsset}(params, poolAllocationRequests);
        } else {
            coverId = COVER_BROKER.buyCover(params, poolAllocationRequests);
        }

        LOGGER.logActionEvent("BuyCover", _encodeBuyCover(_strategyId, params.period, params.amount, coverId));
    }

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

    function _encodeBuyCover(
        uint16 _strategyId,
        uint32 _period,
        uint256 _amount,
        uint256 _coverId
    ) private pure returns (bytes memory) {
        return abi.encode(_strategyId, _period, _amount, _coverId);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
