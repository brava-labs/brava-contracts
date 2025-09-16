// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

/**
 * @title ICCTPBundleReceiver
 * @notice Minimal interface for the CCTPBundleReceiver contract
 */
interface ICCTPBundleReceiver {
    
    /**
     * @notice Relay a CCTP message and attempt to execute embedded hook
     */
    function relay(bytes calldata message, bytes calldata attestation) external returns (bool relaySuccess, bool hookSuccess, bytes memory hookReturnData);
}
