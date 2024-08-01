// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

contract PermissionRegistry {
    // Errors
    // ...

    // Events
    // ...

    // Structs
    // ...

    // State variables
    // ...

    /**
     * @notice Mapping to check if the user authorized executing the operation on their behalf
     * @dev Maps an address to another mapping of operation signatures to boolean values
     */
    mapping(address => mapping(bytes4 => bool)) public permissionTable;

    // Constructor
    constructor() {
        // ...
    }

    // External functions
    // ...

    // External functions that are view
    // ...

    // External functions that are pure
    // ...

    // Public functions
    // ...

    // Internal functions
    // ...

    // Private functions
    function _addPermission(address _user, bytes4 _signature) private {
        permissionTable[_user][_signature] = true;
    }

    function _removePermission(address _user, bytes4 _signature) private {
        permissionTable[_user][_signature] = false;
    }


}
