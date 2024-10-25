#!/bin/bash

echo "Starting Slither analysis..."

# Run high, medium, and informational detectors
slither . \
    --filter-paths "node_modules|test|scripts|flattened" \
    --detect assembly,assert-state-change,boolean-equal,cyclomatic-complexity,deprecated-standards,erc20-indexed,function-init-state,low-level-calls,missing-inheritance,redundant-statements,unimplemented-functions,unused-state,costly-loop,dead-code,reentrancy-unlimited-gas,too-many-digits \
    --exclude naming-convention,external-function,solc-version