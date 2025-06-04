import nexusSdk, { CoverAsset } from '@nexusmutual/sdk';
import * as bravaSdk from 'brava-ts-client';
import { deploySafe, executeSafeTransaction } from 'brava-ts-client';
import { BaseContract, Log, Signer, TransactionReceipt, TransactionResponse } from 'ethers';
import { ethers, network, tenderly } from 'hardhat';
import {
  AdminVault,
  ISafe,
  Logger,
  SequenceExecutor,
  SequenceExecutorDebug,
  SafeDeployment,
  EIP712TypedDataSafeModule,
  SafeSetupRegistry,
} from '../typechain-types';
import { ActionArgs, actionDefaults, BuyCoverArgs } from './actions';
import {
  CREATE_X_ADDRESS,
  CURVE_3POOL_INDICES,
  ROLES,
  tokenConfig,
} from './constants';
import { BaseLog, LogDefinitions, LOGGER_INTERFACE } from './logs';
import {
  BuyCoverInputTypes,
  NexusMutualBuyCoverParamTypes,
  NexusMutualPoolAllocationRequestTypes,
  ParaswapSwapParams,
} from './params';
import { getCoverQuote } from './actions/nexus-mutual/nexusCache';

export const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';
export const USE_BRAVA_SDK = process.env.USE_BRAVA_SDK === 'true';

export { deploySafe, executeSafeTransaction };
export function log(...args: unknown[]): void {
  if (isLoggingEnabled) {
    console.log(...args);
  }
}

export function formatAmount(amount: bigint, decimals: number): string {
  return (amount / BigInt(10 ** decimals)).toString();
}

// Decode a log from the logger
// This function will take in a TransactionResponse, TransactionReceipt or an array of logs
// and return an array of decoded logs
export async function decodeLoggerLog(
  input: TransactionResponse | TransactionReceipt | Log[]
): Promise<BaseLog[]> {
  log('Decoding logger log');

  let logs: Log[];
  if (Array.isArray(input)) {
    logs = input;
  } else if ('wait' in input) {
    // It's a TransactionResponse, wait for the receipt
    const receipt = await input.wait();
    if (!receipt) {
      throw new Error('Problem decoding log: Transaction receipt not found');
    }
    logs = receipt.logs as Log[];
  } else {
    // It's a TransactionReceipt
    logs = input.logs as Log[];
  }

  const abiCoder = new ethers.AbiCoder();
  const loggerInterface = new ethers.Interface(LOGGER_INTERFACE);

  // TODO: Deal with the AdminVaultEvent logs

  // The event signature for ActionEvent
  const actionEventTopic = loggerInterface.getEvent('ActionEvent')!.topicHash;

  const relevantLogs = logs.filter((log: Log) => log.topics[0] === actionEventTopic);

  return relevantLogs.map((log: Log) => {
    const parsedLog = loggerInterface.parseLog({
      topics: log.topics as string[],
      data: log.data,
    })!;

    const eventId = parsedLog.args.logId;
    const baseLog = {
      eventId,
      safeAddress: parsedLog.args.caller,
    };

    const logDefinition = LogDefinitions[eventId];
    if (!logDefinition) {
      throw new Error(`Problem decoding log: Unknown event type: ${eventId}`);
    }

    const decodedBytes = abiCoder.decode(logDefinition.types, parsedLog.args.data);
    const extendedLog = logDefinition.decode(baseLog, decodedBytes);

    return extendedLog;
  });
}

export async function deploy<T extends BaseContract>(
  contractName: string,
  signer: Signer,
  ...args: unknown[]
): Promise<T> {
  log(`Deploying ${contractName} with args:`, ...args);
  const factory = await ethers.getContractFactory(contractName, signer);
  const feeData = await ethers.provider.getFeeData();

  // Special case for Logger contract - use direct deployment
  if (contractName === 'Logger') {
    const gasOverrides = {
      maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * BigInt(120)) / BigInt(100) : undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * BigInt(120)) / BigInt(100) : undefined,
    };
    const contract = await factory.deploy(gasOverrides);
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    log(`${contractName} deployed at:`, addr);
    deployedContracts[contractName] = { address: addr, contract: contract as BaseContract };
    return contract as T;
  }

  // For all other contracts, use CreateX
  const bytecode = factory.bytecode;
  let initCode = '';
  const contractAbi = factory.interface.formatJson();
  const constructorAbi = JSON.parse(contractAbi).find((item: any) => item.type === 'constructor');
  if (constructorAbi) {
    const constructorTypes = constructorAbi.inputs.map((input: any) => input.type);
    const abiCoder = new ethers.AbiCoder();
    const constructorArgs = abiCoder.encode(constructorTypes, args);
    initCode = ethers.concat([bytecode, constructorArgs]);
  } else {
    initCode = bytecode;
  }
  const salt = ethers.keccak256(ethers.toUtf8Bytes('Brava'));
  const createXFactory = await ethers.getContractAt('ICreateX', CREATE_X_ADDRESS, signer);
  let contract: T;
  let receipt: TransactionReceipt | null = null;
  try {
    // By default try and deploy with gasOverrides from the provider, increased by 20% to account for potential increases
    const gasOverrides = {
      maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * BigInt(120)) / BigInt(100) : undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * BigInt(120)) / BigInt(100) : undefined,
    };
    const tx = await createXFactory['deployCreate2(bytes32,bytes)'](salt, initCode, gasOverrides);
    receipt = await tx.wait();
  } catch (error) {
    // Log the error and rethrow - no more fallback to zero gas as that's not valid
    log(`Error deploying ${contractName}:`, error);
    throw error;
  }
  const contractCreationEvent = receipt?.logs.find(
    (log: any) => log.eventName === 'ContractCreation'
  );
  if (!contractCreationEvent) {
    throw new Error(`Contract creation event not found for ${contractName}`);
  }
  const addr = ethers.getAddress(contractCreationEvent.topics[1].slice(26));
  contract = (await ethers.getContractAt(contractName, addr, signer)) as unknown as T;
  log(`${contractName} deployed at:`, addr);
  deployedContracts[contractName] = { address: addr, contract };
  if (process.env.TENDERLY_VERIFY === 'true') {
    tenderly.verify({
      name: contractName,
      address: addr,
    });
  }
  return contract;
}

type BaseSetup = {
  logger: Logger;
  adminVault: AdminVault;
  safe: ISafe;
  signer: Signer;
  sequenceExecutor: SequenceExecutor;
  safeDeployment: SafeDeployment;
  eip712Module: EIP712TypedDataSafeModule;
  safeSetupRegistry: SafeSetupRegistry;
};

// Custom Safe deployment helper that can replace brava-ts-client deploySafe
// This can be easily switched back to the ts-client when it's updated
export async function deployBravaSafe(
  signer: Signer, 
  safeDeployment?: SafeDeployment,
  eip712Module?: EIP712TypedDataSafeModule
): Promise<string> {
  // If SafeDeployment is provided, use it for deployment
  if (safeDeployment && eip712Module) {
    // Use the SafeDeployment system with typed data configuration
    const signerAddress = await signer.getAddress();
    
    // Check if Safe already exists
    const isDeployed = await safeDeployment.isSafeDeployed(signerAddress);
    if (isDeployed) {
      return await safeDeployment.predictSafeAddress(signerAddress);
    }

    // For testing, we'll deploy using the typed data config
    // This requires the TYPED_DATA_SAFE_CONFIG to be set up in the registry
    const configId = ethers.id("TYPED_DATA_SAFE_CONFIG");
    
         try {
       // Try to deploy using the typed data system
       const tx = await safeDeployment.connect(signer).deploySafeForUser(
         signerAddress,
         configId
       );
       const receipt = await tx.wait();
       const safeAddress = await safeDeployment.predictSafeAddress(signerAddress);
       return safeAddress;
     } catch (error) {
       // Fall back to basic Safe deployment if config not set up
       // Fall back to basic Safe deployment if config not set up
     }
  }

  // Fall back to the original brava-ts-client deploySafe
  // This will be used when SafeDeployment isn't available or configured
  return await deploySafe(signer);
}

export async function deployBaseSetup(signer?: Signer): Promise<BaseSetup> {
  const deploySigner = signer ?? (await ethers.getSigners())[0];
  
  // Deploy Logger with proxy (similar to production setup)
  const loggerImplementation = await deploy<Logger>('Logger', deploySigner);
  
  // Deploy ERC1967Proxy for Logger
  const loggerInitData = loggerImplementation.interface.encodeFunctionData('initialize');
  const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy', deploySigner);
  const loggerProxy = await ERC1967ProxyFactory.deploy(
    await loggerImplementation.getAddress(),
    loggerInitData
  );
  await loggerProxy.waitForDeployment();
  
  // Get Logger interface connected to proxy
  const logger = await ethers.getContractAt('Logger', await loggerProxy.getAddress());
  
  const adminVault = await deploy<AdminVault>(
    'AdminVault',
    deploySigner,
    await deploySigner.getAddress(),
    0,
    await logger.getAddress()
  );
 
  const sequenceExecutor = await deploy<SequenceExecutor>(
    'SequenceExecutor',
    deploySigner,
    await adminVault.getAddress()
  );

  // Deploy SafeSetupRegistry (standalone contract with constructor params)
  const safeSetupRegistry = await deploy<SafeSetupRegistry>(
    'SafeSetupRegistry',
    deploySigner,
    await adminVault.getAddress(),
    await logger.getAddress()
  );

  // Deploy SafeDeployment with proxy (for deterministic addresses across chains)
  const safeDeploymentImplementation = await deploy<SafeDeployment>(
    'SafeDeployment',
    deploySigner
  );

  // Deploy ERC1967Proxy for SafeDeployment with initialization
  const SAFE_SINGLETON = "0x41675C099F32341bf84BFc5382aF534df5C7461a";
  const SAFE_SETUP = "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb";
  
  const safeDeploymentInitData = safeDeploymentImplementation.interface.encodeFunctionData('initialize', [
    await adminVault.getAddress(),
    await logger.getAddress(),
    SAFE_SINGLETON,
    SAFE_SETUP,
    await safeSetupRegistry.getAddress()
  ]);
  
  const safeDeploymentProxy = await ERC1967ProxyFactory.deploy(
    await safeDeploymentImplementation.getAddress(),
    safeDeploymentInitData
  );
  await safeDeploymentProxy.waitForDeployment();
  
  // Get SafeDeployment interface connected to proxy
  const safeDeployment = await ethers.getContractAt('SafeDeployment', await safeDeploymentProxy.getAddress());

  // Deploy EIP712TypedDataSafeModule
  const eip712Module = await deploy<EIP712TypedDataSafeModule>(
    'EIP712TypedDataSafeModule',
    deploySigner,
    await adminVault.getAddress(),
    await sequenceExecutor.getAddress(),
    'BravaSafeModule',
    '1.0.0'
  );

  // Set up the SafeDeployment with typed data module
  try {
    await safeDeployment.setEIP712TypedDataModule(await eip712Module.getAddress());
  } catch (error) {
    // Continue without this setup for basic functionality
  }

  // Create and approve the TYPED_DATA_SAFE_CONFIG in SafeSetupRegistry
  try {
    const TYPED_DATA_SAFE_CONFIG_ID = ethers.id("TYPED_DATA_SAFE_CONFIG");
    
    // Grant TRANSACTION_PROPOSER_ROLE to deploySigner (needed for proposeSetupConfig)
    const TRANSACTION_PROPOSER_ROLE = ethers.id("TRANSACTION_PROPOSER_ROLE");
    if (!(await adminVault.hasRole(TRANSACTION_PROPOSER_ROLE, await deploySigner.getAddress()))) {
      await adminVault.grantRole(TRANSACTION_PROPOSER_ROLE, await deploySigner.getAddress());
    }
    
    // Grant TRANSACTION_EXECUTOR_ROLE to deploySigner (needed for approveSetupConfig)
    const TRANSACTION_EXECUTOR_ROLE = ethers.id("TRANSACTION_EXECUTOR_ROLE");
    if (!(await adminVault.hasRole(TRANSACTION_EXECUTOR_ROLE, await deploySigner.getAddress()))) {
      await adminVault.grantRole(TRANSACTION_EXECUTOR_ROLE, await deploySigner.getAddress());
    }
    
    // Create the configuration (separate parameters, not as object)
    // Use the same fallback handler as the Safe setup
    const SAFE_COMPATIBILITY_FALLBACK_HANDLER = "0x017062a1dE2FE6b99BE3d9d37841FeD19F573804";
    await safeSetupRegistry.proposeSetupConfig(
      TYPED_DATA_SAFE_CONFIG_ID,
      SAFE_COMPATIBILITY_FALLBACK_HANDLER, // fallbackHandler
      [await eip712Module.getAddress()], // modules array
      ethers.ZeroAddress // guard
    );
    
    // Approve the configuration
    await safeSetupRegistry.approveSetupConfig(TYPED_DATA_SAFE_CONFIG_ID);
  } catch (error) {
    // Continue without this setup for basic functionality
  }

  // Deploy Safe using our custom helper
  const safeAddress = await deployBravaSafe(deploySigner, safeDeployment, eip712Module);
  const safe = await ethers.getContractAt('ISafe', safeAddress);


  return { 
    logger, 
    adminVault, 
    safe, 
    signer: deploySigner, 
    sequenceExecutor,
    safeDeployment,
    eip712Module,
    safeSetupRegistry
  };
}

let baseSetupCache: Awaited<ReturnType<typeof deployBaseSetup>> | null = null;
let baseSetupSnapshotId: string | null = null;

export async function getBaseSetup(signer?: Signer): Promise<BaseSetup> {
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
      safeDeployment: SafeDeployment;
      eip712Module: EIP712TypedDataSafeModule;
      safeSetupRegistry: SafeSetupRegistry;
    }
  | undefined;

export function setGlobalSetup(params: {
  logger: Logger;
  adminVault: AdminVault;
  safe: ISafe;
  signer: Signer;
  safeDeployment: SafeDeployment;
  eip712Module: EIP712TypedDataSafeModule;
  safeSetupRegistry: SafeSetupRegistry;
}) {
  globalSetup = params;
}

export function getGlobalSetup(): {
  logger: Logger;
  adminVault: AdminVault;
  safe: ISafe;
  signer: Signer;
  safeDeployment: SafeDeployment;
  eip712Module: EIP712TypedDataSafeModule;
  safeSetupRegistry: SafeSetupRegistry;
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

async function prepareNexusMutualCoverPurchase(args: Partial<BuyCoverArgs>): Promise<{
  encodedFunctionCall: string;
  buyCoverParams: any;
  poolAllocationRequests: any[];
}> {
  const mergedArgs = { ...actionDefaults.BuyCover, ...args } as BuyCoverArgs;
  const globalSetup = await getGlobalSetup();
  const safeAddress = await globalSetup.safe.getAddress();

  const { productId, amountToInsure, daysToInsure, coverAsset, coverAddress } = mergedArgs;
  
  // Use destinationAddress if provided, otherwise fall back to safeAddress
  const coverOwnerAddress = coverAddress || safeAddress;
  log('Cover owner address:', coverOwnerAddress);

  // Get token decimals based on cover asset
  let decimals = 18;
  switch (coverAsset) {
    case CoverAsset.ETH:
      decimals = 18;
      break;
    case CoverAsset.DAI:
      decimals = tokenConfig.DAI.decimals;
      break;
    case CoverAsset.USDC:
      decimals = tokenConfig.USDC.decimals;
      break;
  }

  // Parse the amount to the correct decimals
  const coverAmount = ethers.parseUnits(amountToInsure, decimals).toString();

  // Get quote from cache or API using our new cache system
  const { buyCoverParams, poolAllocationRequests } = await getCoverQuote(
    productId,
    coverAmount,
    daysToInsure,
    coverAsset,
    coverOwnerAddress
  );

  const abiCoder = new ethers.AbiCoder();
  const buyCoverParamsEncoded = abiCoder.encode([NexusMutualBuyCoverParamTypes], [buyCoverParams]);
  const poolAllocationRequestsEncoded = poolAllocationRequests.map((request) =>
    abiCoder.encode([NexusMutualPoolAllocationRequestTypes], [request])
  );

  const encodedParamsCombined = abiCoder.encode(
    [BuyCoverInputTypes],
    [
      {
        owner: coverOwnerAddress,
        buyCoverParams: buyCoverParamsEncoded,
        poolAllocationRequests: poolAllocationRequestsEncoded,
      },
    ]
  );

  const buyCover = getDeployedContract('BuyCover');
  if (!buyCover) {
    throw new Error('BuyCover contract not deployed');
  }

  const encodedFunctionCall = buyCover.contract.interface.encodeFunctionData('executeAction', [
    encodedParamsCombined,
    1,
  ]);

  return {
    encodedFunctionCall,
    buyCoverParams,
    poolAllocationRequests,
  };
}

async function prepareParaswapSwap(args: Partial<ActionArgs>): Promise<{
  encodedFunctionCall: string;
}> {
  const mergedArgs = { ...actionDefaults.ParaswapSwap, ...args } as ActionArgs;
  const abiCoder = new ethers.AbiCoder();
  const encodedParamsCombined = abiCoder.encode(
    [ParaswapSwapParams],
    [mergedArgs]
  );
  const paraswap = getDeployedContract('ParaswapSwap');
  if (!paraswap) {
    throw new Error('ParaswapSwap contract not deployed');
  }
  const encodedFunctionCall = paraswap.contract.interface.encodeFunctionData('executeAction', [
    encodedParamsCombined,
    1,
  ]);
  return { encodedFunctionCall };
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

  const mergedArgs = { ...defaults, ...args } as ActionArgs;

  // Nexus is special, lets just use their SDK
  if (mergedArgs.type === 'BuyCover') {
    const { encodedFunctionCall } = await prepareNexusMutualCoverPurchase(mergedArgs);
    return encodedFunctionCall;
  }

  // Paraswap has bytes that need encoding as a tuple
  if (mergedArgs.type === 'ParaswapSwap') {
    if ('tokenIn' in mergedArgs && 'tokenOut' in mergedArgs) {
      // convert tokens to addresses
      mergedArgs.tokenInAddress = tokenConfig[mergedArgs.tokenIn as keyof typeof tokenConfig].address;
      mergedArgs.tokenOutAddress = tokenConfig[mergedArgs.tokenOut as keyof typeof tokenConfig].address;
    }
    const { encodedFunctionCall } = await prepareParaswapSwap(mergedArgs);
    return encodedFunctionCall;
  }

  // Use Brava SDK if useSDK is true in the action defaults
  if (mergedArgs.useSDK) {
    const sdkFunctionName = `${mergedArgs.type}Action`;
    if (sdkFunctionName in bravaSdk) {
      const ActionClass = (bravaSdk as any)[sdkFunctionName];
      if (typeof ActionClass === 'function') {
        // Use sdkArgs to order the arguments correctly
        const orderedArgs = defaults.sdkArgs?.map((argName) => (mergedArgs as any)[argName]) || [];
        const actionInstance = new ActionClass(...orderedArgs);
        return actionInstance.encodeArgs();
      }
    }
    throw new Error(`Brava SDK function not found for action type: ${mergedArgs.type}`);
  }

  // Fall back to custom encoding
  const { encoding } = mergedArgs;
  if (!encoding) {
    throw new Error(`No encoding found for action type: ${args.type}`);
  }

  const encodingValues = encoding.encodingVariables.map((variable) => {
    let value = (mergedArgs as any)[variable];

    // Handle poolId special case
    if (variable === 'poolId') {
      if ('poolId' in mergedArgs) {
        return mergedArgs.poolId;
      } else if ('poolAddress' in mergedArgs) {
        return getBytes4(mergedArgs.poolAddress!);
      } else {
        throw new Error(`Missing required parameter: poolId or poolAddress for ${args.type}`);
      }
    }

    // Handle Curve swap special case
    if (variable === 'fromToken' || variable === 'toToken') {
      if ('tokenIn' in mergedArgs && 'tokenOut' in mergedArgs) {
        const tokenKey = variable === 'fromToken' ? 'tokenIn' : 'tokenOut';
        const token = mergedArgs[tokenKey];
        if (token in CURVE_3POOL_INDICES) {
          return CURVE_3POOL_INDICES[token as keyof typeof CURVE_3POOL_INDICES];
        } else {
          throw new Error(`Invalid token parameter for ${args.type}`);
        }
      }
    }

    // Handle ParaswapSwap special case
    if (variable === 'tokenIn' || variable === 'tokenOut') {
      if ('tokenIn' in mergedArgs && 'tokenOut' in mergedArgs) {
        return tokenConfig[mergedArgs[variable]].address;
      }
    }

    // Handle PullToken and SendToken special case
    if (variable === 'tokenAddress') {
      if ('tokenAddress' in mergedArgs) {
        return mergedArgs.tokenAddress;
      } else if ('token' in mergedArgs && mergedArgs.token && mergedArgs.token in tokenConfig) {
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
  log('Encoding params:', encoding.inputParams);
  log('Encoding values:', encodingValues);
  const inputParams = ethers.AbiCoder.defaultAbiCoder().encode(
    encoding.inputParams,
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
  // If debug is true, execute the action using the debug version
  if (args.debug) {
    return executeActionDebug(args);
  }

  const {
    safeAddress = (await getGlobalSetup()).safe.getAddress(),
    value = actionDefaults[args.type]?.value ?? 0,
    safeOperation = actionDefaults[args.type]?.safeOperation ?? 0,
    signer = (await getGlobalSetup()).signer,
    safeTxGas = actionDefaults[args.type]?.safeTxGas ?? 0,
    gasPrice = actionDefaults[args.type]?.gasPrice ?? 0,
    baseGas = actionDefaults[args.type]?.baseGas ?? 0,
  } = args;

  const actionContract = getDeployedContract(args.type);
  if (!actionContract) {
    throw new Error(`Contract ${args.type} not deployed`);
  }

  const payload = await encodeAction(args);

  const safe = await getGlobalSetup().safe;
  const signature =
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32'],
      [await signer.getAddress(), ethers.ZeroHash]
    ) + '01';

  // // execute the action
  return executeSafeTransaction(
    await Promise.resolve(safeAddress),
    actionContract.address,
    value,
    payload,
    safeOperation,
    signer,
    {
      safeTxGas,
      gasPrice,
      baseGas,
    }
  );
}

export async function executeSequence(
  safeAddr: string,
  sequence: SequenceExecutor.SequenceStruct,
  debug?: boolean,
  safeTxGas?: number,
  gasPrice?: number,
  baseGas?: number
): Promise<TransactionResponse> {
  if (debug) {
    return executeSequenceDebug(safeAddr, sequence, safeTxGas, gasPrice, baseGas);
  }

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
  return executeSafeTransaction(safeAddr, sequenceExecutorAddress, 0, payload, 1, signer, {
    safeTxGas,
    gasPrice,
    baseGas,
  });
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

// Helper function to deploy SequenceExecutorDebug if we need it
async function getSequenceExecutorDebug(): Promise<SequenceExecutorDebug> {
  const deployedContract = getDeployedContract('SequenceExecutorDebug');
  if (deployedContract) {
    return deployedContract.contract as SequenceExecutorDebug;
  }

  const globalSetup = getGlobalSetup();
  const adminVaultAddress = await globalSetup.adminVault.getAddress();
  const sequenceExecutorDebug = await deploy<SequenceExecutorDebug>(
    'SequenceExecutorDebug',
    globalSetup.signer,
    adminVaultAddress
  );
  return sequenceExecutorDebug;
}

// Debug version of executeAction
// We need to convert it to a sequence in order to run it through the debug executor
async function executeActionDebug(args: ActionArgs): Promise<TransactionResponse> {
  const globalSetup = getGlobalSetup();
  const safeAddress = await globalSetup.safe.getAddress();
  const actionContract = getDeployedContract(args.type);
  if (!actionContract) {
    throw new Error(`Contract ${args.type} not deployed`);
  }

  const sequenceExecutorDebug = await getSequenceExecutorDebug();
  const payload = await encodeAction(args);

  // Ensure actionIds is properly formatted as bytes4
  const actionId = getBytes4(actionContract.address);

  const sequence: SequenceExecutor.SequenceStruct = {
    name: `Debug_${args.type}`,
    callData: [payload],
    actionIds: [actionId],
  };

  log('Executing debug action:', args.type);
  log('Action contract:', actionContract.address);
  log('Action ID:', actionId);
  log('Encoded payload:', payload);

  return executeSequenceDebug(safeAddress, sequence, args.safeTxGas, args.gasPrice, args.baseGas);
}

// Debug version of executeSequence
async function executeSequenceDebug(
  safeAddr: string,
  sequence: SequenceExecutor.SequenceStruct,
  safeTxGas?: number,
  gasPrice?: number,
  baseGas?: number
): Promise<TransactionResponse> {
  const sequenceExecutorDebug = await getSequenceExecutorDebug();
  const signer = (await getGlobalSetup()).signer;

  log('Executing debug sequence');

  const payload = sequenceExecutorDebug.interface.encodeFunctionData('executeSequence', [sequence]);

  return executeSafeTransaction(
    safeAddr,
    await sequenceExecutorDebug.getAddress(),
    0,
    payload,
    1,
    signer,
    { safeTxGas, gasPrice, baseGas }
  );
}

/**
 * Gets a descriptive name for a token based on its address by looking it up in the tokenConfig
 * @param address The token address to look up
 * @returns The token name from tokenConfig, or the address if not found
 */
export function getTokenNameFromAddress(address: string): string {
  return (
    Object.entries(tokenConfig).find(
      ([_, config]) => config.address.toLowerCase() === address.toLowerCase()
    )?.[0] ?? address
  );
}

/**
 * Approve KYC for Maple lenders by impersonating the admin and calling setLenderBitmaps.
 * @param addressesToApprove Array of addresses to approve as KYC'd lenders
 */
export async function approveMapleKYC(addressesToApprove: string[]) {
  const MAPLE_KYC_CONTRACT = '0xBe10aDcE8B6E3E02Db384E7FaDA5395DD113D8b3';
  const ADMIN_ADDRESS = '0x54b130c704919320E17F4F1Ffa4832A91AB29Dca';
  const allBitsSet = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  // Impersonate the admin
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [ADMIN_ADDRESS],
  });
  const adminSigner = await ethers.getSigner(ADMIN_ADDRESS);

  // Create the interface for the function
  const iface = new ethers.Interface([
    'function setLenderBitmaps(address[] lenders_,uint256[] bitmaps_)'
  ]);

  // Encode the function call data
  const data = iface.encodeFunctionData('setLenderBitmaps', [
    addressesToApprove,
    addressesToApprove.map(() => allBitsSet)
  ]);

  // Send the transaction
  await adminSigner.sendTransaction({
    to: MAPLE_KYC_CONTRACT,
    data: data,
  });

  // Stop impersonating
  await network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [ADMIN_ADDRESS],
  });
}

/**
 * Process a Maple withdrawal by impersonating the poolDelegate and calling processRedemptions.
 * @param poolAddress The address of the Maple pool
 * @param sharesToProcess The number of shares to process
 */
export async function processMapleWithdrawal(poolAddress: string, sharesToProcess: bigint) {
  // Get the pool contract
  const pool = await ethers.getContractAt('IMaplePool', poolAddress);
  // Get the pool manager address
  const poolManagerAddress = await pool.manager();
  // Get the pool manager contract
  const poolManager = await ethers.getContractAt('IMaplePoolManager', poolManagerAddress);
  // Get the poolDelegate address
  const poolDelegate = await poolManager.poolDelegate();
  // Get the withdrawal manager address
  const withdrawalManagerAddress = await poolManager.withdrawalManager();
  // Get the withdrawal manager contract
  const withdrawalManager = await ethers.getContractAt('IMapleWithdrawalManagerQueue', withdrawalManagerAddress);

  // Impersonate the poolDelegate
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [poolDelegate],
  });
  const delegateSigner = await ethers.getSigner(poolDelegate);

  // Get the queue state
  let [nextRequestId, lastRequestId] = await withdrawalManager.queue();
  nextRequestId = BigInt(nextRequestId);
  lastRequestId = BigInt(lastRequestId);

  // Process the queue
  while (nextRequestId <= lastRequestId) {
    const [owner, shares] = await withdrawalManager.requests(nextRequestId);
    if (shares > 0n) {
      try {
        await withdrawalManager.connect(delegateSigner).processRedemptions(shares);
      } catch (err) {
        break;
      }
    }
    [nextRequestId, lastRequestId] = await withdrawalManager.queue();
    nextRequestId = BigInt(nextRequestId);
    lastRequestId = BigInt(lastRequestId);
  }

  // Stop impersonating
  await network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [poolDelegate],
  });
}
