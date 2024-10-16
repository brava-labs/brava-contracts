import { executeSafeTransaction, getPortfolioUpdateTx, Pool, poolToProtocol, Portfolio, portfolioUpdateToBalanceUpdates, SafeOperation } from 'athena-sdk';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants } from '../tests';
import { approveTokenForSafe, deploySafeForSigner } from './safe-setup';
import { deployAndFundTestnet } from './testnet-deploy-and-fund';

async function deposit(signer: Signer, safeAddress: string, sequenceExecutorAddress: string, pool: Pool, amount: bigint, strategyId: number) {

    const protocol = poolToProtocol(pool);
    const targetPortfolio: Portfolio = {
        positions: [
            {
                protocol,
                pool,
                amount,
                strategyId,
            }
        ]
    }

    const deposits = await portfolioUpdateToBalanceUpdates({positions: []}, targetPortfolio, []);
    const sequence = await getPortfolioUpdateTx(deposits, {positions: []}, targetPortfolio, [], safeAddress);

    const sequenceExecutor = await ethers.getContractAt('SequenceExecutor', sequenceExecutorAddress);
    if (!sequenceExecutor) {
        throw new Error('SequenceExecutor not deployed');
    }

    return await executeSafeTransaction(safeAddress, sequenceExecutorAddress, 0, sequence, SafeOperation.DelegateCall, signer);
}

async function main() {
    const [deployer, testAccount1] = await ethers.getSigners();
    const contracts = await deployAndFundTestnet(deployer, [testAccount1]);
    const safeAddress = await deploySafeForSigner(testAccount1, await contracts.baseSetup.safeProxyFactory.getAddress());
    await approveTokenForSafe(testAccount1, safeAddress, constants.tokenConfig.USDC.address, ethers.MaxUint256);
    await deposit(testAccount1, safeAddress, await contracts.sequenceExecutor.getAddress(), Pool.FluidUSDC, 1000000000n, 1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
