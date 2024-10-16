import { deploySafe, executeSafeTransaction } from 'athena-sdk';
import {
  BaseContract,
  Log,
  Signer,
  TransactionReceipt,
  TransactionResponse
} from 'ethers';
import { ethers, network } from 'hardhat';
import { AdminVault, ISafe, Logger, Proxy, SequenceExecutor } from '../typechain-types';
import { ActionArgs, actionDefaults } from './actions';
import { CURVE_3POOL_INDICES, ROLES, SAFE_PROXY_FACTORY_ADDRESS, tokenConfig } from './constants';
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
  const factory = await ethers.getContractFactory(contractName, signer);
  let contract: T;
  try {
    // By default try and deploy with gasOverrides from the provider
    const gasOverrides = {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
    contract = (await factory.deploy(...args, gasOverrides)) as T;
  } catch (error) {
    // If the deployment fails, try and deploy with 0 gas
    const gasOverrides = {
      maxFeePerGas: '0',
      maxPriorityFeePerGas: '0',
    };
    try {
      contract = (await factory.deploy(...args, gasOverrides)) as T;
    } catch (error) {
      // now we really are out of options
      log(`Error deploying ${contractName} with gas overrides:`, error);
      throw error;
    }
  }
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
    0,
    logger.getAddress()
  );
  const safeFactoryProxy = await deploy<Proxy>('Proxy', deploySigner, SAFE_PROXY_FACTORY_ADDRESS);
  const safeAddress = await deploySafe(deploySigner, await safeFactoryProxy.getAddress());
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

// Helper function to encode an action
// This function will use default values for any parameters not specified
// It will also use the global setup to get the safe address and signer
// It will also get the deployed contract for the action type
// It is also possible to specify using the SDK or manual encoding
export async function encodeAction(args: ActionArgs): Promise<string> {
  const defaults = actionDefaults[args.type];
  if (!defaults) {
    throw new Error(`Unknown action type: ${args.type}`);
  }

  const mergedArgs = { ...defaults, ...args };
  const { encoding } = defaults;

  const encodingValues = encoding!.encodingVariables.map((variable) => {
    let value = (mergedArgs as Record<string, any>)[variable];

    // Handle poolId special case
    if (variable === 'poolId') {
      if (mergedArgs.poolId) {
        return mergedArgs.poolId;
      } else if (mergedArgs.poolAddress) {
        return getBytes4(mergedArgs.poolAddress);
      } else {
        throw new Error(`Missing required parameter: poolId or poolAddress for ${args.type}`);
      }
    }

    // Handle Curve swap special case
    // we generally have token name, but we need to change to the curve token index
    if (variable === 'fromToken') {
      if (mergedArgs.tokenIn && mergedArgs.tokenIn in CURVE_3POOL_INDICES) {
        return CURVE_3POOL_INDICES[mergedArgs.tokenIn as keyof typeof CURVE_3POOL_INDICES];
      } else {
        throw new Error(`Invalid or missing token parameter for ${args.type}`);
      }
    }
    // the same for toToken
    if (variable === 'toToken') {
      if (mergedArgs.tokenOut && mergedArgs.tokenOut in CURVE_3POOL_INDICES) {
        return CURVE_3POOL_INDICES[mergedArgs.tokenOut as keyof typeof CURVE_3POOL_INDICES];
      } else {
        throw new Error(`Invalid or missing token parameter for ${args.type}`);
      }
    }

    // Handle PullToken and SendToken special case
    if (variable === 'tokenAddress') {
      if (mergedArgs.tokenAddress) {
        return mergedArgs.tokenAddress;
      } else if (mergedArgs.token) {
        return tokenConfig[mergedArgs.token as keyof typeof tokenConfig].address;
      } else {
        throw new Error(`Missing required parameter: token for ${args.type}`);
      }
    }

    if (value === undefined) {
      throw new Error(`Missing required parameter: ${variable} for ${args.type}`);
    }
    return value;
  });

  log('Encoding action:', args.type);
  log('Encoding params:', encoding!.inputParams);
  log('Encoding values:', encodingValues);
  const inputParams = ethers.AbiCoder.defaultAbiCoder().encode(
    encoding!.inputParams,
    encodingValues
  );
  const actionContract = getDeployedContract(args.type);
  if (!actionContract) {
    throw new Error(`Contract ${args.type} not deployed`);
  }
  const payload = actionContract.contract.interface.encodeFunctionData('executeAction', [
    inputParams,
    42,
  ]);
  log('Action contract:', actionContract.address);
  log('Encoded payload:', payload);
  return payload;
}

// New executeAction function that uses encodeAction
export async function executeAction(args: ActionArgs): Promise<TransactionResponse> {
  const {
    safeAddress = (await getGlobalSetup()).safe.getAddress(),
    value = actionDefaults[args.type]?.value ?? 0,
    safeOperation = actionDefaults[args.type]?.safeOperation ?? 0,
    signer = (await getGlobalSetup()).signer,
  } = args;

  const actionContract = getDeployedContract(args.type);
  if (!actionContract) {
    throw new Error(`Contract ${args.type} not deployed`);
  }

  const payload = await encodeAction(args);

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

export async function executeSequence(
  safeAddr: string,
  sequence: SequenceExecutor.SequenceStruct
): Promise<TransactionResponse> {
  // lets start with a dumb function, just read in an run it
  // get the sequence executor address
  const sequenceExecutorAddress = getDeployedContract('SequenceExecutor')?.address;
  if (!sequenceExecutorAddress) {
    throw new Error('SequenceExecutor not deployed');
  }

  const signer = (await getGlobalSetup()).signer;

  const sequenceExecutor = await ethers.getContractAt('SequenceExecutor', sequenceExecutorAddress);
  if (!sequenceExecutor) {
    throw new Error('SequenceExecutor not deployed');
  }
  const payload = sequenceExecutor.interface.encodeFunctionData('executeSequence', [sequence]);

  // execute the sequence
  log('Executing sequence');
  log('Sequence executor address:', sequenceExecutorAddress);
  log('Safe address:', safeAddr);
  return executeSafeTransaction(safeAddr, sequenceExecutorAddress, 0, payload, 1, signer);
}

type RoleName = keyof typeof ROLES;

const roleBytes: { [key in RoleName]: string } = Object.fromEntries(
  Object.entries(ROLES).map(([key, value]) => [key, ethers.keccak256(ethers.toUtf8Bytes(value))])
) as { [key in RoleName]: string };

const roleLookup: { [key: string]: RoleName } = Object.fromEntries(
  Object.entries(roleBytes).map(([key, value]) => [value, key as RoleName])
);

export function getRoleBytes(roleName: RoleName): string {
  return roleBytes[roleName];
}

export function getRoleName(roleBytes: string): RoleName | undefined {
  return roleLookup[roleBytes];
}

export function getBytes4(address: string): string {
  return ethers.keccak256(address).slice(0, 10);
}
