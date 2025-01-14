// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

interface IAggregatorV3 {
    // View Functions
    function accessController() external view returns (address);
    function aggregator() external view returns (address);
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function getAnswer(uint256 _roundId) external view returns (int256);
    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function getTimestamp(uint256 _roundId) external view returns (uint256);
    function latestAnswer() external view returns (int256);
    function latestRound() external view returns (uint256);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function latestTimestamp() external view returns (uint256);
    function owner() external view returns (address);
    function phaseAggregators(uint16) external view returns (address);
    function phaseId() external view returns (uint16);
    function proposedAggregator() external view returns (address);
    function proposedGetRoundData(
        uint80 _roundId
    )
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function proposedLatestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function version() external view returns (uint256);

    // State-Changing Functions
    function acceptOwnership() external;
    function confirmAggregator(address _aggregator) external;
    function proposeAggregator(address _aggregator) external;
    function setController(address _accessController) external;
    function transferOwnership(address _to) external;

    // Events
    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);
    event NewRound(uint256 indexed roundId, address indexed startedBy, uint256 startedAt);
    event OwnershipTransferRequested(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
}
