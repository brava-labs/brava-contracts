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
}
