import { ethers, network } from 'hardhat';
import { Signer, BaseContract, Log, TransactionResponse, TransactionReceipt } from 'ethers';
import * as constants from './constants';
// import * as safe from './utils-safe';
import { ISafe } from '../typechain-types/interfaces/safe/ISafe';
import { deploySafe } from 'athena-sdk';

export const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';

export function log(...args: unknown[]): void {
  if (isLoggingEnabled) {
    console.log(...args);
  }
}

export function formatAmount(amount: bigint, decimals: number): string {
  return (amount / BigInt(10 ** decimals)).toString();
}

async function processLoggerInput(
  input: TransactionResponse | TransactionReceipt | Log[]
): Promise<readonly Log[]> {
  if (Array.isArray(input)) {
    return input; // It's already Log[]
  } else if ('wait' in input) {
    const receipt = await input.wait();
    return receipt?.logs ?? []; // It's TransactionResponse
  } else if ('logs' in input) {
    return input.logs; // It's TransactionReceipt
  }
  throw new Error('Invalid input type');
}

/// takes a hash and returns the event name if it matches one of the known events
/// we need to do this because in events an indexed string is only emitted as a hash
function matchHashToEvent(hash: string): string | null {
  const knownEvents = ['BalanceUpdate', 'BuyCover'];
  return knownEvents.find((event) => ethers.keccak256(ethers.toUtf8Bytes(event)) === hash) ?? hash;
}

export interface BalanceUpdateLog {
  eventName: string | null;
  safeAddress: string;
  strategyId: number;
  poolId: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
}
export interface BuyCoverLog {
  eventName: string | null;
  safeAddress: string;
  strategyId: number;
  poolId: string;
  coverId: string;
}

// give me a transaction response, a transaction receipt, or an array of logs
// I don't care which, just point me at the logger and I'll decode the logs for you
export async function decodeLoggerLog(
  input: TransactionResponse | TransactionReceipt | Log[],
  loggerAddress: string
): Promise<(BalanceUpdateLog | BuyCoverLog)[]> {
  const logs = await processLoggerInput(input);
  const abiCoder = new ethers.AbiCoder();
  const logger = await ethers.getContractAt('Logger', loggerAddress);

  const relevantLogs = logs.filter(
    (log: any) => log.address.toLowerCase() === loggerAddress.toLowerCase()
  );

  return relevantLogs.map((log: any) => {
    const decodedLog = logger.interface.parseLog(log)!;
    const eventName = matchHashToEvent(decodedLog.args[1].hash);

    const baseLog = {
      eventName,
      safeAddress: decodedLog.args[0],
    };

    if (eventName === 'BalanceUpdate') {
      const decodedBytes = abiCoder.decode(
        ['uint16', 'bytes4', 'uint256', 'uint256'],
        decodedLog.args[2]
      );
      return {
        ...baseLog,
        strategyId: decodedBytes[0],
        poolId: decodedBytes[1].toString(),
        balanceBefore: decodedBytes[2],
        balanceAfter: decodedBytes[3],
      } as BalanceUpdateLog;
    } else if (eventName === 'BuyCover') {
      const decodedBytes = abiCoder.decode(
        ['uint16', 'bytes4', 'uint32', 'uint256'],
        decodedLog.args[2]
      );
      return {
        ...baseLog,
        strategyId: decodedBytes[0],
        poolId: decodedBytes[1].toString(),
        coverId: decodedBytes[2].toString(),
      } as BuyCoverLog;
    } else {
      throw new Error(`Unknown event type: ${eventName}`);
    }
  });
}

export async function deploy<T extends BaseContract>(
  contractName: string,
  signer: Signer,
  ...args: unknown[]
): Promise<T> {
  log(`Deploying ${contractName} with args:`, ...args);
  const feeData = await ethers.provider.getFeeData();
  const gasOverrides = {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  };
  const factory = await ethers.getContractFactory(contractName, signer);
  const contract = (await factory.deploy(...args, gasOverrides)) as T;
  await contract.waitForDeployment();
  log(`${contractName} deployed at:`, await contract.getAddress());
  return contract;
}

export async function deployBaseSetup(signer?: Signer): Promise<{
  logger: BaseContract;
  adminVault: BaseContract;
  contractRegistry: BaseContract;
  safeAddr: string;
}> {
  const deploySigner = signer ?? (await ethers.getSigners())[0];
  const logger = await deploy('Logger', deploySigner);
  const adminVault = await deploy(
    'AdminVault',
    deploySigner,
    constants.OWNER_ADDRESS,
    constants.ADMIN_ADDRESS
  );
  const contractRegistry = await deploy(
    'ContractRegistry',
    deploySigner,
    await adminVault.getAddress()
  );
  const safeAddr = await deploySafe(deploySigner);
  log('Safe deployed at:', safeAddr);
  return { logger, adminVault, contractRegistry, safeAddr };
}

let baseSetupCache: Awaited<ReturnType<typeof deployBaseSetup>> | null = null;
let baseSetupSnapshotId: string | null = null;

export async function getBaseSetup(signer?: Signer): Promise<ReturnType<typeof deployBaseSetup>> {
  if (baseSetupCache && baseSetupSnapshotId) {
    log('Reverting to snapshot');
    await network.provider.send('evm_revert', [baseSetupSnapshotId]);
    baseSetupSnapshotId = await network.provider.send('evm_snapshot', []);
    return baseSetupCache;
  }

  log('Deploying base setup');
  const setup = await deployBaseSetup(signer);
  baseSetupCache = setup;
  baseSetupSnapshotId = await network.provider.send('evm_snapshot', []);
  return setup;
}
