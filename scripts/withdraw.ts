import { executeSafeTransaction, getPortfolioUpdateTx, Pool, poolToProtocol, Portfolio, SafeOperation } from 'athena-sdk';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';

export async function withdraw(signer: Signer, safeAddress: string, sequenceExecutorAddress: string, pool: Pool, amount: bigint, strategyId: number) {
    const protocol = poolToProtocol(pool);
    const currentPortfolio: Portfolio = {
        positions: [
            {
                protocol,
                pool,
                amount,
                strategyId,
            }
        ]
    }

    const targetPortfolio: Portfolio = {
        positions: [
            {
                protocol,
                pool,
                amount: 0n,
                strategyId,
            }
        ]
    }

    const sequence = await getPortfolioUpdateTx([], currentPortfolio, targetPortfolio, [], await signer.getAddress());

    const sequenceExecutor = await ethers.getContractAt('SequenceExecutor', sequenceExecutorAddress);
    if (!sequenceExecutor) {
        throw new Error('SequenceExecutor not deployed');
    }

    return await executeSafeTransaction(safeAddress, sequenceExecutorAddress, 0, sequence, SafeOperation.DelegateCall, signer);
}