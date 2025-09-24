// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

contract MockArbGasInfo {
    uint256 public perL2TxWei;
    uint256 public perArbGasWei;
    uint256 public perDAWei;
    uint256 public perL1CalldataByteWei;
    uint256 public perL1TxWei;
    uint256 public perL1GasPriceEstimateWei;

    constructor() {
        perL2TxWei = 0;
        perArbGasWei = 1 gwei;
        perDAWei = 0;
        perL1CalldataByteWei = 0;
        perL1TxWei = 0;
        perL1GasPriceEstimateWei = 0;
    }

    function setPrices(
        uint256 _perL2TxWei,
        uint256 _perArbGasWei,
        uint256 _perDAWei,
        uint256 _perL1CalldataByteWei,
        uint256 _perL1TxWei,
        uint256 _perL1GasPriceEstimateWei
    ) external {
        perL2TxWei = _perL2TxWei;
        perArbGasWei = _perArbGasWei;
        perDAWei = _perDAWei;
        perL1CalldataByteWei = _perL1CalldataByteWei;
        perL1TxWei = _perL1TxWei;
        perL1GasPriceEstimateWei = _perL1GasPriceEstimateWei;
    }

    function getPricesInWei() external view returns (
        uint256, uint256, uint256, uint256, uint256, uint256
    ) {
        return (
            perL2TxWei,
            perArbGasWei,
            perDAWei,
            perL1CalldataByteWei,
            perL1TxWei,
            perL1GasPriceEstimateWei
        );
    }
}


