import { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { constants, utils } from '../tests';
import { getBytes4 } from '../tests/utils';
import { run, tenderly } from 'hardhat';

// Addresses configuration - update these with your contract addresses
const CONFIG = {
  // Current production contracts (change these to match your environment)
  CURRENT: {
    // Core contracts
    ADMIN_VAULT: process.env.CURRENT_ADMIN_VAULT || '0x...', // Current AdminVault address
    LOGGER: process.env.CURRENT_LOGGER || '0x...', // Current Logger address
    TRANSACTION_REGISTRY: process.env.CURRENT_TRANSACTION_REGISTRY || '0x...', // Current TransactionRegistry address
    
    // Ownership
    MULTISIG: process.env.CURRENT_MULTISIG || '0x...', // The address of your multisig/owner
    
    // Deploy configuration
    DEPLOY_OWNER: process.env.DEPLOY_OWNER || '' // Deploy owner (usually deployer address)
  },
  
  // Use these to store new addresses as they're deployed
  NEW: {
    // Core contracts
    ADMIN_VAULT: '',
    LOGGER: '',
    LOGGER_IMPL: '',
    LOGGER_ADMIN: '',
    TRANSACTION_REGISTRY: '',
    UPGRADE_ACTION_NO_LOG: '',
    
    // Other contracts will be stored as they are deployed
    UTILITY_CONTRACTS: {} as Record<string, string>,
    PROTOCOL_CONTRACTS: {} as Record<string, string>,
    POOLS: {} as Record<string, Record<string, string>>,
    PROTOCOLS: [] as string[]
  },
  
  // Network-specific configuration
  NETWORK: {
    IS_TESTNET: true, // Set to false for production deployment
    ADMIN_VAULT_DELAY: 0 // 24 hours - delay period for AdminVault (in seconds)
  },
  
  // Verification settings
  VERIFICATION: {
    ENABLED: false, // Whether to verify contracts on Etherscan and Tenderly
    RETRY_COUNT: 3, // Number of retries for verification
    DELAY_BETWEEN_RETRIES: 10000, // Delay between retries in milliseconds
    CONTRACTS_TO_VERIFY: [] as {name: string, address: string, constructorArgs: any[]}[] // List of contracts to verify
  }
};

// Helper to save deployment output to a JSON file with option to update incrementally
async function saveDeploymentOutput(outputData: any, incrementalUpdate = false) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]; // Remove milliseconds
  const filenameBase = `logger-upgrade-${CONFIG.NETWORK.IS_TESTNET ? 'testnet' : 'mainnet'}`;
  let filename: string;
  
  if (incrementalUpdate) {
    // Use a fixed filename for incremental updates
    filename = `${filenameBase}-latest.json`;
  } else {
    // Use timestamped filename for final/full outputs
    filename = `${filenameBase}-${timestamp}.json`;
  }
  
  const outputPath = path.join(__dirname, '../', filename);
  
  // Optional: Try to read existing file first for incremental updates
  let existingData = {};
  if (incrementalUpdate && fs.existsSync(outputPath)) {
    try {
      const fileContent = fs.readFileSync(outputPath, 'utf8');
      existingData = JSON.parse(fileContent);
      console.log(`Updating existing deployment data in: ${outputPath}`);
    } catch (error) {
      console.error(`Error reading existing deployment file: ${error}`);
      // Continue with a new file if there's an error
    }
  }
  
  // Merge with existing data if doing an incremental update
  const finalData = incrementalUpdate ? 
    { ...existingData, ...outputData, lastUpdated: new Date().toISOString() } : 
    outputData;
  
  fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2));
  console.log(`Deployment data saved to: ${outputPath}`);
  
  return filename;
}

// Add a function to save progress after each major step
async function saveProgressStep(stepName: string, data: any) {
  console.log(`Saving progress after step: ${stepName}`);
  
  const progressData = {
    steps: {
      [stepName]: {
        completed: true,
        timestamp: new Date().toISOString(),
        data
      }
    }
  };
  
  await saveDeploymentOutput(progressData, true);
}

// Verify a contract on Etherscan
async function verifyContractOnEtherscan(name: string, address: string, constructorArgs: any[]) {
  console.log(`Verifying ${name} at ${address} on Etherscan...`);
  
  for (let attempt = 1; attempt <= CONFIG.VERIFICATION.RETRY_COUNT; attempt++) {
    try {
      await run("verify:verify", {
        address: address,
        constructorArguments: constructorArgs
      });
      console.log(`Successfully verified ${name} on Etherscan on attempt ${attempt}`);
      return true;
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log(`Contract ${name} is already verified on Etherscan`);
        return true;
      } else if (attempt === CONFIG.VERIFICATION.RETRY_COUNT) {
        console.error(`Failed to verify ${name} on Etherscan after ${attempt} attempts: ${error.message}`);
        return false;
      } else {
        console.log(`Verification attempt ${attempt} failed, retrying in ${CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES/1000}s...`);
        await new Promise(r => setTimeout(r, CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES));
      }
    }
  }
  return false;
}

// Verify a contract on Tenderly
async function verifyContractOnTenderly(name: string, address: string) {
  console.log(`Verifying ${name} at ${address} on Tenderly...`);
  
  for (let attempt = 1; attempt <= CONFIG.VERIFICATION.RETRY_COUNT; attempt++) {
    try {
      await tenderly.verify({
        name: name,
        address: address,
      });
      console.log(`Successfully verified ${name} on Tenderly on attempt ${attempt}`);
      return true;
    } catch (error: any) {
      if (attempt === CONFIG.VERIFICATION.RETRY_COUNT) {
        console.error(`Failed to verify ${name} on Tenderly after ${attempt} attempts: ${error}`);
        return false;
      } else {
        console.log(`Verification attempt ${attempt} failed, retrying in ${CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES/1000}s...`);
        await new Promise(r => setTimeout(r, CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES));
      }
    }
  }
  return false;
}

// Verify a contract on both platforms
async function verifyContract(name: string, address: string, constructorArgs: any[]) {
  if (!CONFIG.VERIFICATION.ENABLED) {
    console.log(`Verification disabled, skipping verification for ${name}`);
    return;
  }
  
  console.log(`Verifying ${name} at ${address}...`);
  
  const etherscanResult = await verifyContractOnEtherscan(name, address, constructorArgs);
  const tenderlyResult = await verifyContractOnTenderly(name, address);
  
  if (etherscanResult && tenderlyResult) {
    console.log(`Successfully verified ${name} on both platforms`);
  } else if (etherscanResult) {
    console.log(`Successfully verified ${name} on Etherscan only`);
  } else if (tenderlyResult) {
    console.log(`Successfully verified ${name} on Tenderly only`);
  } else {
    console.log(`Failed to verify ${name} on both platforms`);
  }
  
  // Add to list of verified contracts
  CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY = CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.filter(c => c.address !== address);
}

// Queue a contract for verification later (for contracts that need time before verification)
function queueContractForVerification(name: string, address: string, constructorArgs: any[]) {
  console.log(`Queuing ${name} at ${address} for verification later`);
  CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.push({
    name,
    address,
    constructorArgs
  });
}

// Verify all queued contracts
async function verifyQueuedContracts() {
  if (!CONFIG.VERIFICATION.ENABLED || CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length === 0) {
    console.log('No contracts queued for verification, skipping');
    return;
  }
  
  console.log(`Verifying ${CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length} queued contracts...`);
  
  for (const contract of [...CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY]) {
    await verifyContract(contract.name, contract.address, contract.constructorArgs);
  }
  
  console.log('Finished verifying all queued contracts');
}

// STEP 1: Deploy UpgradeActionNoLog that doesn't use Logger.logActionEvent
async function deployUpgradeActionNoLog(deployer: any) {
  console.log('STEP 1: Deploying UpgradeActionNoLog');
  
  const UpgradeActionNoLog = await ethers.getContractFactory('UpgradeActionNoLog', deployer);
  
  console.log('Deploying UpgradeActionNoLog...');
  const upgradeActionNoLog = await UpgradeActionNoLog.deploy(
    CONFIG.CURRENT.ADMIN_VAULT,
    CONFIG.CURRENT.LOGGER,
    CONFIG.CURRENT.TRANSACTION_REGISTRY
  );
  
  await upgradeActionNoLog.waitForDeployment();
  const upgradeActionNoLogAddress = await upgradeActionNoLog.getAddress();
  
  console.log(`UpgradeActionNoLog deployed to: ${upgradeActionNoLogAddress}`);
  CONFIG.NEW.UPGRADE_ACTION_NO_LOG = upgradeActionNoLogAddress;
  
  // Verify the contract
  await verifyContract('UpgradeActionNoLog', upgradeActionNoLogAddress, [
    CONFIG.CURRENT.ADMIN_VAULT,
    CONFIG.CURRENT.LOGGER,
    CONFIG.CURRENT.TRANSACTION_REGISTRY
  ]);
  
  return upgradeActionNoLogAddress;
}

// STEP 2: Add the new UpgradeActionNoLog to the admin vault
async function addUpgradeActionToAdminVault(deployer: any) {
  console.log('STEP 2: Adding UpgradeActionNoLog to AdminVault');
  
  if (CONFIG.NETWORK.IS_TESTNET) {
    // For testnet, we just call the AdminVault directly
    const adminVault = await ethers.getContractAt('AdminVault', CONFIG.CURRENT.ADMIN_VAULT, deployer);
    
    console.log('Proposing UpgradeActionNoLog to AdminVault...');
    const upgradeActionSignature = getBytes4(CONFIG.NEW.UPGRADE_ACTION_NO_LOG);
    await adminVault.proposeAction(upgradeActionSignature, CONFIG.NEW.UPGRADE_ACTION_NO_LOG);
    
    console.log('Adding UpgradeActionNoLog to AdminVault...');
    await adminVault.addAction(upgradeActionSignature, CONFIG.NEW.UPGRADE_ACTION_NO_LOG);
    
    console.log('UpgradeActionNoLog added to AdminVault');
  } else {
    // For production, we'd need the multisig to perform these actions
    console.log('For production deployment:');
    console.log('1. Call AdminVault.proposeAction with:');
    console.log(`   - actionSignature: ${getBytes4(CONFIG.NEW.UPGRADE_ACTION_NO_LOG)}`);
    console.log(`   - actionAddress: ${CONFIG.NEW.UPGRADE_ACTION_NO_LOG}`);
    console.log('2. After delay, call AdminVault.addAction with the same parameters');
    console.log('Please coordinate with multisig owners to execute these transactions');
  }
}

// STEP 3: Deploy the new Logger V2 with proper upgradeable proxy
async function deployLoggerV2(deployer: any) {
  console.log('STEP 3: Deploying new Logger V2');
  
  // Deploy Logger as upgradeable
  const Logger = await ethers.getContractFactory('Logger', deployer);
  
  console.log('Deploying Logger V2...');
  const logger = await upgrades.deployProxy(Logger, [], {
    initializer: 'initialize',
    kind: 'transparent',
  });
  
  await logger.waitForDeployment();
  const loggerAddress = await logger.getAddress();
  
  console.log('Logger V2 proxy deployed to:', loggerAddress);
  CONFIG.NEW.LOGGER = loggerAddress;
  
  // Get the implementation and admin addresses
  const implAddress = await upgrades.erc1967.getImplementationAddress(loggerAddress);
  const adminAddress = await upgrades.erc1967.getAdminAddress(loggerAddress);
  
  console.log('Logger implementation address:', implAddress);
  console.log('Logger admin address:', adminAddress);
  
  CONFIG.NEW.LOGGER_IMPL = implAddress;
  CONFIG.NEW.LOGGER_ADMIN = adminAddress;
  
  // Queue implementation contract for verification
  // Note: We don't use constructor args for the implementation as they're handled by the initializer
  queueContractForVerification('Logger (Implementation)', implAddress, []);
  
  return {
    proxy: loggerAddress,
    implementation: implAddress,
    admin: adminAddress
  };
}

// STEP 4: Deploy new AdminVault with the new Logger - explicitly make deployer the owner for easier setup
async function deployNewAdminVault(deployer: any) {
  console.log('STEP 4: Deploying new AdminVault with new Logger');
  
  const AdminVault = await ethers.getContractFactory('AdminVault', deployer);
  const deployerAddress = await deployer.getAddress();
  
  console.log(`Deploying AdminVault with deployer ${deployerAddress} as initial owner...`);
  console.log(`Delay period: ${CONFIG.NETWORK.ADMIN_VAULT_DELAY} seconds`);
  
  const adminVault = await AdminVault.deploy(
    deployerAddress, // Initial owner - explicitly the deployer for easier setup
    CONFIG.NETWORK.ADMIN_VAULT_DELAY, // Delay period
    CONFIG.NEW.LOGGER // New Logger address
  );
  
  await adminVault.waitForDeployment();
  const adminVaultAddress = await adminVault.getAddress();
  
  console.log(`AdminVault deployed to: ${adminVaultAddress}`);
  CONFIG.NEW.ADMIN_VAULT = adminVaultAddress;
  
  // Verify the contract
  await verifyContract('AdminVault', adminVaultAddress, [
    deployerAddress,
    CONFIG.NETWORK.ADMIN_VAULT_DELAY,
    CONFIG.NEW.LOGGER
  ]);
  
  return adminVaultAddress;
}

// Unified function to deploy all action contracts
async function deployActionContracts(deployer: any) {
  console.log('Deploying all action contracts...');
  
  const contracts: any = {
    utility: {},
    protocol: {}
  };
  
  // === Group contracts by their constructor parameter patterns ===
  
  // 1. Standard contracts with just adminVault and logger
  const standardContracts: Record<string, string[]> = {
    // Utility contracts
    utility: [
      'PullToken',
      'SendToken',
      'BuyCover',
    ],
    
    // Protocol contracts
    protocol: [
      // Morpho contracts
      'MorphoSupply', 'MorphoWithdraw',
      // Clearpool contracts
      'ClearpoolV1Supply', 'ClearpoolV1Withdraw',
      // Fluid contracts
      'FluidV1Supply', 'FluidV1Withdraw',
      // Spark contracts
      'SparkSupply', 'SparkWithdraw',
      // Strike contracts
      'StrikeSupply', 'StrikeWithdraw',
      // Yearn contracts
      'YearnSupply', 'YearnWithdraw',
      // Yearn V3 contracts
      'YearnV3Supply', 'YearnV3Withdraw',
      // Vesper contracts
      'VesperV1Supply', 'VesperV1Withdraw',
      // Euler contracts
      'EulerV2Supply', 'EulerV2Withdraw',
      // Gearbox contracts
      'GearboxPassiveV3Supply', 'GearboxPassiveV3Withdraw',
      // Curve Savings contracts
      'CurveSavingsSupply', 'CurveSavingsWithdraw',
      // ERC4626 contracts
      'ERC4626Supply', 'ERC4626Withdraw',
      // Notional contracts
      'NotionalSupply', 'NotionalWithdraw',
      // CompoundV2 contracts
      'CompoundV2Supply', 'CompoundV2Withdraw',
      // ShareBased contract
      'ShareBasedWithdraw',
      // Swap
      'ParaswapSwap',
      // Maple contracts
      'MapleSupply', 'MapleWithdrawQueue'
    ]
  };
  
  // 2. Contracts with pool parameter
  const poolContracts: Record<string, any[]> = {
    // No utility contracts with pool parameters
    utility: [],
    
    // Protocol contracts with pool parameters
    protocol: [
      // Contract name, pool constant name, actual constant value
      ['AaveV2Supply', 'AAVE_V2_POOL', constants.AAVE_V2_POOL],
      ['AaveV2Withdraw', 'AAVE_V2_POOL', constants.AAVE_V2_POOL],
      ['AaveV3Supply', 'AAVE_V3_POOL', constants.AAVE_V3_POOL],
      ['AaveV3Withdraw', 'AAVE_V3_POOL', constants.AAVE_V3_POOL],
      ['AcrossV3Supply', 'ACROSS_HUB', constants.ACROSS_HUB],
      ['AcrossV3Withdraw', 'ACROSS_HUB', constants.ACROSS_HUB],
      ['BendDaoSupply', 'BEND_DAO_V1_POOL', constants.BEND_DAO_V1_POOL],
      ['BendDaoWithdraw', 'BEND_DAO_V1_POOL', constants.BEND_DAO_V1_POOL],
      ['UwULendSupply', 'UWU_LEND_POOL', constants.UWU_LEND_POOL],
      ['UwULendWithdraw', 'UWU_LEND_POOL', constants.UWU_LEND_POOL]
    ]
  };
  
  // 3. Specialized contracts with unique parameters
  const specializedContracts: Record<string, {name: string, params: any[]}[]> = {
    utility: [],
    protocol: [] // No specialized protocol contracts at first
  };
  
  // First, deploy and register TransactionRegistry
  console.log('Deploying TransactionRegistry...');
  const TransactionRegistry = await ethers.getContractFactory('TransactionRegistry', deployer);
  const transactionRegistry = await TransactionRegistry.deploy(
    CONFIG.NEW.ADMIN_VAULT,  // AdminVault address
    CONFIG.NEW.LOGGER        // Logger address
  );
  await transactionRegistry.waitForDeployment();
  const registryAddress = await transactionRegistry.getAddress();
  
  console.log(`TransactionRegistry deployed to: ${registryAddress}`);
  CONFIG.NEW.TRANSACTION_REGISTRY = registryAddress;
  contracts.utility.transactionregistry = registryAddress;
  
  // Verify the TransactionRegistry
  await verifyContract('TransactionRegistry', registryAddress, [
    CONFIG.NEW.ADMIN_VAULT,
    CONFIG.NEW.LOGGER
  ]);
  
  // Now add the specialized contracts that need the transaction registry
  specializedContracts.utility = [
    {
      name: 'UpgradeAction',
      params: [CONFIG.NEW.ADMIN_VAULT, CONFIG.NEW.LOGGER, registryAddress]
    },
    {
      name: 'Curve3PoolSwap',
      params: [CONFIG.NEW.ADMIN_VAULT, CONFIG.NEW.LOGGER, constants.CURVE_3POOL_ADDRESS]
    }
  ];
  
  // Deploy standard contracts with both categories
  for (const category of ['utility', 'protocol'] as const) {
    console.log(`Deploying standard ${category} contracts...`);
    for (const contractName of standardContracts[category]) {
      contracts[category][contractName.toLowerCase()] = await deployContract(
        contractName,
        deployer,
        CONFIG.NEW.ADMIN_VAULT,
        CONFIG.NEW.LOGGER
      );
    }
  }
  
  // Deploy pool-based contracts with both categories
  for (const category of ['utility', 'protocol'] as const) {
    if (poolContracts[category].length > 0) {
      console.log(`Deploying pool-based ${category} contracts...`);
      for (const [contractName, _, poolValue] of poolContracts[category]) {
        contracts[category][contractName.toLowerCase()] = await deployContract(
          contractName,
          deployer,
          CONFIG.NEW.ADMIN_VAULT,
          CONFIG.NEW.LOGGER,
          poolValue
        );
      }
    }
  }
  
  // Deploy specialized contracts with both categories
  for (const category of ['utility', 'protocol'] as const) {
    if (specializedContracts[category].length > 0) {
      console.log(`Deploying specialized ${category} contracts...`);
      for (const contract of specializedContracts[category]) {
        contracts[category][contract.name.toLowerCase()] = await deployContract(
          contract.name,
          deployer,
          ...contract.params
        );
      }
    }
  }
  
  return contracts;
}

// STEP 7: Add all contracts to AdminVault using Multicall
async function addContractsToAdminVault(deployer: any, contracts: any) {
  console.log('STEP 7: Adding contracts to AdminVault using Multicall');
  
  const adminVault = await ethers.getContractAt('AdminVault', CONFIG.NEW.ADMIN_VAULT, deployer);
  const flattenedContracts: [string, string][] = [];
  
  // Flatten the contracts object and prepare for adding to AdminVault
  for (const [key, value] of Object.entries(contracts)) {
    if (typeof value === 'string') {
      flattenedContracts.push([key, value]);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested contract objects
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (typeof nestedValue === 'string') {
          flattenedContracts.push([`${key}.${nestedKey}`, nestedValue]);
        }
      }
    }
  }
  
  console.log(`Adding ${flattenedContracts.length} contracts to AdminVault via Multicall...`);
  
  // Prepare array of calldata for proposeAction
  console.log('Preparing proposeAction multicall data...');
  const proposeCalldata = flattenedContracts.map(([name, address]) => {
    const signature = getBytes4(address);
    console.log(`Preparing to propose ${name} (${address.substring(0, 10)}...)`);
    // Return the encoded function data for proposeAction
    return adminVault.interface.encodeFunctionData('proposeAction', [signature, address]);
  });
  
  // Execute the propose multicall
  console.log(`Executing multicall with ${proposeCalldata.length} proposeAction calls...`);
  const proposeTx = await adminVault.multicall(proposeCalldata);
  await proposeTx.wait();
  console.log('All actions proposed successfully');
  
  // Prepare array of calldata for addAction
  console.log('Preparing addAction multicall data...');
  const addCalldata = flattenedContracts.map(([name, address]) => {
    const signature = getBytes4(address);
    console.log(`Preparing to add ${name} (${address.substring(0, 10)}...)`);
    // Return the encoded function data for addAction
    return adminVault.interface.encodeFunctionData('addAction', [signature, address]);
  });
  
  // Execute the add multicall
  console.log(`Executing multicall with ${addCalldata.length} addAction calls...`);
  const addTx = await adminVault.multicall(addCalldata);
  await addTx.wait();
  console.log('All actions added successfully');
  
  console.log('All contracts processed');
}

// STEP 7B: Add all pools from tokenConfig to the AdminVault that exist in current AdminVault
async function addPoolsToAdminVault(deployer: any) {
  console.log('STEP 7B: Adding pools from tokenConfig to AdminVault (matching current AdminVault)');
  
  // Get both AdminVault instances
  const currentAdminVault = await ethers.getContractAt('AdminVault', CONFIG.CURRENT.ADMIN_VAULT, deployer);
  const newAdminVault = await ethers.getContractAt('AdminVault', CONFIG.NEW.ADMIN_VAULT, deployer);
  
  // Import constants to get access to tokenConfig
  const { tokenConfig } = require('../tests/constants');
  
  // Map to track which protocol each token belongs to
  const protocolMapping: { [key: string]: string } = {
    // AAVE Pools
    'AAVE_V2_aDAI': 'AaveV2',
    'AAVE_V2_aUSDC': 'AaveV2',
    'AAVE_V2_aUSDT': 'AaveV2',
    'AAVE_V3_aDAI': 'AaveV3',
    'AAVE_V3_aUSDC': 'AaveV3',
    'AAVE_V3_aUSDT': 'AaveV3',
    
    // Fluid Pools
    'FLUID_V1_USDC': 'FluidV1',
    'FLUID_V1_USDT': 'FluidV1',
    'FLUID_V1_GHO': 'FluidV1',
    
    // Yearn Pools
    'YEARN_V2_USDC': 'YearnV2',
    'YEARN_V2_USDT': 'YearnV2',
    'YEARN_V2_DAI': 'YearnV2',
    'YEARN_V3_DAI': 'YearnV3',
    'YEARN_V3_AJNA_DAI': 'YearnV3',
    'YEARN_V3_USDS': 'YearnV3',
    'YEARN_V3_SKY_USDS': 'YearnV3',
    
    // Vesper Pools
    'VESPER_V1_USDC': 'VesperV1',
    
    // Strike Pools
    'STRIKE_V1_USDC': 'StrikeV1',
    'STRIKE_V1_USDT': 'StrikeV1',
    
    // Clearpool Pools
    'CLEARPOOL_V1_ALP_USDC': 'ClearpoolV1',
    'CLEARPOOL_V1_AUR_USDC': 'ClearpoolV1',
    
    // UwU Lend Pools
    'UWU_V1_DAI': 'UwULend',
    'UWU_V1_USDT': 'UwULend',
    
    // Bend DAO Pools
    'BEND_V1_USDT': 'BendDao',
    
    // Spark Pools
    'SPARK_V1_DAI': 'Spark',
    'SPARK_V1_USDS': 'Spark',
    
    // Across Pools
    'ACROSS_V3_lpUSDC': 'AcrossV3',
    'ACROSS_V3_lpUSDT': 'AcrossV3',
    'ACROSS_V3_lpDAI': 'AcrossV3',
    
    // Morpho Pools
    'MORPHO_V1_fxUSDC': 'Morpho',
    'MORPHO_V1_USUALUSDC': 'Morpho',
    'MORPHO_V1_gtUSDCcore': 'Morpho',
    'MORPHO_V1_re7USDT': 'Morpho',
    'MORPHO_V1_reUSDC': 'Morpho',
    'MORPHO_V1_steakUSDT': 'Morpho',
    'MORPHO_V1_steakUSDC': 'Morpho',
    'MORPHO_V1_gtUSDC': 'Morpho',
    'MORPHO_V1_gtUSDT': 'Morpho',
    'MORPHO_V1_smokehouseUSDC': 'Morpho',
    'MORPHO_V1_gtDAIcore': 'Morpho',
    'MORPHO_V1_coinshiftUSDC': 'Morpho',
    'MORPHO_V1_steakhouseUSDC_RWA': 'Morpho',
    'MORPHO_V1_9S_MountDenali_USDC': 'Morpho',
    'MORPHO_V1_9Summits_USDC': 'Morpho',
    'MORPHO_V1_smokehouseUSDT': 'Morpho',
    'MORPHO_V1_flagshipUSDT': 'Morpho',
    'MORPHO_V1_steakhouserUSD': 'Morpho',
    'MORPHO_V1_steakhousePYUSD': 'Morpho',
    'MORPHO_V1_coinshiftUSDL': 'Morpho',
    
    // Euler Pools
    'EULER_V2_PRIME_USDC': 'EulerV2',
    'EULER_V2_YIELD_USDC': 'EulerV2',
    'EULER_V2_YIELD_USDT': 'EulerV2',
    'EULER_V2_YIELD_USDE': 'EulerV2',
    'EULER_V2_MAXI_USDC': 'EulerV2',
    'EULER_V2_RESOLV_USDC': 'EulerV2',
    
    // Gearbox Pools
    'GEARBOX_PASSIVE_V3_USDC': 'GearboxPassiveV3',
    'GEARBOX_PASSIVE_V3_DAI': 'GearboxPassiveV3',
    'GEARBOX_PASSIVE_V3_K3_USDT': 'GearboxPassiveV3',
    'GEARBOX_PASSIVE_V3_CHAOS_GHO': 'GearboxPassiveV3',
    
    // Curve Savings Pools
    'CURVE_SAVINGS_scrvUSD': 'CurveSavings',
    'CURVE_SAVINGS_cvcrvUSD': 'CurveSavings',
    
    // Notional Pools
    'NOTIONAL_V3_USDC': 'Notional',
    
    // Maple Pools
    'MAPLE_V1_HY_USDC': 'Maple',
    'MAPLE_V1_BC_USDC': 'Maple',
    'MAPLE_V1_HY_SEC_USDC': 'Maple',
    
    // Standard ERC20 tokens that might be used directly
    'USDC': 'ERC4626',
    'USDT': 'ERC4626',
    'DAI': 'ERC4626',
    'GHO': 'ERC4626',
    'USDS': 'ERC4626',
    'WETH': 'ERC4626',
    'rUSD': 'ERC4626',
    'PYUSD': 'ERC4626',
    'wUSDL': 'ERC4626',
    'crvUSD': 'ERC4626'
  };
  
  // Helper function to get poolId from address
  function poolIdFromAddress(addr: string): string {
    return ethers.keccak256(ethers.solidityPacked(['address'], [addr])).substring(0, 10);
  }
  
  // Collect all potential pools to check
  const potentialPools: { protocol: string, tokenName: string, address: string }[] = [];
  
  // Process tokenConfig to build a list of potential pools
  for (const [tokenName, tokenData] of Object.entries(tokenConfig)) {
    if (!protocolMapping[tokenName]) {
      console.log(`Warning: No protocol mapping found for token ${tokenName}, skipping`);
      continue;
    }
    
    const protocol = protocolMapping[tokenName];
    // Type assertion for tokenData
    const address = (tokenData as { address: string }).address;
    
    potentialPools.push({
      protocol,
      tokenName,
      address
    });
  }
  
  console.log(`Found ${potentialPools.length} potential pools to check`);
  
  // First determine which protocols exist in the current AdminVault
  // We'll do this by checking at least one pool per protocol
  const existingProtocols = new Set<string>();
  const protocolsToCheck = new Set<string>(potentialPools.map(p => p.protocol));
  
  console.log(`Found ${protocolsToCheck.size} unique protocols to check`);
  
  // For each protocol, find sample pools to check existence
  for (const protocol of protocolsToCheck) {
    console.log(`Checking if protocol '${protocol}' exists in current AdminVault...`);
    
    // Get sample pool for this protocol
    const samplePools = potentialPools.filter(p => p.protocol === protocol);
    
    // Try each sample pool until we find one that exists, confirming the protocol exists
    let protocolExists = false;
    for (const pool of samplePools) {
      try {
        const poolId = poolIdFromAddress(pool.address);
        await currentAdminVault.getPoolAddress(protocol, poolId);
        
        // If we get here, the protocol exists
        protocolExists = true;
        console.log(`Protocol '${protocol}' exists in current AdminVault, confirmed via pool ${pool.tokenName}`);
        break;
      } catch (error) {
        // This specific pool doesn't exist, try another one
        continue;
      }
    }
    
    if (protocolExists) {
      existingProtocols.add(protocol);
    } else {
      console.log(`Protocol '${protocol}' not found in current AdminVault, skipping`);
    }
  }
  
  console.log(`Found ${existingProtocols.size} existing protocols in current AdminVault`);
  
  // Now check which pools are already in the current AdminVault, but only for protocols that exist
  const poolsToAdd: { protocol: string, tokenName: string, address: string }[] = [];
  
  console.log('Checking pools in current AdminVault...');
  for (const pool of potentialPools) {
    // Skip if the protocol doesn't exist in current AdminVault
    if (!existingProtocols.has(pool.protocol)) {
      console.log(`Skipping pool ${pool.tokenName} as protocol '${pool.protocol}' is not in current AdminVault`);
      continue;
    }
    
    try {
      // Get the poolId
      const poolId = poolIdFromAddress(pool.address);
      
      // Try to get the pool address from current AdminVault
      // If it doesn't exist, this will throw an error
      await currentAdminVault.getPoolAddress(pool.protocol, poolId);
      
      // If we get here, the pool exists in current AdminVault
      console.log(`Pool ${pool.tokenName} (${pool.address.substring(0, 10)}...) exists in current AdminVault`);
      poolsToAdd.push(pool);
    } catch (error) {
      // Pool doesn't exist in current AdminVault, skip it
      console.log(`Pool ${pool.tokenName} does not exist in current AdminVault, skipping`);
    }
  }
  
  console.log(`Found ${poolsToAdd.length} pools from ${existingProtocols.size} protocols to add to new AdminVault`);
  
  if (poolsToAdd.length === 0) {
    console.log('No pools to add, skipping');
    return 0;
  }
  
  // Prepare and execute multicall for proposePool
  console.log('Preparing proposePool multicall data...');
  const proposeCalldata = poolsToAdd.map(({ protocol, tokenName, address }) => {
    console.log(`Preparing to propose pool ${tokenName} (${address.substring(0, 10)}...) for protocol ${protocol}`);
    return newAdminVault.interface.encodeFunctionData('proposePool', [protocol, address]);
  });
  
  console.log(`Executing multicall with ${proposeCalldata.length} proposePool calls...`);
  const proposeTx = await newAdminVault.multicall(proposeCalldata);
  await proposeTx.wait();
  console.log('All pools proposed successfully');
  
  // Prepare and execute multicall for addPool
  console.log('Preparing addPool multicall data...');
  const addCalldata = poolsToAdd.map(({ protocol, tokenName, address }) => {
    console.log(`Preparing to add pool ${tokenName} (${address.substring(0, 10)}...) for protocol ${protocol}`);
    return newAdminVault.interface.encodeFunctionData('addPool', [protocol, address]);
  });
  
  console.log(`Executing multicall with ${addCalldata.length} addPool calls...`);
  const addTx = await newAdminVault.multicall(addCalldata);
  await addTx.wait();
  console.log('All pools added successfully');
  
  // Save the pools information to CONFIG
  CONFIG.NEW.POOLS = poolsToAdd.reduce((acc, { protocol, tokenName, address }) => {
    if (!acc[protocol]) acc[protocol] = {};
    acc[protocol][tokenName] = address;
    return acc;
  }, {} as any);
  
  // Also save the list of verified protocols
  CONFIG.NEW.PROTOCOLS = Array.from(existingProtocols);
  
  return poolsToAdd.length;
}

// STEP 8: Transfer AdminVault ownership (for production)
async function transferAdminVaultOwnership(deployer: any) {
  console.log('STEP 8: Transferring AdminVault ownership');
  
  const adminVault = await ethers.getContractAt('AdminVault', CONFIG.NEW.ADMIN_VAULT, deployer);
  const deployerAddress = await deployer.getAddress();
  
  // Roles to transfer (from AdminVault.sol)
  const roles = [
    // Main roles
    'OWNER_ROLE', // 0x00...
    'ROLE_MANAGER_ROLE',
    // Operational roles
    'FEE_PROPOSER_ROLE', 'FEE_CANCELER_ROLE', 'FEE_EXECUTOR_ROLE', 
    'POOL_PROPOSER_ROLE', 'POOL_CANCELER_ROLE', 'POOL_EXECUTOR_ROLE', 'POOL_DISPOSER_ROLE',
    'ACTION_PROPOSER_ROLE', 'ACTION_CANCELER_ROLE', 'ACTION_EXECUTOR_ROLE', 'ACTION_DISPOSER_ROLE',
    'FEE_TAKER_ROLE',
    'TRANSACTION_PROPOSER_ROLE', 'TRANSACTION_CANCELER_ROLE', 'TRANSACTION_EXECUTOR_ROLE', 'TRANSACTION_DISPOSER_ROLE'
  ];
  
  if (!CONFIG.NETWORK.IS_TESTNET) {
    console.log('For production deployment:');
    console.log('The following roles need to be granted to the multisig:');
    
    for (const role of roles) {
      console.log(`- ${role}`);
    }
    
    console.log(`Run this command for each role to grant to multisig: ${CONFIG.CURRENT.MULTISIG}`);
    console.log('adminVault.grantRole(ROLE, MULTISIG_ADDRESS)');
  } else {
    console.log(`Granting all roles to multisig: ${CONFIG.CURRENT.MULTISIG}`);
    
    // For testnet, we grant all roles
    const OWNER_ROLE = ethers.ZeroHash; // 0x0000...
    
    // First grant OWNER_ROLE and ROLE_MANAGER_ROLE
    await adminVault.grantRole(OWNER_ROLE, CONFIG.CURRENT.MULTISIG);
    console.log(`Granted OWNER_ROLE to ${CONFIG.CURRENT.MULTISIG}`);
    
    // Get the actual bytes32 values for each role
    const roleManagerRole = await adminVault.ROLE_MANAGER_ROLE();
    
    await adminVault.grantRole(roleManagerRole, CONFIG.CURRENT.MULTISIG);
    console.log(`Granted ROLE_MANAGER_ROLE to ${CONFIG.CURRENT.MULTISIG}`);
    
    console.log(`All critical roles granted to multisig: ${CONFIG.CURRENT.MULTISIG}`);
    console.log('The multisig can now grant other operational roles as needed');
    
    // Log the current roles of the deployer for verification
    console.log(`Verifying deployer ${deployerAddress} still has OWNER_ROLE:`, 
      await adminVault.hasRole(OWNER_ROLE, deployerAddress));
  }
}

// STEP 9: Transfer ProxyAdmin ownership (for production)
async function transferProxyAdminOwnership(deployer: any) {
  console.log('STEP 9: Transferring ProxyAdmin ownership');
  
  if (!CONFIG.NETWORK.IS_TESTNET) {
    console.log('For production deployment:');
    console.log('1. Get the ProxyAdmin contract instance');
    console.log('2. Call transferOwnership with:');
    console.log(`   - newOwner: ${CONFIG.CURRENT.MULTISIG}`);
    console.log('This should be executed by the current owner');
  } else {
    // For testnet, we can transfer the ownership
    try {
      // Get the ProxyAdmin address and transfer ownership
      const proxyAdminAddress = CONFIG.NEW.LOGGER_ADMIN;
      const proxyAdmin = await ethers.getContractAt('ProxyAdmin', proxyAdminAddress, deployer);
      await proxyAdmin.transferOwnership(CONFIG.CURRENT.MULTISIG);
      
      console.log(`ProxyAdmin ownership transferred to ${CONFIG.CURRENT.MULTISIG}`);
    } catch (error) {
      console.error("Error transferring ProxyAdmin ownership:", error);
    }
  }
}

// Helper function to deploy a contract and log its address
async function deployContract(name: string, deployer: any, ...args: any[]) {
  console.log(`Deploying ${name}...`);
  
  const Contract = await ethers.getContractFactory(name, deployer);
  const contract = await Contract.deploy(...args);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log(`${name} deployed to: ${address}`);
  
  // Verify the contract
  await verifyContract(name, address, args);
  
  return address;
}

// Main deployment function
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`Deploying with account: ${deployerAddress}`);
  
  const output: any = {
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    network: {
      name: process.env.HARDHAT_NETWORK || 'unknown',
      chainId: (await ethers.provider.getNetwork()).chainId.toString(),
      isTestnet: CONFIG.NETWORK.IS_TESTNET
    },
    current: { ...CONFIG.CURRENT },
    new: {},
    contracts: { utility: {}, protocol: {} },
    verification: {
      enabled: CONFIG.VERIFICATION.ENABLED,
      results: {}
    }
  };
  
  try {
    // Save initial state
    await saveDeploymentOutput(output, true);
    
    // STEP 1: Deploy UpgradeActionNoLog
    const upgradeActionNoLogAddress = await deployUpgradeActionNoLog(deployer);
    output.new.upgradeActionNoLog = upgradeActionNoLogAddress;
    await saveProgressStep('upgrade_action_no_log_deployed', { address: upgradeActionNoLogAddress });
    
    // STEP 2: Add UpgradeActionNoLog to existing AdminVault
    if (CONFIG.NETWORK.IS_TESTNET) {
      await addUpgradeActionToAdminVault(deployer);
      await saveProgressStep('upgrade_action_added_to_admin_vault', { address: upgradeActionNoLogAddress });
    }
    
    // STEP 3: Deploy Logger V2
    const loggerInfo = await deployLoggerV2(deployer);
    output.new.logger = loggerInfo;
    await saveProgressStep('logger_v2_deployed', loggerInfo);
    
    // STEP 4: Deploy new AdminVault
    const adminVaultAddress = await deployNewAdminVault(deployer);
    output.new.adminVault = adminVaultAddress;
    await saveProgressStep('admin_vault_deployed', { address: adminVaultAddress });
    
    // STEP 5-6: Deploy all action contracts (utility and protocol)
    const actionContracts = await deployActionContracts(deployer);
    output.contracts.utility = actionContracts.utility;
    output.contracts.protocol = actionContracts.protocol;
    CONFIG.NEW.UTILITY_CONTRACTS = actionContracts.utility;
    CONFIG.NEW.PROTOCOL_CONTRACTS = actionContracts.protocol;
    await saveProgressStep('action_contracts_deployed', { 
      utilityCount: Object.keys(actionContracts.utility).length,
      protocolCount: Object.keys(actionContracts.protocol).length
    });
    
    // STEP 7: Add all contracts to AdminVault
    if (CONFIG.NETWORK.IS_TESTNET) {
      await addContractsToAdminVault(deployer, { 
        ...actionContracts.utility,
        ...actionContracts.protocol
      });
      await saveProgressStep('contracts_added_to_admin_vault', {
        count: Object.keys(actionContracts.utility).length + Object.keys(actionContracts.protocol).length
      });
      
      // NEW STEP 7B: Add pools to AdminVault
      const poolsCount = await addPoolsToAdminVault(deployer);
      await saveProgressStep('pools_added_to_admin_vault', { count: poolsCount });
    }
    
    // STEP 8: Transfer AdminVault ownership (for production)
    if (CONFIG.NETWORK.IS_TESTNET) {
      await transferAdminVaultOwnership(deployer);
      await saveProgressStep('admin_vault_ownership_transferred', { 
        from: deployerAddress,
        to: CONFIG.CURRENT.MULTISIG
      });
    }
    
    // STEP 9: Transfer ProxyAdmin ownership (for production)
    if (CONFIG.NETWORK.IS_TESTNET) {
      await transferProxyAdminOwnership(deployer);
      await saveProgressStep('proxy_admin_ownership_transferred', {
        from: deployerAddress,
        to: CONFIG.CURRENT.MULTISIG
      });
    }
    
    // STEP 10: Verify any remaining queued contracts
    if (CONFIG.VERIFICATION.ENABLED && CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length > 0) {
      console.log('Verifying any remaining queued contracts...');
      await verifyQueuedContracts();
      await saveProgressStep('remaining_contracts_verified', {
        count: CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length
      });
    }
    
    // Save the final output
    const outputFile = await saveDeploymentOutput(output);
    console.log(`Deployment complete! Final output saved to: ${outputFile}`);
    
    // Print summary
    console.log('\n==== DEPLOYMENT SUMMARY ====');
    console.log(`UpgradeActionNoLog: ${output.new.upgradeActionNoLog}`);
    console.log(`Logger V2 Proxy: ${output.new.logger.proxy}`);
    console.log(`Logger Implementation: ${output.new.logger.implementation}`);
    console.log(`AdminVault: ${output.new.adminVault}`);
    console.log(`Transaction Registry: ${CONFIG.NEW.TRANSACTION_REGISTRY}`);
    console.log(`Total contracts deployed: ${Object.keys(actionContracts.utility).length + Object.keys(actionContracts.protocol).length + 3}`); // +3 for Logger, AdminVault, TransactionRegistry
    
  } catch (error) {
    console.error('Deployment failed:', error);
    
    // Save partial output in case of error
    output.error = {
      message: (error as Error).message,
      stack: (error as Error).stack
    };
    
    await saveDeploymentOutput(output);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 