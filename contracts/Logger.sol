// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

contract Logger {
    event ActionEvent(
        address indexed caller,
        string indexed logName,
        bytes data
    );

    event ActionDirectEvent(
        address indexed caller,
        string indexed logName,
        bytes data
    );

    event BalanceUpdateEvent(
        address indexed account,
        bytes4 indexed poolId,
        uint256 amountBefore,
        uint256 amountAfter,
        uint16 strategyId
    );

    event CoverBuyEvent(
        address indexed account,
        bytes4 indexed poolId,
        uint256 amount,
        uint32 period,
        uint16 strategyId
    );

    // TODO do we need similar events for fees and swaps?
    // pulling into safe and withdrawing?

    function logActionEvent(
        string memory _logName,
        bytes memory _data
    ) public {
        emit ActionEvent(msg.sender, _logName, _data);
    }

    function logActionDirectEvent(
        string memory _logName,
        bytes memory _data
    ) public {
        emit ActionDirectEvent(msg.sender, _logName, _data);
    }

    function logBalanceUpdateEvent(
        bytes4 _poolId,
        uint256 _amountBefore,
        uint256 _amountAfter,
        uint16 _strategyId
    ) public {
        emit BalanceUpdateEvent(msg.sender, _poolId, _amountBefore, _amountAfter, _strategyId);
    }

    function logCoverBuyEvent(
        bytes4 _poolId,
        uint256 _amount,
        uint32 _period,
        uint16 _strategyId
    ) public {
        emit CoverBuyEvent(msg.sender, _poolId, _amount, _period, _strategyId);
    }
}
