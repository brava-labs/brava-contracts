// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

struct BuyCoverParams {
    uint256 coverId;
    address owner;
    uint24 productId;
    uint8 coverAsset;
    uint96 amount;
    uint32 period;
    uint256 maxPremiumInAsset;
    uint8 paymentAsset;
    uint16 commissionRatio;
    address commissionDestination;
    string ipfsData;
}

struct PoolAllocationRequest {
    uint40 poolId;
    bool skip;
    uint256 coverAmountInAsset;
}

interface ICoverBroker {
    function buyCover(
        BuyCoverParams calldata params,
        PoolAllocationRequest[] calldata poolAllocationRequests
    ) external payable returns (uint256 coverId);
}
