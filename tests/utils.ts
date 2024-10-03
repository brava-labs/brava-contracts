import { ethers, network } from 'hardhat';
import {
  Signer,
  BaseContract,
  Log,
  TransactionResponse,
  TransactionReceipt,
  BytesLike,
} from 'ethers';
import * as constants from './constants';
import { tokenConfig } from './constants';
import { actionDefaults, ActionArgs } from './actions';
import { deploySafe, executeSafeTransaction } from 'athena-sdk';
import * as athenaSDK from 'athena-sdk';
import { Logger, AdminVault, ContractRegistry, ISafe } from '../typechain-types';
import { BalanceUpdateLog, BuyCoverLog } from './logs';

export const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';
export const USE_ATHENA_SDK = process.env.USE_ATHENA_SDK === 'true';

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
        ['uint16', 'bytes4', 'uint256', 'uint256', 'uint256'],
        decodedLog.args[2]
      );
      return {
        ...baseLog,
        strategyId: decodedBytes[0],
        poolId: decodedBytes[1].toString(),
        balanceBefore: decodedBytes[2],
        balanceAfter: decodedBytes[3],
        feeInTokens: decodedBytes[4],
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
  log(`${contractName} deployed at:`, await contract.getAddress());
  deployedContracts[contractName] = { address: await contract.getAddress(), contract };
  return contract.waitForDeployment() as Promise<T>;
}

export async function deployBaseSetup(signer?: Signer): Promise<typeof globalSetup> {
  const deploySigner = signer ?? (await ethers.getSigners())[0];
  const logger = await deploy<Logger>('Logger', deploySigner);
  const adminVault = await deploy<AdminVault>(
    'AdminVault',
    deploySigner,
    await deploySigner.getAddress(),
    0
  );
  // const contractRegistry = await deploy<ContractRegistry>(
  //   'ContractRegistry',
  //   deploySigner,
  //   await adminVault.getAddress()
  // );
  const safeAddress = await deploySafe(deploySigner);
  const safe = await ethers.getContractAt('ISafe', safeAddress);
  log('Safe deployed at:', safeAddress);
  return { logger, adminVault, safe, signer: deploySigner };
}

let baseSetupCache: Awaited<ReturnType<typeof deployBaseSetup>> | null = null;
let baseSetupSnapshotId: string | null = null;

export async function getBaseSetup(signer?: Signer): Promise<typeof globalSetup> {
  if (baseSetupCache && baseSetupSnapshotId) {
    log('Reverting to snapshot');
    await network.provider.send('evm_revert', [baseSetupSnapshotId]);
    baseSetupSnapshotId = await network.provider.send('evm_snapshot', []);
    return baseSetupCache;
  }

  log('Deploying base setup');
  const setup = await deployBaseSetup(signer);
  if (!setup) {
    throw new Error('Base setup deployment failed');
  }
  baseSetupCache = setup;
  baseSetupSnapshotId = await network.provider.send('evm_snapshot', []);
  setGlobalSetup(setup);
  return setup;
}

// Given 2 transaction receipts, a fee percentage (in basis points) and the balance
// I will calculate the expected fee for you
export async function calculateExpectedFee(
  tx1: TransactionReceipt,
  tx2: TransactionReceipt,
  feePercentage: number,
  balance: bigint
): Promise<bigint> {
  const timestamp1 = (await tx1.getBlock()).timestamp;
  const timestamp2 = (await tx2.getBlock()).timestamp;
  const timeDifference =
    timestamp2 > timestamp1 ? timestamp2 - timestamp1 : timestamp1 - timestamp2;
  const annualFee = (balance * BigInt(feePercentage)) / BigInt(10000);
  const fee = (annualFee * BigInt(timeDifference)) / BigInt(31536000);
  return fee;
}

// Global setup for the tests
// This is used to store the contracts and signer for the tests
let globalSetup:
  | {
      logger: Logger;
      adminVault: AdminVault;
      safe: ISafe;
      signer: Signer;
    }
  | undefined;

export function setGlobalSetup(params: {
  logger: Logger;
  adminVault: AdminVault;
  safe: ISafe;
  signer: Signer;
}) {
  globalSetup = params;
}

export function getGlobalSetup(): {
  logger: Logger;
  adminVault: AdminVault;
  safe: ISafe;
  signer: Signer;
} {
  if (!globalSetup) {
    throw new Error('Global setup not set');
  }
  return globalSetup;
}

interface DeployedContract {
  address: string;
  contract: BaseContract;
}
const deployedContracts: Record<string, DeployedContract> = {};

export function getDeployedContract(name: string): DeployedContract | undefined {
  return deployedContracts[name];
}

// Helper function to execute an action
// This function will use default values for any parameters not specified
// It will also use the global setup to get the safe address and signer
// It will also get the deployed contract for the action type
// It is also possible to specify using the SDK or manual encoding
export async function executeAction(args: ActionArgs) {
  // Load defaults for the action type
  const defaults = actionDefaults[args.type] || {};
  // overwrite defaults with any given args
  const {
    protocol = defaults.protocol,
    safeAddress = (await getGlobalSetup()).safe.getAddress(),
    value = defaults.value,
    safeOperation = defaults.safeOperation,
    signer = (await getGlobalSetup()).signer,
    token = defaults.token,
    amount = defaults.amount,
    feePercentage = defaults.feePercentage,
    minAmount = defaults.minAmount,
    useSDK = defaults.useSDK,
    minSharesReceived = defaults.minSharesReceived,
    maxSharesBurned = defaults.maxSharesBurned,
  } = args;

  // Check for required parameters
  if (!signer || value === undefined || safeOperation === undefined) {
    throw new Error('Missing required parameters for executeAction');
  }

  // get the deployed contract for the action type
  const actionContract = getDeployedContract(args.type);

  if (!actionContract) {
    throw new Error(`Contract ${args.type} not deployed`);
  }

  if (!token) {
    throw new Error('Missing token in executeAction');
  }
  // check we have a valid token and return the corresponding vault address
  let vaultAddress: string | undefined;
  const tokenData = tokenConfig[token];
  if ('vaults' in tokenData) {
    vaultAddress = tokenData.vaults[protocol as keyof typeof tokenData.vaults];
  }
  if (!vaultAddress) {
    throw new Error(`Invalid token or missing vaults for ${token}`);
  }

  // check if all encoding parameters are set
  if (
    (!amount && amount !== '0') ||
    (!feePercentage && feePercentage !== 0) ||
    (!minAmount && minAmount !== '0')
  ) {
    console.log('amount', amount);
    console.log('feePercentage', feePercentage);
    console.log('minAmount', minAmount);
    throw new Error('Missing encoding parameters in executeAction');
  }
  let payload: string | BytesLike;
  if (useSDK) {
    // We're using the SDK, encode it
    const ActionClass = args.type + 'Action';
    if (
      typeof athenaSDK[ActionClass as keyof typeof athenaSDK] === 'function' &&
      'prototype' in athenaSDK[ActionClass as keyof typeof athenaSDK]
    ) {
      const ActionConstructor = athenaSDK[ActionClass as keyof typeof athenaSDK] as new (
        token: string,
        amount: string
      ) => any;

      const action = new ActionConstructor(vaultAddress, amount.toString());
      payload = action.encodeArgsForExecuteActionCall(0);
    } else {
      throw new Error(`Action ${ActionClass} is not a constructor in Athena SDK`);
    }
  } else {
    // We're not using the SDK, encode it manually
    const encodingConfig = defaults.encoding;
    if (!encodingConfig) {
      throw new Error(`Missing encoding configuration for action type: ${args.type}`);
    }

    const encodingValues = encodingConfig.encodingVariables.map((variable) => {
      switch (variable) {
        case 'vaultAddress':
          return vaultAddress;
        case 'amount':
          return amount;
        case 'feePercentage':
          return feePercentage;
        case 'minSharesReceived':
          return minSharesReceived;
        case 'maxSharesBurned':
          return maxSharesBurned;
        case 'poolId':
          return ethers.keccak256(vaultAddress).slice(0, 10);
        case 'feeBasis':
          return feePercentage;
        case 'withdrawRequest':
          return amount;
        default:
          throw new Error(`Unknown encoding variable: ${variable}`);
      }
    });

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      encodingConfig.inputParams,
      encodingValues
    );

    // encode the action
    payload = actionContract.contract.interface.encodeFunctionData('executeAction', [encoded, 42]);
  }

  // execute the action
  return executeSafeTransaction(
    await Promise.resolve(safeAddress),
    actionContract.address,
    value,
    payload,
    safeOperation,
    signer
  );
}
