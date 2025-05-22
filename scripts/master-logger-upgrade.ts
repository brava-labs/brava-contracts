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
    ADMIN_VAULT: process.env.CURRENT_ADMIN_VAULT || '0x02219F8B9BB7B9853AA110D687EE82e9835A13fB', // Current AdminVault address
    LOGGER: process.env.CURRENT_LOGGER || '0x99A055251170411c4505519aaeC57020B6129BB8', // Current Logger address
    TRANSACTION_REGISTRY: process.env.CURRENT_TRANSACTION_REGISTRY || '', // Current TransactionRegistry address
    
    // Ownership
    MULTISIG: process.env.CURRENT_MULTISIG || '0x44149c547A135ae6eC6e40BF51a272c07e9361F4', // The address of your multisig/owner
    
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
    ETHERSCAN_ENABLED: false, // Whether to verify contracts on Etherscan
    TENDERLY_ENABLED: true, // Whether to verify contracts on Tenderly
    RETRY_COUNT: 3, // Number of retries for verification
    DELAY_BETWEEN_RETRIES: 10000, // Delay between retries in milliseconds
    CONTRACTS_TO_VERIFY: [] as {name: string, address: string, constructorArgs: any[]}[] // List of contracts to verify
  }
};

// Protocol-specific addresses
const PROTOCOL_ADDRESSES = {
  NOTIONAL_ROUTER: '0x6e7058c91F85E0F6db4fc9da2CA41241f5e4263f'
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
  console.log(`📝 Saving progress after step: ${stepName}`);
  
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
  console.log(`  🔍 Verifying ${name} at ${address} on Etherscan...`);
  
  for (let attempt = 1; attempt <= CONFIG.VERIFICATION.RETRY_COUNT; attempt++) {
    try {
      await run("verify:verify", {
        address: address,
        constructorArguments: constructorArgs
      });
      console.log(`  ✅ Successfully verified ${name} on Etherscan on attempt ${attempt}`);
      return true;
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log(`  ℹ️ Contract ${name} is already verified on Etherscan`);
        return true;
      } else if (attempt === CONFIG.VERIFICATION.RETRY_COUNT) {
        console.error(`  ❌ Failed to verify ${name} on Etherscan after ${attempt} attempts: ${error.message}`);
        return false;
      } else {
        console.log(`  ⚠️ Verification attempt ${attempt} failed, retrying in ${CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES/1000}s...`);
        await new Promise(r => setTimeout(r, CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES));
      }
    }
  }
  return false;
}

// Verify a contract on Tenderly
async function verifyContractOnTenderly(name: string, address: string) {
  console.log(`  🔍 Verifying ${name} at ${address} on Tenderly...`);
  
  // Check if it's the Logger implementation and fix the name
  const contractName = name.includes('Logger (Implementation)') ? 'Logger' : name;
  
  // Check for Tenderly environment variables before attempting verification
  if (!process.env.TENDERLY_USERNAME || process.env.TENDERLY_USERNAME.trim() === '') {
    console.error(`  ❌ Tenderly verification requires TENDERLY_USERNAME environment variable`);
    console.log(`  💡 Add TENDERLY_USERNAME to your .env file`);
    return false;
  }

  if (!process.env.TENDERLY_PROJECT || process.env.TENDERLY_PROJECT.trim() === '') {
    console.error(`  ❌ Tenderly verification requires TENDERLY_PROJECT environment variable`);
    console.log(`  💡 Add TENDERLY_PROJECT to your .env file`);
    return false;
  }
  
  console.log(`  ℹ️ Using Tenderly config - Username: ${process.env.TENDERLY_USERNAME}, Project: ${process.env.TENDERLY_PROJECT}`);
  
  for (let attempt = 1; attempt <= CONFIG.VERIFICATION.RETRY_COUNT; attempt++) {
    try {
      // Log detailed Tenderly params for debugging
      console.log(`  ℹ️ Verifying with params: name=${contractName}, address=${address}`);
      
      await tenderly.verify({
        name: contractName,
        address: address,
      });
      console.log(`  ✅ Successfully verified ${contractName} on Tenderly on attempt ${attempt}`);
      return true;
    } catch (error: any) {
      console.error(`  ❌ Tenderly verification error details:`, error);

      if (attempt === CONFIG.VERIFICATION.RETRY_COUNT) {
        console.error(`  ❌ Failed to verify ${contractName} on Tenderly after ${attempt} attempts`);
        
        // Provide more helpful error message with possible solutions
        console.log(`  💡 Troubleshooting tips for Tenderly verification:`);
        console.log(`     - Check that your TENDERLY_USERNAME and TENDERLY_PROJECT are correct`);
        console.log(`     - Ensure you're connected to the internet and have access to Tenderly`);
        console.log(`     - Verify your contract is properly compiled and deployed`);
        console.log(`     - Check if the contract source code matches the deployed bytecode`);
        
        return false;
      } else {
        console.log(`  ⚠️ Verification attempt ${attempt} failed, retrying in ${CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES/1000}s...`);
        await new Promise(r => setTimeout(r, CONFIG.VERIFICATION.DELAY_BETWEEN_RETRIES));
      }
    }
  }
  return false;
}

// Verify a contract on both platforms
async function verifyContract(name: string, address: string, constructorArgs: any[]) {
  if (!CONFIG.VERIFICATION.ETHERSCAN_ENABLED && !CONFIG.VERIFICATION.TENDERLY_ENABLED) {
    console.log(`  ⏩ Verification disabled, skipping verification for ${name}`);
    return;
  }
  
  // Fix Logger implementation name if needed
  const contractName = name.includes('Logger (Implementation)') ? 'Logger' : name;
  
  console.log(`\n🔎 Verifying ${contractName} at ${address}...`);
  let verificationResults = {
    etherscan: false,
    tenderly: false
  };
  
  // Verify on Etherscan if enabled
  if (CONFIG.VERIFICATION.ETHERSCAN_ENABLED) {
    console.log(`  Verifying ${contractName} on Etherscan...`);
    verificationResults.etherscan = await verifyContractOnEtherscan(contractName, address, constructorArgs);
  } else {
    console.log(`  ℹ️ Etherscan verification disabled for ${contractName}`);
  }
  
  // Verify on Tenderly if enabled
  if (CONFIG.VERIFICATION.TENDERLY_ENABLED) {
    console.log(`  Verifying ${contractName} on Tenderly...`);
    verificationResults.tenderly = await verifyContractOnTenderly(contractName, address);
  } else {
    console.log(`  ℹ️ Tenderly verification disabled for ${contractName}`);
  }
  
  // Log verification results
  if (CONFIG.VERIFICATION.ETHERSCAN_ENABLED && CONFIG.VERIFICATION.TENDERLY_ENABLED) {
    if (verificationResults.etherscan && verificationResults.tenderly) {
      console.log(`  ✅ Successfully verified ${contractName} on both platforms`);
    } else if (verificationResults.etherscan) {
      console.log(`  ⚠️ Partially verified: ${contractName} verified on Etherscan only`);
    } else if (verificationResults.tenderly) {
      console.log(`  ⚠️ Partially verified: ${contractName} verified on Tenderly only`);
    } else {
      console.log(`  ❌ Failed to verify ${contractName} on both platforms`);
    }
  } else if (CONFIG.VERIFICATION.ETHERSCAN_ENABLED) {
    if (verificationResults.etherscan) {
      console.log(`  ✅ Successfully verified ${contractName} on Etherscan`);
    } else {
      console.log(`  ❌ Failed to verify ${contractName} on Etherscan`);
    }
  } else if (CONFIG.VERIFICATION.TENDERLY_ENABLED) {
    if (verificationResults.tenderly) {
      console.log(`  ✅ Successfully verified ${contractName} on Tenderly`);
    } else {
      console.log(`  ❌ Failed to verify ${contractName} on Tenderly`);
    }
  }
  
  // Add to list of verified contracts
  CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY = CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.filter(c => c.address !== address);
}

// Queue a contract for verification later (for contracts that need time before verification)
function queueContractForVerification(name: string, address: string, constructorArgs: any[]) {
  // Fix Logger implementation name if needed
  const contractName = name.includes('Logger (Implementation)') ? 'Logger' : name;
  console.log(`  📋 Queuing ${contractName} at ${address} for verification later`);
  
  CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.push({
    name: contractName,
    address,
    constructorArgs
  });
}

// Verify all queued contracts
async function verifyQueuedContracts() {
  if ((!CONFIG.VERIFICATION.ETHERSCAN_ENABLED && !CONFIG.VERIFICATION.TENDERLY_ENABLED) || CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length === 0) {
    console.log('No contracts queued for verification, skipping');
    return;
  }
  
  console.log(`\n📋 Verifying ${CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length} queued contracts...`);
  
  for (const contract of [...CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY]) {
    await verifyContract(contract.name, contract.address, contract.constructorArgs);
  }
  
  console.log('✅ Finished verifying all queued contracts');
}

// STEP 0: Ensure prerequisites are deployed (original contracts if needed)
async function ensurePrerequisites(deployer: any) {
  console.log('\n\n🔍 STEP 0: Ensuring prerequisites are deployed');
  
  // Check if we need to deploy the original Logger
  if (!CONFIG.CURRENT.LOGGER) {
    console.log('Original Logger not found, deploying...');
    const Logger = await ethers.getContractFactory('Logger', deployer);
    const logger = await upgrades.deployProxy(Logger, [], { 
      initializer: 'initialize',
      kind: 'transparent',
    });
    await logger.waitForDeployment();
    CONFIG.CURRENT.LOGGER = await logger.getAddress();
    console.log(`Original Logger deployed to: ${CONFIG.CURRENT.LOGGER}`);
  } else {
    console.log(`Using existing Logger at ${CONFIG.CURRENT.LOGGER}`);
  }
  
  // Check if we need to deploy an AdminVault
  if (!CONFIG.CURRENT.ADMIN_VAULT) {
    console.log('Original AdminVault not found, deploying...');
    const AdminVault = await ethers.getContractFactory('AdminVault', deployer);
    const deployerAddress = await deployer.getAddress();
    
    const adminVault = await AdminVault.deploy(
      deployerAddress, // Owner
      CONFIG.NETWORK.ADMIN_VAULT_DELAY, // Delay
      CONFIG.CURRENT.LOGGER // Logger
    );
    await adminVault.waitForDeployment();
    CONFIG.CURRENT.ADMIN_VAULT = await adminVault.getAddress();
    console.log(`Original AdminVault deployed to: ${CONFIG.CURRENT.ADMIN_VAULT}`);
  } else {
    console.log(`Using existing AdminVault at ${CONFIG.CURRENT.ADMIN_VAULT}`);
  }
  
  // Check if we need to deploy a TransactionRegistry
  if (!CONFIG.CURRENT.TRANSACTION_REGISTRY) {
    console.log('TransactionRegistry not found, deploying...');
    const TransactionRegistry = await ethers.getContractFactory('TransactionRegistry', deployer);
    const txRegistry = await TransactionRegistry.deploy(
      CONFIG.CURRENT.ADMIN_VAULT,
      CONFIG.CURRENT.LOGGER
    );
    await txRegistry.waitForDeployment();
    CONFIG.CURRENT.TRANSACTION_REGISTRY = await txRegistry.getAddress();
    console.log(`TransactionRegistry deployed to: ${CONFIG.CURRENT.TRANSACTION_REGISTRY}`);
  } else {
    console.log(`Using existing TransactionRegistry at ${CONFIG.CURRENT.TRANSACTION_REGISTRY}`);
  }
  
  // Check if we need to deploy the original UpgradeAction
  const UpgradeAction = await ethers.getContractFactory('UpgradeAction', deployer);
  const deployerAddress = await deployer.getAddress();
  
  console.log('Deploying original UpgradeAction...');
  try {
    const upgradeAction = await UpgradeAction.deploy(
      CONFIG.CURRENT.ADMIN_VAULT,
      CONFIG.CURRENT.LOGGER,
      CONFIG.CURRENT.TRANSACTION_REGISTRY
    );
    await upgradeAction.waitForDeployment();
    const upgradeActionAddress = await upgradeAction.getAddress();
    console.log(`Original UpgradeAction deployed to: ${upgradeActionAddress}`);
    
    // Add the UpgradeAction to the AdminVault if we're on testnet
    if (CONFIG.NETWORK.IS_TESTNET) {
      console.log('Adding UpgradeAction to AdminVault...');
      
      try {
        // Setup impersonation of the multisig/owner
        console.log(`Impersonating owner address ${CONFIG.CURRENT.MULTISIG}...`);
        await ethers.provider.send('hardhat_impersonateAccount', [CONFIG.CURRENT.MULTISIG]);
        const impersonatedSigner = await ethers.getSigner(CONFIG.CURRENT.MULTISIG);
        
        // Fund the impersonated signer if needed
        const balance = await ethers.provider.getBalance(CONFIG.CURRENT.MULTISIG);
        if (balance < ethers.parseEther('0.1')) {
          console.log('Funding impersonated account with ETH...');
          await deployer.sendTransaction({
            to: CONFIG.CURRENT.MULTISIG,
            value: ethers.parseEther('1.0')
          });
        }
        
        // Use the impersonated signer to interact with the AdminVault
        const adminVault = await ethers.getContractAt('AdminVault', CONFIG.CURRENT.ADMIN_VAULT, impersonatedSigner);
        const upgradeActionSignature = getBytes4(upgradeActionAddress);
        
        try {
          // Check if the action is already registered
          const actionAddress = await adminVault.getActionAddress(upgradeActionSignature);
          if (actionAddress === upgradeActionAddress) {
            console.log('UpgradeAction already registered in AdminVault');
          }
        } catch (error) {
          // Action not found, register it
          console.log('Proposing UpgradeAction to AdminVault...');
          await adminVault.proposeAction(upgradeActionSignature, upgradeActionAddress);
          
          console.log('Adding UpgradeAction to AdminVault...');
          await adminVault.addAction(upgradeActionSignature, upgradeActionAddress);
          console.log('UpgradeAction successfully added to AdminVault');
        }
        
        // Stop impersonating
        await ethers.provider.send('hardhat_stopImpersonatingAccount', [CONFIG.CURRENT.MULTISIG]);
      } catch (error) {
        console.error('Error while impersonating to add UpgradeAction:', error);
        // Try to stop impersonation in case it was started
        try {
          await ethers.provider.send('hardhat_stopImpersonatingAccount', [CONFIG.CURRENT.MULTISIG]);
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    }
  } catch (error) {
    console.error('Failed to deploy original UpgradeAction, but continuing with migration:', error);
  }
  
  // Check if we have a MULTISIG address, if not, use the deployer
  if (!CONFIG.CURRENT.MULTISIG) {
    CONFIG.CURRENT.MULTISIG = await deployer.getAddress();
    console.log(`Setting MULTISIG to deployer address: ${CONFIG.CURRENT.MULTISIG}`);
  }
  
  // Validate that we have all required addresses
  const requiredAddresses = [
    'ADMIN_VAULT', 'LOGGER', 'TRANSACTION_REGISTRY', 'MULTISIG'
  ] as (keyof typeof CONFIG.CURRENT)[];
  
  const missingAddresses = requiredAddresses.filter(key => !CONFIG.CURRENT[key]);
  if (missingAddresses.length > 0) {
    throw new Error(`Missing required addresses: ${missingAddresses.join(', ')}`);
  }
  
  console.log('✅ All prerequisites are set up correctly');
  return true;
}

// STEP 1: Deploy UpgradeActionNoLog that doesn't use Logger.logActionEvent
async function deployUpgradeActionNoLog(deployer: any) {
  console.log('\n\n🚀 STEP 1: Deploying UpgradeActionNoLog');
  
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
  console.log('\n\n🔧 STEP 2: Adding UpgradeActionNoLog to AdminVault');
  
  if (CONFIG.NETWORK.IS_TESTNET) {
    // For testnet, we need to impersonate the multisig/owner to have sufficient permissions
    console.log(`Impersonating owner address ${CONFIG.CURRENT.MULTISIG} to add UpgradeActionNoLog...`);
    
    try {
      // Setup impersonation
      await ethers.provider.send('hardhat_impersonateAccount', [CONFIG.CURRENT.MULTISIG]);
      const impersonatedSigner = await ethers.getSigner(CONFIG.CURRENT.MULTISIG);
      
      // Fund the impersonated signer if needed (on some testnets this is required)
      const balance = await ethers.provider.getBalance(CONFIG.CURRENT.MULTISIG);
      if (balance < ethers.parseEther('0.1')) {
        console.log('Funding impersonated account with ETH...');
        await deployer.sendTransaction({
          to: CONFIG.CURRENT.MULTISIG,
          value: ethers.parseEther('1.0')
        });
      }
      
      // Use the impersonated signer to interact with the AdminVault
      const adminVault = await ethers.getContractAt('AdminVault', CONFIG.CURRENT.ADMIN_VAULT, impersonatedSigner);
      
      console.log('Proposing UpgradeActionNoLog to AdminVault...');
      const upgradeActionSignature = getBytes4(CONFIG.NEW.UPGRADE_ACTION_NO_LOG);
      await adminVault.proposeAction(upgradeActionSignature, CONFIG.NEW.UPGRADE_ACTION_NO_LOG);
      
      console.log('Adding UpgradeActionNoLog to AdminVault...');
      await adminVault.addAction(upgradeActionSignature, CONFIG.NEW.UPGRADE_ACTION_NO_LOG);
      
      console.log('UpgradeActionNoLog added to AdminVault');
      
      // Stop impersonating
      await ethers.provider.send('hardhat_stopImpersonatingAccount', [CONFIG.CURRENT.MULTISIG]);
    } catch (error) {
      console.error('Error during impersonation:', error);
      
      // Check if impersonation is supported on this network
      console.log('Impersonation might not be supported on this network.');
      console.log('For production deployment:');
      console.log('1. Call AdminVault.proposeAction with:');
      console.log(`   - actionSignature: ${getBytes4(CONFIG.NEW.UPGRADE_ACTION_NO_LOG)}`);
      console.log(`   - actionAddress: ${CONFIG.NEW.UPGRADE_ACTION_NO_LOG}`);
      console.log('2. After delay, call AdminVault.addAction with the same parameters');
      console.log('Please coordinate with multisig owners to execute these transactions');
      
      // Stop impersonating in case it was started
      try {
        await ethers.provider.send('hardhat_stopImpersonatingAccount', [CONFIG.CURRENT.MULTISIG]);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
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
  console.log('\n\n📝 STEP 3: Deploying new Logger V2');
  
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
  console.log('\n\n🏛️ STEP 4: Deploying new AdminVault with new Logger');
  
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
  console.log('\n\n🔨 STEP 5: Deploying action contracts...');
  
  const contracts: any = {
    utility: {},
    protocol: {}
  };
  
  // === Group contracts by their constructor parameter patterns ===
  
  // 1. Standard contracts with just adminVault and logger
  const standardContracts: Record<string, string[]> = {
    // Utility contracts - always deploy these
    utility: [
      'PullToken',
      'SendToken',
      'BuyCover',
    ],
    
    // Protocol contracts - only deploy if the protocol exists in current AdminVault
    protocol: [
      // Morpho contracts
      'MorphoV1Supply', 'MorphoV1Withdraw',
      // Clearpool contracts
      'ClearpoolV1Supply', 'ClearpoolV1Withdraw',
      // Fluid contracts
      'FluidV1Supply', 'FluidV1Withdraw',
      // Spark contracts
      'SparkV1Supply', 'SparkV1Withdraw',
      // Strike contracts
      'StrikeV1Supply', 'StrikeV1Withdraw',
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
      // Notional contracts - removed as they need special handling
      // CompoundV2 contracts
      'CompoundV2Supply', 'CompoundV2Withdraw',
      // ShareBased contract
      'ShareBasedWithdraw',
      // Swap
      'ParaswapSwap',
      // Maple contracts - always deploy these as they're new
      'MapleSupply', 'MapleWithdrawQueue'
    ]
  };
  
  // First, deploy and register TransactionRegistry (core contract - always deploy)
  console.log('Deploying TransactionRegistry...');
  const TransactionRegistry = await ethers.getContractFactory('TransactionRegistry', deployer);
  const transactionRegistry = await TransactionRegistry.deploy(
    CONFIG.NEW.ADMIN_VAULT,  // AdminVault address
    CONFIG.NEW.LOGGER        // Logger address
  );
  await transactionRegistry.waitForDeployment();
  const registryAddress = await transactionRegistry.getAddress();
  
  console.log(`✅ TransactionRegistry deployed to: ${registryAddress}`);
  CONFIG.NEW.TRANSACTION_REGISTRY = registryAddress;
  contracts.utility.transactionregistry = registryAddress;
  
  // Verify the TransactionRegistry
  await verifyContract('TransactionRegistry', registryAddress, [
    CONFIG.NEW.ADMIN_VAULT,
    CONFIG.NEW.LOGGER
  ]);
  
  // Now add the specialized contracts that need the transaction registry
  const specializedContracts: Record<string, {name: string, params: any[]}[]> = {
    utility: [
      {
        name: 'UpgradeAction',
        params: [CONFIG.NEW.ADMIN_VAULT, CONFIG.NEW.LOGGER, registryAddress]
      },
      {
        name: 'Curve3PoolSwap',
        params: [CONFIG.NEW.ADMIN_VAULT, CONFIG.NEW.LOGGER, constants.CURVE_3POOL_ADDRESS]
      }
    ],
    protocol: [
      // Notional contracts need the router address
      {
        name: 'NotionalV3Supply',
        params: [CONFIG.NEW.ADMIN_VAULT, CONFIG.NEW.LOGGER, PROTOCOL_ADDRESSES.NOTIONAL_ROUTER]
      },
      {
        name: 'NotionalV3Withdraw',
        params: [CONFIG.NEW.ADMIN_VAULT, CONFIG.NEW.LOGGER, PROTOCOL_ADDRESSES.NOTIONAL_ROUTER]
      }
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
  
  // Get existing protocols from current AdminVault
  const currentAdminVault = await ethers.getContractAt('AdminVault', CONFIG.CURRENT.ADMIN_VAULT, deployer);
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
    'YEARN_V2_USDC': 'Yearn',
    'YEARN_V2_USDT': 'Yearn',
    'YEARN_V2_DAI': 'Yearn',
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
    'SPARK_V1_DAI': 'SparkV1',
    'SPARK_V1_USDS': 'SparkV1',
    
    // Across Pools
    'ACROSS_V3_lpUSDC': 'AcrossV3',
    'ACROSS_V3_lpUSDT': 'AcrossV3',
    'ACROSS_V3_lpDAI': 'AcrossV3',
    
    // Morpho Pools
    'MORPHO_V1_fxUSDC': 'MorphoV1',
    'MORPHO_V1_USUALUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDCcore': 'MorphoV1',
    'MORPHO_V1_re7USDT': 'MorphoV1',
    'MORPHO_V1_reUSDC': 'MorphoV1',
    'MORPHO_V1_steakUSDT': 'MorphoV1',
    'MORPHO_V1_steakUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDT': 'MorphoV1',
    'MORPHO_V1_smokehouseUSDC': 'MorphoV1',
    'MORPHO_V1_gtDAIcore': 'MorphoV1',
    'MORPHO_V1_coinshiftUSDC': 'MorphoV1',
    'MORPHO_V1_steakhouseUSDC_RWA': 'MorphoV1',
    'MORPHO_V1_9S_MountDenali_USDC': 'MorphoV1',
    'MORPHO_V1_9Summits_USDC': 'MorphoV1',
    'MORPHO_V1_smokehouseUSDT': 'MorphoV1',
    'MORPHO_V1_flagshipUSDT': 'MorphoV1',
    'MORPHO_V1_steakhouserUSD': 'MorphoV1',
    'MORPHO_V1_steakhousePYUSD': 'MorphoV1',
    'MORPHO_V1_coinshiftUSDL': 'MorphoV1',
    
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
    'NOTIONAL_V3_USDC': 'NotionalV3',
    
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
  
  // Determine which protocols exist in the current AdminVault
  const existingProtocols = new Set<string>();
  const protocolsToCheck = new Set<string>(Object.values(protocolMapping));
  
  // Always include Maple as it's new
  existingProtocols.add('Maple');
  
  console.log(`🔍 Checking ${protocolsToCheck.size} unique protocols in current AdminVault...`);
  
  // For each protocol, find sample pools to check existence
  for (const protocol of protocolsToCheck) {
    if (protocol === 'Maple') continue; // Skip Maple as we've already added it
    
    console.log(`  Checking if protocol '${protocol}' exists in current AdminVault...`);
    
    // Get sample tokens for this protocol
    const sampleTokens = Object.entries(protocolMapping)
      .filter(([_, prot]) => prot === protocol)
      .map(([token, _]) => token);
    
    // Try each sample pool until we find one that exists, confirming the protocol exists
    let protocolExists = false;
    for (const tokenName of sampleTokens) {
      if (!tokenConfig[tokenName]) continue;
      
      try {
        const address = (tokenConfig[tokenName] as { address: string }).address;
        const poolId = poolIdFromAddress(address);
        await currentAdminVault.getPoolAddress(protocol, poolId);
        
        // If we get here, the protocol exists
        protocolExists = true;
        console.log(`  ✅ Protocol '${protocol}' exists in current AdminVault (found ${tokenName})`);
        break;
      } catch (error) {
        // This specific pool doesn't exist, try another one
        continue;
      }
    }
    
    if (protocolExists) {
      existingProtocols.add(protocol);
    } else {
      console.log(`  ❌ Protocol '${protocol}' not found in current AdminVault, skipping`);
    }
  }
  
  console.log(`✅ Found ${existingProtocols.size} existing protocols in current AdminVault (including Maple)`);
  
  // Filter contract lists based on existing protocols
  
  // 1. Filter standard protocol contracts
  const filteredStandardProtocolContracts = standardContracts.protocol.filter(contractName => {
    // Always deploy Maple contracts
    if (contractName.startsWith('Maple')) return true;
    
    // For other contracts, check if the protocol exists
    const protocol = contractName.replace('Supply', '').replace('Withdraw', '').replace('Queue', '');
    return existingProtocols.has(protocol);
  });
  
  // 2. Filter pool contracts
  const filteredPoolContracts = poolContracts.protocol.filter(([contractName, _, __]) => {
    const protocol = contractName.replace('Supply', '').replace('Withdraw', '');
    return existingProtocols.has(protocol);
  });
  
  // 3. Filter specialized protocol contracts
  const filteredSpecializedProtocolContracts = specializedContracts.protocol.filter(({ name }) => {
    // Extract protocol name from contract name (removing Supply, Withdraw, etc.)
    const protocol = name.replace('Supply', '').replace('Withdraw', '').replace('Queue', '');
    return existingProtocols.has(protocol);
  });
  
  console.log('\n📊 Contract deployment plan:');
  console.log(`  • ${filteredStandardProtocolContracts.length} standard protocol contracts`);
  console.log(`  • ${filteredPoolContracts.length} pool-based protocol contracts`);
  console.log(`  • ${filteredSpecializedProtocolContracts.length} specialized protocol contracts`);
  console.log(`  • ${standardContracts.utility.length} utility contracts`);
  console.log(`  • ${specializedContracts.utility.length} specialized utility contracts`);
  
  // Deploy standard contracts - all utility and filtered protocol
  console.log('\n📦 Deploying standard utility contracts...');
  for (const contractName of standardContracts.utility) {
    contracts.utility[contractName.toLowerCase()] = await deployContract(
      contractName,
      deployer,
      CONFIG.NEW.ADMIN_VAULT,
      CONFIG.NEW.LOGGER
    );
  }
  
  console.log('\n📦 Deploying standard protocol contracts (filtered)...');
  for (const contractName of filteredStandardProtocolContracts) {
    contracts.protocol[contractName.toLowerCase()] = await deployContract(
      contractName,
      deployer,
      CONFIG.NEW.ADMIN_VAULT,
      CONFIG.NEW.LOGGER
    );
  }
  
  // Deploy pool-based contracts (filtered)
  console.log('\n📦 Deploying pool-based protocol contracts (filtered)...');
  for (const [contractName, _, poolValue] of filteredPoolContracts) {
    contracts.protocol[contractName.toLowerCase()] = await deployContract(
      contractName,
      deployer,
      CONFIG.NEW.ADMIN_VAULT,
      CONFIG.NEW.LOGGER,
      poolValue
    );
  }
  
  // Deploy specialized contracts - all utility
  console.log('\n📦 Deploying specialized utility contracts...');
  for (const contract of specializedContracts.utility) {
    contracts.utility[contract.name.toLowerCase()] = await deployContract(
      contract.name,
      deployer,
      ...contract.params
    );
  }
  
  // Deploy specialized protocol contracts (filtered)
  if (filteredSpecializedProtocolContracts.length > 0) {
    console.log('\n📦 Deploying specialized protocol contracts (filtered)...');
    for (const contract of filteredSpecializedProtocolContracts) {
      contracts.protocol[contract.name.toLowerCase()] = await deployContract(
        contract.name,
        deployer,
        ...contract.params
      );
    }
  }
  
  // Store the list of verified protocols for later reference
  CONFIG.NEW.PROTOCOLS = Array.from(existingProtocols);
  
  console.log('\n✅ All contracts deployed successfully');
  
  return contracts;
}

// STEP 7: Add all contracts to AdminVault using Multicall
async function addContractsToAdminVault(deployer: any, contracts: any) {
  console.log('\n\n🔄 STEP 7: Adding contracts to AdminVault using Multicall');
  
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
  console.log('✅ All actions proposed successfully');
  
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
  console.log('✅ All actions added successfully');
  
  console.log('All contracts processed');
}

// STEP 7B: Add all pools from tokenConfig to the AdminVault that exist in current AdminVault
async function addPoolsToAdminVault(deployer: any) {
  console.log('\n\n🌊 STEP 7B: Adding pools from tokenConfig to AdminVault');
  console.log('(Matching only pools that exist in current AdminVault)');
  
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
    'SPARK_V1_DAI': 'SparkV1',
    'SPARK_V1_USDS': 'SparkV1',
    
    // Across Pools
    'ACROSS_V3_lpUSDC': 'AcrossV3',
    'ACROSS_V3_lpUSDT': 'AcrossV3',
    'ACROSS_V3_lpDAI': 'AcrossV3',
    
    // Morpho Pools
    'MORPHO_V1_fxUSDC': 'MorphoV1',
    'MORPHO_V1_USUALUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDCcore': 'MorphoV1',
    'MORPHO_V1_re7USDT': 'MorphoV1',
    'MORPHO_V1_reUSDC': 'MorphoV1',
    'MORPHO_V1_steakUSDT': 'MorphoV1',
    'MORPHO_V1_steakUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDT': 'MorphoV1',
    'MORPHO_V1_smokehouseUSDC': 'MorphoV1',
    'MORPHO_V1_gtDAIcore': 'MorphoV1',
    'MORPHO_V1_coinshiftUSDC': 'MorphoV1',
    'MORPHO_V1_steakhouseUSDC_RWA': 'MorphoV1',
    'MORPHO_V1_9S_MountDenali_USDC': 'MorphoV1',
    'MORPHO_V1_9Summits_USDC': 'MorphoV1',
    'MORPHO_V1_smokehouseUSDT': 'MorphoV1',
    'MORPHO_V1_flagshipUSDT': 'MorphoV1',
    'MORPHO_V1_steakhouserUSD': 'MorphoV1',
    'MORPHO_V1_steakhousePYUSD': 'MorphoV1',
    'MORPHO_V1_coinshiftUSDL': 'MorphoV1',
    
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
    'NOTIONAL_V3_USDC': 'NotionalV3',
    
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
  
  // Create a single multicall transaction that proposes all pools first, then adds all pools
  // This preserves the correct order of operations
  console.log('Preparing combined multicall for pool proposal and addition...');
  const combinedCalldata = [];
  
  // First add all proposePool calls
  for (const { protocol, tokenName, address } of poolsToAdd) {
    console.log(`Preparing to propose pool ${tokenName} (${address.substring(0, 10)}...) for protocol ${protocol}`);
    combinedCalldata.push(
      newAdminVault.interface.encodeFunctionData('proposePool', [protocol, address])
    );
  }
  
  // Then add all addPool calls (in the same order)
  for (const { protocol, tokenName, address } of poolsToAdd) {
    console.log(`Preparing to add pool ${tokenName} (${address.substring(0, 10)}...) for protocol ${protocol}`);
    combinedCalldata.push(
      newAdminVault.interface.encodeFunctionData('addPool', [protocol, address])
    );
  }
  
  // Execute the combined multicall
  console.log(`Executing combined multicall with ${combinedCalldata.length} calls (${poolsToAdd.length} proposes and ${poolsToAdd.length} adds)...`);
  const combinedTx = await newAdminVault.multicall(combinedCalldata);
  await combinedTx.wait();
  console.log('✅ All pools proposed and added successfully in a single transaction');
  
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
  console.log('\n\n👑 STEP 8: Transferring AdminVault ownership');
  
  const adminVault = await ethers.getContractAt('AdminVault', CONFIG.NEW.ADMIN_VAULT, deployer);
  const deployerAddress = await deployer.getAddress();
  
  // Dev multisig address for executor and canceller roles
  const DEV_MULTISIG = "0xd057799f5D01F9baf262eA47a51F9A1C29415608";
  
  // Get the correct role identifiers from the contract
  const OWNER_ROLE = await adminVault.OWNER_ROLE();
  const ROLE_MANAGER_ROLE = await adminVault.ROLE_MANAGER_ROLE();
  
  console.log(`OWNER_ROLE: ${OWNER_ROLE}`);
  console.log(`ROLE_MANAGER_ROLE: ${ROLE_MANAGER_ROLE}`);
  
  // Define all roles that need to be transferred - grouped by type for clarity and ordered
  const allRoles = {
    // Main roles - handle these separately
    main: [
      { name: 'OWNER_ROLE', bytes32: OWNER_ROLE },
      { name: 'ROLE_MANAGER_ROLE', bytes32: ROLE_MANAGER_ROLE },
    ],
    
    // Operational roles for proposing and canceling - go to main multisig
    proposer: [
      { name: 'FEE_PROPOSER_ROLE', bytes32: await adminVault.FEE_PROPOSER_ROLE() },
      { name: 'POOL_PROPOSER_ROLE', bytes32: await adminVault.POOL_PROPOSER_ROLE() },
      { name: 'ACTION_PROPOSER_ROLE', bytes32: await adminVault.ACTION_PROPOSER_ROLE() },
      { name: 'TRANSACTION_PROPOSER_ROLE', bytes32: await adminVault.TRANSACTION_PROPOSER_ROLE() },
    ],
    
    // Executor roles - go to dev multisig
    executor: [
      { name: 'FEE_EXECUTOR_ROLE', bytes32: await adminVault.FEE_EXECUTOR_ROLE() },
      { name: 'POOL_EXECUTOR_ROLE', bytes32: await adminVault.POOL_EXECUTOR_ROLE() },
      { name: 'ACTION_EXECUTOR_ROLE', bytes32: await adminVault.ACTION_EXECUTOR_ROLE() },
      { name: 'TRANSACTION_EXECUTOR_ROLE', bytes32: await adminVault.TRANSACTION_EXECUTOR_ROLE() },
    ],
    
    // Canceler roles - go to dev multisig
    canceler: [
      { name: 'FEE_CANCELER_ROLE', bytes32: await adminVault.FEE_CANCELER_ROLE() },
      { name: 'POOL_CANCELER_ROLE', bytes32: await adminVault.POOL_CANCELER_ROLE() },
      { name: 'ACTION_CANCELER_ROLE', bytes32: await adminVault.ACTION_CANCELER_ROLE() },
      { name: 'TRANSACTION_CANCELER_ROLE', bytes32: await adminVault.TRANSACTION_CANCELER_ROLE() },
    ],
    
    // Other operational roles - go to main multisig
    other: [
      { name: 'FEE_TAKER_ROLE', bytes32: await adminVault.FEE_TAKER_ROLE() },
      { name: 'POOL_DISPOSER_ROLE', bytes32: await adminVault.POOL_DISPOSER_ROLE() },
      { name: 'ACTION_DISPOSER_ROLE', bytes32: await adminVault.ACTION_DISPOSER_ROLE() },
      { name: 'TRANSACTION_DISPOSER_ROLE', bytes32: await adminVault.TRANSACTION_DISPOSER_ROLE() },
    ]
  };
  
  // Combine all roles into a flat array for some operations
  const flatRoles = [
    ...allRoles.main,
    ...allRoles.proposer,
    ...allRoles.executor,
    ...allRoles.canceler,
    ...allRoles.other
  ];
  
  if (!CONFIG.NETWORK.IS_TESTNET) {
    console.log('For production deployment:');
    console.log('The following roles should be granted to the multisig:');
    
    console.log('\nMain multisig roles:');
    [...allRoles.main, ...allRoles.proposer, ...allRoles.other].forEach(role => {
      console.log(`- ${role.name}`);
    });
    
    console.log('\nDev multisig roles:');
    [...allRoles.executor, ...allRoles.canceler].forEach(role => {
      console.log(`- ${role.name}`);
    });
    
    console.log('\nDeployer should then revoke all roles from itself, with ROLE_MANAGER_ROLE last');
    console.log('Finally, multisig should revoke OWNER_ROLE from the deployer using:');
    console.log(`adminVault.revokeRole("${OWNER_ROLE}", "${deployerAddress}")`);
  } else {
    console.log(`Transferring roles to multisigs:`);
    console.log(`- Main multisig: ${CONFIG.CURRENT.MULTISIG}`);
    console.log(`- Dev multisig: ${DEV_MULTISIG}`);
    
    try {
      // Verify deployer has OWNER_ROLE
      const hasOwnerRole = await adminVault.hasRole(OWNER_ROLE, deployerAddress);
      
      if (!hasOwnerRole) {
        console.error(`❌ Deployer ${deployerAddress} does not have OWNER_ROLE, cannot transfer ownership`);
        return;
      }
      
      // Single multicall for all role assignments and revocations (except ROLE_MANAGER_ROLE revocation)
      console.log('\n🔑 Preparing combined role transfer multicall...');
      const combinedCalldata = [];
      
      // 1. First collect all role grants for primary multisig
      console.log('Preparing role grants for primary multisig...');
      const mainMultisigRoles = [...allRoles.main, ...allRoles.proposer, ...allRoles.other];
      
      for (const role of mainMultisigRoles) {
        // Skip if multisig already has this role
        const hasRole = await adminVault.hasRole(role.bytes32, CONFIG.CURRENT.MULTISIG);
        if (hasRole) {
          console.log(`Primary multisig already has ${role.name}, skipping`);
          continue;
        }
        
        console.log(`Preparing grant ${role.name} to primary multisig...`);
        combinedCalldata.push(
          adminVault.interface.encodeFunctionData('grantRole', [role.bytes32, CONFIG.CURRENT.MULTISIG])
        );
      }
      
      // 2. Then collect all role grants for dev multisig
      console.log('\nPreparing role grants for dev multisig...');
      const devMultisigRoles = [...allRoles.executor, ...allRoles.canceler];
      
      for (const role of devMultisigRoles) {
        // Skip if dev multisig already has this role
        const hasRole = await adminVault.hasRole(role.bytes32, DEV_MULTISIG);
        if (hasRole) {
          console.log(`Dev multisig already has ${role.name}, skipping`);
          continue;
        }
        
        console.log(`Preparing grant ${role.name} to dev multisig...`);
        combinedCalldata.push(
          adminVault.interface.encodeFunctionData('grantRole', [role.bytes32, DEV_MULTISIG])
        );
      }
      
      // 3. Finally collect all role revocations for deployer (except ROLE_MANAGER_ROLE)
      console.log('\nPreparing role revocations for deployer...');
      const operationalRoles = [...allRoles.proposer, ...allRoles.executor, ...allRoles.canceler, ...allRoles.other];
      
      for (const role of operationalRoles) {
        // Check if deployer has this role
        const hasRole = await adminVault.hasRole(role.bytes32, deployerAddress);
        if (!hasRole) {
          console.log(`Deployer doesn't have ${role.name}, skipping`);
          continue;
        }
        
        console.log(`Preparing revoke ${role.name} from deployer...`);
        combinedCalldata.push(
          adminVault.interface.encodeFunctionData('revokeRole', [role.bytes32, deployerAddress])
        );
      }
      
      // Execute the combined multicall if there are operations to perform
      if (combinedCalldata.length > 0) {
        console.log(`\nExecuting combined multicall with ${combinedCalldata.length} operations...`);
        const combinedTx = await adminVault.multicall(combinedCalldata);
        await combinedTx.wait();
        console.log('✅ Combined role transfer multicall completed successfully');
      } else {
        console.log('ℹ️ No role operations to perform in combined multicall');
      }
      
      // 4. Handle ROLE_MANAGER_ROLE separately as it must be done last
      console.log('\n🔑 Handling ROLE_MANAGER_ROLE separately...');
      const hasRoleManager = await adminVault.hasRole(ROLE_MANAGER_ROLE, deployerAddress);
      
      if (hasRoleManager) {
        console.log(`Revoking ROLE_MANAGER_ROLE from deployer...`);
        const revokeRoleManagerTx = await adminVault.revokeRole(ROLE_MANAGER_ROLE, deployerAddress);
        await revokeRoleManagerTx.wait();
        console.log('✅ ROLE_MANAGER_ROLE revoked from deployer');
      } else {
        console.log('ℹ️ Deployer does not have ROLE_MANAGER_ROLE, skipping');
      }
      
      // Final ownership state
      console.log('\n🚨 Ownership transfer almost complete!');
      console.log(`The deployer still has OWNER_ROLE. The primary multisig (${CONFIG.CURRENT.MULTISIG}) should`);
      console.log('revoke this role from the deployer to complete the transfer using:');
      console.log(`adminVault.revokeRole("${OWNER_ROLE}", "${deployerAddress}")`);
      
      // Verify current state
      console.log('\nCurrent state:');
      console.log(`- Primary multisig has OWNER_ROLE: ${await adminVault.hasRole(OWNER_ROLE, CONFIG.CURRENT.MULTISIG)}`);
      console.log(`- Dev multisig has executor roles: ${await adminVault.hasRole(allRoles.executor[0].bytes32, DEV_MULTISIG)}`);
      console.log(`- Deployer has OWNER_ROLE: ${await adminVault.hasRole(OWNER_ROLE, deployerAddress)}`);
      console.log(`- Deployer has ROLE_MANAGER_ROLE: ${await adminVault.hasRole(ROLE_MANAGER_ROLE, deployerAddress)}`);
      
    } catch (error) {
      console.error('❌ Error transferring ownership:', error);
      console.log('Please ensure the deployer has the OWNER_ROLE and try again');
    }
  }
}

// STEP 9: Transfer ProxyAdmin ownership (for production)
async function transferProxyAdminOwnership(deployer: any) {
  console.log('\n\n🔑 STEP 9: Transferring ProxyAdmin ownership');
  
  if (!CONFIG.NETWORK.IS_TESTNET) {
    console.log('For production deployment:');
    console.log('1. Use the Admin contract directly to transfer ownership');
    console.log(`   - multisig address: ${CONFIG.CURRENT.MULTISIG}`);
    console.log('This must be executed by the current proxy admin owner');
  } else {
    // For testnet, we can transfer the ownership using OpenZeppelin's helpers
    try {
      // First, check if we can use the OpenZeppelin upgrades admin functions
      console.log('Attempting to use OpenZeppelin upgrades admin helpers...');
      
      try {
        // Try to transfer directly using OZ helpers
        console.log(`Using OpenZeppelin upgrades.admin.transferProxyAdminOwnership to ${CONFIG.CURRENT.MULTISIG}...`);
        await upgrades.admin.transferProxyAdminOwnership(CONFIG.NEW.LOGGER_ADMIN, CONFIG.CURRENT.MULTISIG);
        console.log('✅ ProxyAdmin ownership transferred successfully using OZ helpers');
        return;
      } catch (ozError: any) {
        console.log('Could not use OpenZeppelin admin helpers, falling back to manual approach');
        console.log(`Error was: ${ozError.message}`);
      }
      
      // Fallback to manual approach
      const proxyAddress = CONFIG.NEW.LOGGER;
      const adminAddress = CONFIG.NEW.LOGGER_ADMIN;
      console.log(`Logger proxy at ${proxyAddress}`);
      console.log(`ProxyAdmin at ${adminAddress}`);
      
      // Using a minimal ABI for the ProxyAdmin contract
      const proxyAdminAbi = [
        "function owner() view returns (address)",
        "function transferOwnership(address newOwner)",
        "function getProxyAdmin(address proxy) view returns (address)"
      ];
      
      // Create a contract instance
      const proxyAdmin = new ethers.Contract(adminAddress, proxyAdminAbi, deployer);
      
      // Verify that we're working with the correct admin
      const verifiedAdmin = await proxyAdmin.getProxyAdmin(proxyAddress);
      console.log(`Verified admin for proxy: ${verifiedAdmin}`);
      
      if (verifiedAdmin.toLowerCase() !== adminAddress.toLowerCase()) {
        console.error(`❌ Admin verification failed! Expected ${adminAddress}, but got ${verifiedAdmin}`);
        return;
      }
      
      // Check current owner
      const currentOwner = await proxyAdmin.owner();
      console.log(`Current admin owner: ${currentOwner}`);
      
      // Verify deployer has ownership
      const deployerAddress = await deployer.getAddress();
      if (currentOwner.toLowerCase() !== deployerAddress.toLowerCase()) {
        console.error(`❌ Deployer ${deployerAddress} is not the admin owner, cannot transfer ownership`);
        return;
      }
      
      // Transfer ownership to multisig
      console.log(`Transferring admin ownership to multisig: ${CONFIG.CURRENT.MULTISIG}`);
      const tx = await proxyAdmin.transferOwnership(CONFIG.CURRENT.MULTISIG);
      await tx.wait();
      
      // Verify new owner
      const newOwner = await proxyAdmin.owner();
      console.log(`✅ Admin ownership successfully transferred to: ${newOwner}`);
      
    } catch (error) {
      console.error("❌ Error transferring ProxyAdmin ownership:", error);
      console.log("Consider transferring ownership manually after deployment");
    }
  }
}

// Helper function to deploy a contract and log its address
async function deployContract(name: string, deployer: any, ...args: any[]) {
  console.log(`\nDeploying ${name}...`);
  
  const Contract = await ethers.getContractFactory(name, deployer);
  const contract = await Contract.deploy(...args);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log(`✅ ${name} deployed to: ${address}`);
  
  // Verify the contract
  await verifyContract(name, address, args);
  
  return address;
}

// Check environment configuration
function checkEnvironmentConfig() {
  console.log('\n🔍 Checking environment configuration...');
  
  // Check Tenderly verification configuration if enabled
  if (CONFIG.VERIFICATION.TENDERLY_ENABLED) {
    console.log('Checking Tenderly verification configuration...');
    
    if (!process.env.TENDERLY_USERNAME || process.env.TENDERLY_USERNAME.trim() === '') {
      console.warn('⚠️ WARNING: TENDERLY_USERNAME is not set in .env file');
      console.warn('   Tenderly verification will likely fail');
    } else {
      console.log(`✅ TENDERLY_USERNAME is set: ${process.env.TENDERLY_USERNAME}`);
    }
    
    if (!process.env.TENDERLY_PROJECT || process.env.TENDERLY_PROJECT.trim() === '') {
      console.warn('⚠️ WARNING: TENDERLY_PROJECT is not set in .env file');
      console.warn('   Tenderly verification will likely fail');
    } else {
      console.log(`✅ TENDERLY_PROJECT is set: ${process.env.TENDERLY_PROJECT}`);
    }
    
    if (!process.env.TENDERLY_API_KEY || process.env.TENDERLY_API_KEY.trim() === '') {
      console.warn('⚠️ WARNING: TENDERLY_API_KEY is not set in .env file');
      console.warn('   This may be needed for some Tenderly operations');
    } else {
      console.log(`✅ TENDERLY_API_KEY is set`);
    }
  }
  
  // Check Etherscan verification configuration if enabled
  if (CONFIG.VERIFICATION.ETHERSCAN_ENABLED) {
    console.log('Checking Etherscan verification configuration...');
    
    if (!process.env.ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY.trim() === '') {
      console.warn('⚠️ WARNING: ETHERSCAN_API_KEY is not set in .env file');
      console.warn('   Etherscan verification will likely fail');
    } else {
      console.log(`✅ ETHERSCAN_API_KEY is set`);
    }
  }
  
  console.log('Environment configuration check complete');
}

// Master function to handle all AdminVault operations in a single multicall
async function configureAdminVault(deployer: any, contracts: any) {
  console.log('\n\n🔄 MASTER STEP: Configuring AdminVault with a single multicall');
  console.log('Combining contract registration, pool configuration, and role assignment');
  
  const adminVault = await ethers.getContractAt('AdminVault', CONFIG.NEW.ADMIN_VAULT, deployer);
  const deployerAddress = await deployer.getAddress();
  
  // Dev multisig address for executor and canceller roles
  const DEV_MULTISIG = "0xd057799f5D01F9baf262eA47a51F9A1C29415608";
  
  // Get the correct role identifiers from the contract
  const OWNER_ROLE = await adminVault.OWNER_ROLE();
  const ROLE_MANAGER_ROLE = await adminVault.ROLE_MANAGER_ROLE();
  
  console.log(`OWNER_ROLE: ${OWNER_ROLE}`);
  console.log(`ROLE_MANAGER_ROLE: ${ROLE_MANAGER_ROLE}`);
  
  // Define all roles that need to be transferred - grouped by type for clarity
  const allRoles = {
    // Main roles - handle these separately
    main: [
      { name: 'OWNER_ROLE', bytes32: OWNER_ROLE },
      { name: 'ROLE_MANAGER_ROLE', bytes32: ROLE_MANAGER_ROLE },
    ],
    
    // Operational roles for proposing and canceling - go to main multisig
    proposer: [
      { name: 'FEE_PROPOSER_ROLE', bytes32: await adminVault.FEE_PROPOSER_ROLE() },
      { name: 'POOL_PROPOSER_ROLE', bytes32: await adminVault.POOL_PROPOSER_ROLE() },
      { name: 'ACTION_PROPOSER_ROLE', bytes32: await adminVault.ACTION_PROPOSER_ROLE() },
      { name: 'TRANSACTION_PROPOSER_ROLE', bytes32: await adminVault.TRANSACTION_PROPOSER_ROLE() },
    ],
    
    // Executor roles - go to dev multisig
    executor: [
      { name: 'FEE_EXECUTOR_ROLE', bytes32: await adminVault.FEE_EXECUTOR_ROLE() },
      { name: 'POOL_EXECUTOR_ROLE', bytes32: await adminVault.POOL_EXECUTOR_ROLE() },
      { name: 'ACTION_EXECUTOR_ROLE', bytes32: await adminVault.ACTION_EXECUTOR_ROLE() },
      { name: 'TRANSACTION_EXECUTOR_ROLE', bytes32: await adminVault.TRANSACTION_EXECUTOR_ROLE() },
    ],
    
    // Canceler roles - go to dev multisig
    canceler: [
      { name: 'FEE_CANCELER_ROLE', bytes32: await adminVault.FEE_CANCELER_ROLE() },
      { name: 'POOL_CANCELER_ROLE', bytes32: await adminVault.POOL_CANCELER_ROLE() },
      { name: 'ACTION_CANCELER_ROLE', bytes32: await adminVault.ACTION_CANCELER_ROLE() },
      { name: 'TRANSACTION_CANCELER_ROLE', bytes32: await adminVault.TRANSACTION_CANCELER_ROLE() },
    ],
    
    // Other operational roles - go to main multisig
    other: [
      { name: 'FEE_TAKER_ROLE', bytes32: await adminVault.FEE_TAKER_ROLE() },
      { name: 'POOL_DISPOSER_ROLE', bytes32: await adminVault.POOL_DISPOSER_ROLE() },
      { name: 'ACTION_DISPOSER_ROLE', bytes32: await adminVault.ACTION_DISPOSER_ROLE() },
      { name: 'TRANSACTION_DISPOSER_ROLE', bytes32: await adminVault.TRANSACTION_DISPOSER_ROLE() },
    ]
  };
  
  // Verify deployer has OWNER_ROLE
  const hasOwnerRole = await adminVault.hasRole(OWNER_ROLE, deployerAddress);
  if (!hasOwnerRole) {
    console.error(`❌ Deployer ${deployerAddress} does not have OWNER_ROLE, cannot configure AdminVault`);
    return {
      contractsAdded: 0,
      poolsAdded: 0,
      totalMulticallOperations: 0
    };
  }
  
  // =================== STEP 1: Flatten contracts ===================
  console.log('\n📦 Step 1: Preparing contracts for AdminVault registration...');
  const flattenedContracts: [string, string][] = [];
  
  // Flatten the contracts object
  for (const [key, value] of Object.entries(contracts)) {
    if (typeof value === 'string') {
      flattenedContracts.push([key, value]);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested contract objects
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (typeof nestedValue === 'string') {
          flattenedContracts.push([`${key}.${nestedKey}`, nestedValue as string]);
        }
      }
    }
  }
  
  console.log(`Found ${flattenedContracts.length} contracts to register in AdminVault`);
  
  // =================== STEP 2: Get pools to add ===================
  console.log('\n🌊 Step 2: Identifying pools to add to AdminVault...');
  
  // Get current AdminVault instance to check existing pools
  const currentAdminVault = await ethers.getContractAt('AdminVault', CONFIG.CURRENT.ADMIN_VAULT, deployer);
  
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
    'SPARK_V1_DAI': 'SparkV1',
    'SPARK_V1_USDS': 'SparkV1',
    
    // Across Pools
    'ACROSS_V3_lpUSDC': 'AcrossV3',
    'ACROSS_V3_lpUSDT': 'AcrossV3',
    'ACROSS_V3_lpDAI': 'AcrossV3',
    
    // Morpho Pools
    'MORPHO_V1_fxUSDC': 'MorphoV1',
    'MORPHO_V1_USUALUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDCcore': 'MorphoV1',
    'MORPHO_V1_re7USDT': 'MorphoV1',
    'MORPHO_V1_reUSDC': 'MorphoV1',
    'MORPHO_V1_steakUSDT': 'MorphoV1',
    'MORPHO_V1_steakUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDC': 'MorphoV1',
    'MORPHO_V1_gtUSDT': 'MorphoV1',
    'MORPHO_V1_smokehouseUSDC': 'MorphoV1',
    'MORPHO_V1_gtDAIcore': 'MorphoV1',
    'MORPHO_V1_coinshiftUSDC': 'MorphoV1',
    'MORPHO_V1_steakhouseUSDC_RWA': 'MorphoV1',
    'MORPHO_V1_9S_MountDenali_USDC': 'MorphoV1',
    'MORPHO_V1_9Summits_USDC': 'MorphoV1',
    'MORPHO_V1_smokehouseUSDT': 'MorphoV1',
    'MORPHO_V1_flagshipUSDT': 'MorphoV1',
    'MORPHO_V1_steakhouserUSD': 'MorphoV1',
    'MORPHO_V1_steakhousePYUSD': 'MorphoV1',
    'MORPHO_V1_coinshiftUSDL': 'MorphoV1',
    
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
    'NOTIONAL_V3_USDC': 'NotionalV3',
    
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
  
  // First determine which protocols exist in the current AdminVault
  const existingProtocols = new Set<string>();
  const protocolsToCheck = new Set<string>(potentialPools.map(p => p.protocol));
  
  // Always include Maple as it's new
  existingProtocols.add('Maple');
  
  console.log(`Checking ${protocolsToCheck.size} unique protocols in current AdminVault...`);
  
  // For each protocol, find sample pools to check existence
  for (const protocol of protocolsToCheck) {
    if (protocol === 'Maple') continue; // Skip Maple as we've already added it
    
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
  
  // Now check which pools are already in the current AdminVault, but only for protocols that exist
  const poolsToAdd: { protocol: string, tokenName: string, address: string }[] = [];
  
  for (const pool of potentialPools) {
    // Skip if the protocol doesn't exist in current AdminVault
    if (!existingProtocols.has(pool.protocol)) {
      continue;
    }
    
    try {
      // Get the poolId
      const poolId = poolIdFromAddress(pool.address);
      
      // Try to get the pool address from current AdminVault
      // If it doesn't exist, this will throw an error
      await currentAdminVault.getPoolAddress(pool.protocol, poolId);
      
      // If we get here, the pool exists in current AdminVault
      poolsToAdd.push(pool);
    } catch (error) {
      // Pool doesn't exist in current AdminVault, skip it
    }
  }
  
  console.log(`Found ${poolsToAdd.length} pools from ${existingProtocols.size} protocols to add to new AdminVault`);
  
  // Save the pools information to CONFIG
  CONFIG.NEW.POOLS = poolsToAdd.reduce((acc, { protocol, tokenName, address }) => {
    if (!acc[protocol]) acc[protocol] = {};
    acc[protocol][tokenName] = address;
    return acc;
  }, {} as any);
  
  // Also save the list of verified protocols
  CONFIG.NEW.PROTOCOLS = Array.from(existingProtocols);
  
  // =================== STEP 3: Build mega-multicall array ===================
  console.log('\n🔧 Step 3: Building combined multicall array...');
  const combinedCalldata = [];
  
  // 1. First add all contract proposeAction calls
  console.log('Adding contract proposals to multicall...');
  for (const [name, address] of flattenedContracts) {
    const signature = getBytes4(address);
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('proposeAction', [signature, address])
    );
  }
  
  // 2. Then add all contract addAction calls
  console.log('Adding contract registrations to multicall...');
  for (const [name, address] of flattenedContracts) {
    const signature = getBytes4(address);
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('addAction', [signature, address])
    );
  }
  
  // 3. Then add all pool proposePool calls
  console.log('Adding pool proposals to multicall...');
  for (const { protocol, tokenName, address } of poolsToAdd) {
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('proposePool', [protocol, address])
    );
  }
  
  // 4. Then add all pool addPool calls
  console.log('Adding pool registrations to multicall...');
  for (const { protocol, tokenName, address } of poolsToAdd) {
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('addPool', [protocol, address])
    );
  }
  
  // 5. Then add all role grants for primary multisig
  console.log('Adding primary multisig role grants to multicall...');
  const mainMultisigRoles = [...allRoles.main, ...allRoles.proposer, ...allRoles.other];
  
  for (const role of mainMultisigRoles) {
    // Skip if multisig already has this role
    const hasRole = await adminVault.hasRole(role.bytes32, CONFIG.CURRENT.MULTISIG);
    if (hasRole) {
      console.log(`Primary multisig already has ${role.name}, skipping`);
      continue;
    }
    
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('grantRole', [role.bytes32, CONFIG.CURRENT.MULTISIG])
    );
  }
  
  // 6. Then add all role grants for dev multisig
  console.log('Adding dev multisig role grants to multicall...');
  const devMultisigRoles = [...allRoles.executor, ...allRoles.canceler];
  
  for (const role of devMultisigRoles) {
    // Skip if dev multisig already has this role
    const hasRole = await adminVault.hasRole(role.bytes32, DEV_MULTISIG);
    if (hasRole) {
      console.log(`Dev multisig already has ${role.name}, skipping`);
      continue;
    }
    
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('grantRole', [role.bytes32, DEV_MULTISIG])
    );
  }
  
  // 7. Finally add all role revocations for deployer (except ROLE_MANAGER_ROLE)
  console.log('Adding deployer role revocations to multicall...');
  const operationalRoles = [...allRoles.proposer, ...allRoles.executor, ...allRoles.canceler, ...allRoles.other];
  
  for (const role of operationalRoles) {
    // Check if deployer has this role
    const hasRole = await adminVault.hasRole(role.bytes32, deployerAddress);
    if (!hasRole) {
      console.log(`Deployer doesn't have ${role.name}, skipping`);
      continue;
    }
    
    combinedCalldata.push(
      adminVault.interface.encodeFunctionData('revokeRole', [role.bytes32, deployerAddress])
    );
  }
  
  // =================== STEP 4: Execute mega-multicall ===================
  // Execute the combined multicall if there are operations to perform
  if (combinedCalldata.length > 0) {
    console.log(`\n🚀 Executing combined multicall with ${combinedCalldata.length} operations...`);
    console.log(`  • ${flattenedContracts.length} contract proposals`);
    console.log(`  • ${flattenedContracts.length} contract registrations`);
    console.log(`  • ${poolsToAdd.length} pool proposals`);
    console.log(`  • ${poolsToAdd.length} pool registrations`);
    console.log(`  • ${mainMultisigRoles.length} primary multisig role grants`);
    console.log(`  • ${devMultisigRoles.length} dev multisig role grants`);
    console.log(`  • ${operationalRoles.length} deployer role revocations`);
    
    const combinedTx = await adminVault.multicall(combinedCalldata);
    await combinedTx.wait();
    console.log('✅ Combined AdminVault configuration multicall completed successfully');
  } else {
    console.log('ℹ️ No operations to perform in combined multicall');
  }
  
  // =================== STEP 5: Handle ROLE_MANAGER_ROLE separately ===================
  // Handle ROLE_MANAGER_ROLE separately as it must be done last
  console.log('\n🔑 Handling ROLE_MANAGER_ROLE separately...');
  const hasRoleManager = await adminVault.hasRole(ROLE_MANAGER_ROLE, deployerAddress);
  
  if (hasRoleManager) {
    console.log(`Revoking ROLE_MANAGER_ROLE from deployer...`);
    const revokeRoleManagerTx = await adminVault.revokeRole(ROLE_MANAGER_ROLE, deployerAddress);
    await revokeRoleManagerTx.wait();
    console.log('✅ ROLE_MANAGER_ROLE revoked from deployer');
  } else {
    console.log('ℹ️ Deployer does not have ROLE_MANAGER_ROLE, skipping');
  }
  
  // =================== STEP 6: Final status check ===================
  // Verify current state
  console.log('\n📊 Final AdminVault configuration status:');
  console.log(`• Primary multisig (${CONFIG.CURRENT.MULTISIG}):`);
  console.log(`  - Has OWNER_ROLE: ${await adminVault.hasRole(OWNER_ROLE, CONFIG.CURRENT.MULTISIG)}`);
  console.log(`  - Has ACTION_PROPOSER_ROLE: ${await adminVault.hasRole(allRoles.proposer[2].bytes32, CONFIG.CURRENT.MULTISIG)}`);
  
  console.log(`• Dev multisig (${DEV_MULTISIG}):`);
  console.log(`  - Has ACTION_EXECUTOR_ROLE: ${await adminVault.hasRole(allRoles.executor[2].bytes32, DEV_MULTISIG)}`);
  console.log(`  - Has ACTION_CANCELER_ROLE: ${await adminVault.hasRole(allRoles.canceler[2].bytes32, DEV_MULTISIG)}`);
  
  console.log(`• Deployer (${deployerAddress}):`);
  console.log(`  - Has OWNER_ROLE: ${await adminVault.hasRole(OWNER_ROLE, deployerAddress)}`);
  console.log(`  - Has ROLE_MANAGER_ROLE: ${await adminVault.hasRole(ROLE_MANAGER_ROLE, deployerAddress)}`);
  
  console.log('\n🚨 Ownership transfer almost complete!');
  console.log(`The deployer still has OWNER_ROLE. The primary multisig (${CONFIG.CURRENT.MULTISIG}) should`);
  console.log('revoke this role from the deployer to complete the transfer using:');
  console.log(`adminVault.revokeRole("${OWNER_ROLE}", "${deployerAddress}")`);
  
  return {
    contractsAdded: flattenedContracts.length,
    poolsAdded: poolsToAdd.length,
    totalMulticallOperations: combinedCalldata.length
  };
}

// Main deployment function
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`\n\n🚀 Deploying with account: ${deployerAddress}`);
  
  // Check if the deployer is connected via MetaMask or another provider
  console.log(`Provider type: ${ethers.provider.constructor.name}`);
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
  
  // Check environment configuration before starting
  checkEnvironmentConfig();
  
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
      enabled: CONFIG.VERIFICATION.ETHERSCAN_ENABLED || CONFIG.VERIFICATION.TENDERLY_ENABLED,
      results: {}
    }
  };
  
  try {
    // Save initial state
    await saveDeploymentOutput(output, true);
    
    // NEW STEP 0: Ensure prerequisites
    await ensurePrerequisites(deployer);
    await saveProgressStep('prerequisites_ensured', { 
      adminVault: CONFIG.CURRENT.ADMIN_VAULT,
      logger: CONFIG.CURRENT.LOGGER,
      transactionRegistry: CONFIG.CURRENT.TRANSACTION_REGISTRY
    });
    
    // Update the output with the actual addresses
    output.current = { ...CONFIG.CURRENT };
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
    
    // MASTER STEP: Configure AdminVault (replaces steps 7, 7B, and 8)
    if (CONFIG.NETWORK.IS_TESTNET) {
      const configResult = await configureAdminVault(deployer, { 
        ...actionContracts.utility,
        ...actionContracts.protocol
      });
      
      await saveProgressStep('admin_vault_configured', {
        contractsAdded: configResult.contractsAdded,
        poolsAdded: configResult.poolsAdded,
        totalOperations: configResult.totalMulticallOperations
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
    if ((CONFIG.VERIFICATION.ETHERSCAN_ENABLED || CONFIG.VERIFICATION.TENDERLY_ENABLED) && CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length > 0) {
      console.log('\n\n🔍 STEP 10: Verifying remaining queued contracts...');
      await verifyQueuedContracts();
      await saveProgressStep('remaining_contracts_verified', {
        count: CONFIG.VERIFICATION.CONTRACTS_TO_VERIFY.length
      });
    }
    
    // Save the final output
    const outputFile = await saveDeploymentOutput(output);
    console.log(`\n✅ Deployment complete! Final output saved to: ${outputFile}`);
    
    // Print summary
    console.log('\n==== 📊 DEPLOYMENT SUMMARY ====');
    console.log(`Network: ${output.network.name} (chainId: ${output.network.chainId})`);
    console.log(`Deployer: ${output.deployer}`);
    console.log(`\n🔑 Core Contract Addresses:`);
    console.log(`• UpgradeActionNoLog: ${output.new.upgradeActionNoLog}`);
    console.log(`• Logger V2 Proxy: ${output.new.logger.proxy}`);
    console.log(`• Logger Implementation: ${output.new.logger.implementation}`);
    console.log(`• Logger Admin: ${output.new.logger.admin}`);
    console.log(`• AdminVault: ${output.new.adminVault}`);
    console.log(`• Transaction Registry: ${CONFIG.NEW.TRANSACTION_REGISTRY}`);
    
    console.log(`\n📦 Contract Deployments:`);
    console.log(`• Utility contracts: ${Object.keys(actionContracts.utility).length}`);
    console.log(`• Protocol contracts: ${Object.keys(actionContracts.protocol).length}`);
    console.log(`• Total contracts: ${Object.keys(actionContracts.utility).length + Object.keys(actionContracts.protocol).length + 3}`); // +3 for Logger, AdminVault, TransactionRegistry
    
    console.log(`\n🔐 Ownership Status:`);
    if (CONFIG.NETWORK.IS_TESTNET) {
      console.log(`• AdminVault: Roles granted to multisig (${CONFIG.CURRENT.MULTISIG})`);
      console.log(`  ⚠️ Final OWNER_ROLE transfer must be completed by multisig`);
      console.log(`• ProxyAdmin: Transferred to multisig (${CONFIG.CURRENT.MULTISIG})`);
    } else {
      console.log(`• AdminVault: Ownership transfer pending (instructions provided)`);
      console.log(`• ProxyAdmin: Ownership transfer pending (instructions provided)`);
    }
    
    console.log(`\n🚀 Next Steps:`);
    if (CONFIG.NETWORK.IS_TESTNET) {
      console.log(`1. Verify that all contracts are functioning correctly using the test environment.`);
      console.log(`2. Have the multisig complete the ownership transfer by revoking OWNER_ROLE from deployer.`);
    } else {
      console.log(`1. Complete the AdminVault ownership transfer by following the instructions above.`);
      console.log(`2. Complete the ProxyAdmin ownership transfer by following the instructions above.`);
    }
    console.log(`3. Verify all contracts via Etherscan and Tenderly interfaces if automatic verification failed.`);
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    
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