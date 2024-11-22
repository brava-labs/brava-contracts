import {
  executeSafeTransaction,
  getPortfolioUpdateTx,
  Pool,
  Portfolio,
  portfolioUpdateToBalanceUpdates,
  SafeOperation
} from 'brava-ts-client';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';

export async function deposit(
  signer: Signer,
  safeAddress: string,
  sequenceExecutorAddress: string,
  pool: Pool,
  amount: bigint,
  strategyId: number
) {
  const targetPortfolio: Portfolio = {
    positions: [
      {
        pool,
        amount,
        strategyId,
      },
    ],
  };
  const deposits = await portfolioUpdateToBalanceUpdates({ positions: [] }, targetPortfolio, []);
  const sequence = await getPortfolioUpdateTx(
    deposits,
    { positions: [] },
    targetPortfolio,
    [],
    await signer.getAddress()
  );

  const sequenceExecutor = await ethers.getContractAt('SequenceExecutor', sequenceExecutorAddress);
  if (!sequenceExecutor) {
    throw new Error('SequenceExecutor not deployed');
  }

  return await executeSafeTransaction(
    safeAddress,
    sequenceExecutorAddress,
    0,
    sequence,
    SafeOperation.DelegateCall,
    signer
  );
}

async function main() {}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
