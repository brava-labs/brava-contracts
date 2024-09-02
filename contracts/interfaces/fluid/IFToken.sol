// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity^0.8.0;

interface IFToken {
    function previewDeposit(uint256 _assets) external view returns (uint256);

    function previewWithdraw(uint256 _assets) external view returns (uint256);

    function maxWithdraw(address _owner) external view returns (uint256);

    function minDeposit() external view returns (uint256);

    function deposit(
        uint256 _assets,
        address _receiver
    ) external returns (uint256);

    function deposit(
        uint256 _assets,
        address _receiver,
        uint256 _minAmountOut
    ) external returns (uint256);

    function withdraw(
        uint256 _assets,
        address _receiver,
        address _owner
    ) external returns (uint256);

    function withdraw(
        uint256 _assets,
        address _receiver,
        address _owner,
        uint256 _maxSharesBurn
    ) external returns (uint256);

    function asset() external view returns (address);
}
