// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule} from "./IEip712TypedDataSafeModule.sol";

interface ISequenceExecutor {
    struct Sequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    function executeSequence(
        Sequence calldata _currSequence,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) external payable;
}


