import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

// Load contract ABI for interfaces we need
const SAFE_SETUP_ABI = [
  'function setGuard(address guard) external',
  'function enableModule(address module) external',
  'function disableModule(address prevModule, address module) external',
  'function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory array, address next)',
  'function isModuleEnabled(address module) external view returns (bool)'
];

// Define transaction data type
interface TransactionData {
  data: string;
  hash: string;
  wasAlreadyApproved: boolean;
  isApproved?: boolean;
  proposalTx?: string;
  approvalTx?: string;
}

// Fix the results object type to include multicallTx
interface ResultsData {
  timestamp: string;
  network: {
    name: string;
    chainId: string;
  };
  signer: string;
  contracts: {
    transactionRegistry: string;
    newBravaGuard: string;
    newFeeTakeSafeModule: string;
    currentFeeTakeSafeModule?: string; // Optional current module to be disabled
  };
  transactions: {
    guardUpdate: TransactionData;
    moduleEnable: TransactionData;
    moduleDisable?: TransactionData; // Optional module disable transaction
  };
  multicallTx?: string;
}

// Main configuration
const CONFIG = {
  // OLD deployment transaction registry (for BravaGuard upgrade)
  OLD_TRANSACTION_REGISTRY: process.env.OLD_TRANSACTION_REGISTRY || '0x0bee3e3cc53d745D99Ef55C96c29eb934A17A8a0',
  
  // NEW deployment transaction registry (for FeeTakeSafeModule transactions)
  NEW_TRANSACTION_REGISTRY: process.env.NEW_TRANSACTION_REGISTRY || '',
  
  // Legacy config (kept for backwards compatibility)
  TRANSACTION_REGISTRY: process.env.TRANSACTION_REGISTRY || '0x0bee3e3cc53d745D99Ef55C96c29eb934A17A8a0',
  
  ADMIN_VAULT: process.env.ADMIN_VAULT || '0x1Dada9C865ce0250CfC14E7FcfDE4e7411860506',
  LOGGER: process.env.LOGGER || '0xB4Ae0e64217cFc7244693f9072585C8E80B2280f',
  
  // New contracts
  NEW_BRAVA_GUARD: process.env.NEW_BRAVA_GUARD || '0xbc340d35DE8164F122A7724046048FdAc00709c6',
  NEW_FEE_TAKE_SAFE_MODULE: process.env.NEW_FEE_TAKE_SAFE_MODULE || '0x7169Bb0a9d134b53048b8F96700161F354C42D60',
  
  // Current deployment info
  CURRENT: {
    MULTISIG: process.env.CURRENT_MULTISIG || '0x44149c547A135ae6eC6e40BF51a272c07e9361F4', // The address of the multisig/owner
    SAFE: process.env.CURRENT_SAFE || '0x44149c547A135ae6eC6e40BF51a272c07e9361F4', // The Safe/multisig address
    FEE_TAKE_SAFE_MODULE: process.env.CURRENT_FEE_TAKE_SAFE_MODULE || '', // Current Fee Take Module to disable after enabling the new one
  },
  
  // Network settings
  IS_TESTNET: process.env.IS_TESTNET === 'true',
  
  // Module management strategy
  REMOVE_OLD_MODULE: process.env.REMOVE_OLD_MODULE === 'true', // Whether to remove the old module after adding the new one
};

// Generate transaction data for setting a new guard
function generateGuardUpdateData(guardAddress: string): string {
  const safeSetupInterface = new ethers.Interface(SAFE_SETUP_ABI);
  return safeSetupInterface.encodeFunctionData('setGuard', [guardAddress]);
}

// Generate transaction data for enabling a module
function generateEnableModuleData(moduleAddress: string): string {
  const safeSetupInterface = new ethers.Interface(SAFE_SETUP_ABI);
  return safeSetupInterface.encodeFunctionData('enableModule', [moduleAddress]);
}

// Generate transaction data for disabling a module
function generateDisableModuleData(prevModuleAddress: string, moduleAddress: string): string {
  const safeSetupInterface = new ethers.Interface(SAFE_SETUP_ABI);
  return safeSetupInterface.encodeFunctionData('disableModule', [prevModuleAddress, moduleAddress]);
}

// Get modules from Safe contract
async function getModulesPaginated(safeAddress: string, signer: any): Promise<string[]> {
  console.log(`\n📋 Getting modules from Safe at ${safeAddress}...`);
  
  const safe = await ethers.getContractAt(SAFE_SETUP_ABI, safeAddress, signer);
  const PAGE_SIZE = 10;
  const modules: string[] = [];
  
  // Start with address(1) which is the start pointer
  let start = '0x0000000000000000000000000000000000000001';
  let hasMore = true;
  
  while (hasMore) {
    const [array, next] = await safe.getModulesPaginated(start, PAGE_SIZE);
    modules.push(...array);
    
    // If next is 0x1, we've reached the end
    if (next === '0x0000000000000000000000000000000000000001') {
      hasMore = false;
    } else {
      start = next;
    }
  }
  
  console.log(`Found ${modules.length} modules:`);
  for (const module of modules) {
    // Check if this is the current fee module
    const isFeeModule = module.toLowerCase() === CONFIG.CURRENT.FEE_TAKE_SAFE_MODULE.toLowerCase();
    console.log(`  ${module}${isFeeModule ? ' (Current Fee Module)' : ''}`);
  }
  
  return modules;
}

// Save approval data to file
async function saveApprovalData(data: any) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]; // Remove milliseconds
  const filename = `approved-upgrades-${timestamp}.json`;
  const outputPath = path.join(__dirname, '../', filename);
  
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Approval data saved to: ${outputPath}`);
  
  return filename;
}

// Approve BravaGuard upgrade in OLD TransactionRegistry
async function approveOldUpgradeTransactions(multisigSigner: any) {
  console.log('\n\n🔄 Approving BravaGuard upgrade in OLD TransactionRegistry');
  
  // Use OLD_TRANSACTION_REGISTRY if specified, otherwise fall back to TRANSACTION_REGISTRY
  const oldTransactionRegistry = CONFIG.OLD_TRANSACTION_REGISTRY || CONFIG.TRANSACTION_REGISTRY;
  
  if (!oldTransactionRegistry) {
    throw new Error('OLD TransactionRegistry address is required for approving BravaGuard upgrade');
  }
  
  console.log(`Using OLD TransactionRegistry at ${oldTransactionRegistry}`);
  
  // Check if the code exists at the OLD TransactionRegistry address
  const code = await ethers.provider.getCode(oldTransactionRegistry);
  if (code === '0x') {
    throw new Error(`No contract found at OLD TransactionRegistry address: ${oldTransactionRegistry}`);
  }
  
  console.log(`✅ Validated contract exists at OLD TransactionRegistry: ${oldTransactionRegistry}`);
  
  // 1. Generate transaction data for upgrade to new BravaGuard
  console.log(`\n🛡️ Generating upgrade data for BravaGuard: ${CONFIG.NEW_BRAVA_GUARD}`);
  const guardUpdateData = generateGuardUpdateData(CONFIG.NEW_BRAVA_GUARD);
  const guardUpdateTxHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [guardUpdateData]));

  console.log(`Transaction data: ${guardUpdateData}`);
  console.log(`Transaction hash: ${guardUpdateTxHash}`);
  console.log(`Data from script:`, guardUpdateData);
  console.log(`TxHash from script:`, guardUpdateTxHash);
  
  // Connect to OLD TransactionRegistry
  const transactionRegistry = await ethers.getContractAt('TransactionRegistry', oldTransactionRegistry, multisigSigner);
  
  // Check if already approved
  const isGuardUpdateApproved = await transactionRegistry.isApprovedTransaction(guardUpdateTxHash);
  console.log(`BravaGuard update already approved: ${isGuardUpdateApproved}`);
  
  const guardResult = {
    data: guardUpdateData,
    hash: guardUpdateTxHash,
    wasAlreadyApproved: isGuardUpdateApproved,
    isApproved: isGuardUpdateApproved,
    proposalTx: '',
    approvalTx: ''
  };
  
  if (!isGuardUpdateApproved) {
    console.log(`\n🔄 Proposing and approving BravaGuard upgrade...`);
    
    try {
      // Try multicall first
      const multicallData = [
        transactionRegistry.interface.encodeFunctionData('proposeTransaction', [guardUpdateTxHash]),
        transactionRegistry.interface.encodeFunctionData('approveTransaction', [guardUpdateTxHash])
      ];
      
      console.log(`Executing multicall with ${multicallData.length} operations...`);
      const tx = await transactionRegistry.multicall(multicallData);
      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Multicall executed successfully: ${tx.hash}`);
      console.log(`Gas used: ${receipt?.gasUsed || 'unknown'}`);
      guardResult.approvalTx = tx.hash;
    } catch (error) {
      console.error(`❌ Multicall failed: ${error}`);
      
      // Try individual transactions
      console.log(`\nTrying individual transactions...`);
      
      try {
        console.log(`Proposing BravaGuard update transaction...`);
        console.log(`Hash to propose: ${guardUpdateTxHash}`);
        const proposeTx = await transactionRegistry.proposeTransaction(guardUpdateTxHash);
        await proposeTx.wait();
        console.log(`✅ BravaGuard update transaction proposed`);
        guardResult.proposalTx = proposeTx.hash;
        
        // Wait a second to ensure proper sequencing
        await new Promise(r => setTimeout(r, 1000));
        
        console.log(`Approving BravaGuard update transaction...`);
        console.log(`Hash to approve: ${guardUpdateTxHash}`);
        console.log(`Current timestamp: ${Math.floor(Date.now() / 1000)}`);
        
        // Check if there's an active proposal
        const proposal = await transactionRegistry.transactionProposals(guardUpdateTxHash);
        console.log(`Proposal timestamp: ${proposal}`);
        
        const approveTx = await transactionRegistry.approveTransaction(guardUpdateTxHash);
        await approveTx.wait();
        console.log(`✅ BravaGuard update transaction approved`);
        guardResult.approvalTx = approveTx.hash;
      } catch (error) {
        console.error(`❌ Failed to process BravaGuard update: ${error}`);
      }
    }
    
    // Verify final state
    const finalGuardUpdateApproved = await transactionRegistry.isApprovedTransaction(guardUpdateTxHash);
    guardResult.isApproved = finalGuardUpdateApproved;
    
    console.log(`\n📊 OLD TRANSACTION REGISTRY APPROVAL STATUS:`);
    console.log(`• BravaGuard Update: ${finalGuardUpdateApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}`);
  }
  
  return {
    transactionRegistry: oldTransactionRegistry,
    guardUpdate: guardResult
  };
}

// Approve FeeTakeSafeModule transactions in NEW TransactionRegistry
async function approveNewUpgradeTransactions(multisigSigner: any) {
  console.log('\n\n🔄 Approving FeeTakeSafeModule transactions in NEW TransactionRegistry');
  
  if (!CONFIG.NEW_TRANSACTION_REGISTRY) {
    throw new Error('NEW TransactionRegistry address is required for approving FeeTakeSafeModule transactions');
  }
  
  console.log(`Using NEW TransactionRegistry at ${CONFIG.NEW_TRANSACTION_REGISTRY}`);
  
  // 1. Generate transaction data for enabling new FeeTakeSafeModule
  console.log(`\n💰 Generating upgrade data for enabling FeeTakeSafeModule: ${CONFIG.NEW_FEE_TAKE_SAFE_MODULE}`);
  const moduleEnableData = generateEnableModuleData(CONFIG.NEW_FEE_TAKE_SAFE_MODULE);
  const moduleEnableTxHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [moduleEnableData]));

  console.log(`Transaction data: ${moduleEnableData}`);
  console.log(`Transaction hash: ${moduleEnableTxHash}`);
  console.log(`Data from script:`, moduleEnableData);
  console.log(`TxHash from script:`, moduleEnableTxHash);
  
  // 2. Generate transaction data for disabling old FeeTakeSafeModule
  console.log(`\n🗑️ Generating data for disabling old FeeTakeSafeModule: ${CONFIG.CURRENT.FEE_TAKE_SAFE_MODULE || 'Not specified - will use dummy address'}`);
  
  // Always use the new module as the previous module
  const prevModuleAddress = CONFIG.NEW_FEE_TAKE_SAFE_MODULE;
  
  // If no old module is specified, use a dummy address for the disable call
  // This will likely fail when executed but will be approved in the registry
  const oldModuleAddress = CONFIG.CURRENT.FEE_TAKE_SAFE_MODULE || '0x0000000000000000000000000000000000000123';
  
  const moduleDisableData = generateDisableModuleData(prevModuleAddress, oldModuleAddress);
  const moduleDisableTxHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [moduleDisableData]));
  
  console.log(`Previous module address: ${prevModuleAddress}`);
  console.log(`Module to disable address: ${oldModuleAddress}`);
  console.log(`Transaction data: ${moduleDisableData}`);
  console.log(`Transaction hash: ${moduleDisableTxHash}`);
  console.log(`Data from script:`, moduleDisableData);
  console.log(`TxHash from script:`, moduleDisableTxHash);
  
  // Connect to NEW TransactionRegistry
  const transactionRegistry = await ethers.getContractAt('TransactionRegistry', CONFIG.NEW_TRANSACTION_REGISTRY, multisigSigner);
  
  // Check if already approved
  const isModuleEnableApproved = await transactionRegistry.isApprovedTransaction(moduleEnableTxHash);
  console.log(`FeeTakeSafeModule enable already approved: ${isModuleEnableApproved}`);
  
  const isModuleDisableApproved = await transactionRegistry.isApprovedTransaction(moduleDisableTxHash);
  console.log(`FeeTakeSafeModule disable already approved: ${isModuleDisableApproved}`);
  
  const moduleEnableResult = {
    data: moduleEnableData,
    hash: moduleEnableTxHash,
    wasAlreadyApproved: isModuleEnableApproved,
    isApproved: isModuleEnableApproved,
    proposalTx: '',
    approvalTx: ''
  };
  
  const moduleDisableResult = {
    data: moduleDisableData,
    hash: moduleDisableTxHash,
    wasAlreadyApproved: isModuleDisableApproved,
    isApproved: isModuleDisableApproved,
    proposalTx: '',
    approvalTx: ''
  };
  
  if (!isModuleEnableApproved || !isModuleDisableApproved) {
    console.log(`\n🔄 Proposing and approving FeeTakeSafeModule transactions...`);
    
    // Prepare multicall data
    const multicallData = [];
    
    if (!isModuleEnableApproved) {
      console.log(`Adding FeeTakeSafeModule enable to multicall...`);
      multicallData.push(
        transactionRegistry.interface.encodeFunctionData('proposeTransaction', [moduleEnableTxHash]),
        transactionRegistry.interface.encodeFunctionData('approveTransaction', [moduleEnableTxHash])
      );
    }
    
    if (!isModuleDisableApproved) {
      console.log(`Adding FeeTakeSafeModule disable to multicall...`);
      multicallData.push(
        transactionRegistry.interface.encodeFunctionData('proposeTransaction', [moduleDisableTxHash]),
        transactionRegistry.interface.encodeFunctionData('approveTransaction', [moduleDisableTxHash])
      );
    }
    
    if (multicallData.length > 0) {
      try {
        // Execute the multicall
        console.log(`Executing multicall with ${multicallData.length} operations...`);
        const tx = await transactionRegistry.multicall(multicallData);
        console.log(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Multicall executed successfully: ${tx.hash}`);
        console.log(`Gas used: ${receipt?.gasUsed || 'unknown'}`);
        
        if (!isModuleEnableApproved) moduleEnableResult.approvalTx = tx.hash;
        if (!isModuleDisableApproved) moduleDisableResult.approvalTx = tx.hash;
      } catch (error) {
        console.error(`❌ Multicall failed: ${error}`);
        
        // Try individual transactions
        console.log(`\nTrying individual transactions...`);
        
        if (!isModuleEnableApproved) {
          try {
            console.log(`Proposing FeeTakeSafeModule enable transaction...`);
            const proposeTx = await transactionRegistry.proposeTransaction(moduleEnableTxHash);
            await proposeTx.wait();
            console.log(`✅ FeeTakeSafeModule enable transaction proposed`);
            moduleEnableResult.proposalTx = proposeTx.hash;
            
            // Wait a second to ensure proper sequencing
            await new Promise(r => setTimeout(r, 1000));
            
            console.log(`Approving FeeTakeSafeModule enable transaction...`);
            console.log(`Current timestamp: ${Math.floor(Date.now() / 1000)}`);
            
            // Check if there's an active proposal
            const moduleProposal = await transactionRegistry.transactionProposals(moduleEnableTxHash);
            console.log(`Proposal timestamp: ${moduleProposal}`);
            
            const approveTx = await transactionRegistry.approveTransaction(moduleEnableTxHash);
            await approveTx.wait();
            console.log(`✅ FeeTakeSafeModule enable transaction approved`);
            moduleEnableResult.approvalTx = approveTx.hash;
          } catch (error) {
            console.error(`❌ Failed to process FeeTakeSafeModule enable: ${error}`);
          }
        }
        
        if (!isModuleDisableApproved) {
          try {
            console.log(`Proposing FeeTakeSafeModule disable transaction...`);
            const proposeTx = await transactionRegistry.proposeTransaction(moduleDisableTxHash);
            await proposeTx.wait();
            console.log(`✅ FeeTakeSafeModule disable transaction proposed`);
            moduleDisableResult.proposalTx = proposeTx.hash;
            
            // Wait a second to ensure proper sequencing
            await new Promise(r => setTimeout(r, 1000));
            
            console.log(`Approving FeeTakeSafeModule disable transaction...`);
            console.log(`Current timestamp: ${Math.floor(Date.now() / 1000)}`);
            
            // Check if there's an active proposal
            const moduleProposal = await transactionRegistry.transactionProposals(moduleDisableTxHash);
            console.log(`Proposal timestamp: ${moduleProposal}`);
            
            const approveTx = await transactionRegistry.approveTransaction(moduleDisableTxHash);
            await approveTx.wait();
            console.log(`✅ FeeTakeSafeModule disable transaction approved`);
            moduleDisableResult.approvalTx = approveTx.hash;
          } catch (error) {
            console.error(`❌ Failed to process FeeTakeSafeModule disable: ${error}`);
          }
        }
      }
    }
    
    // Verify final state
    const finalModuleEnableApproved = await transactionRegistry.isApprovedTransaction(moduleEnableTxHash);
    const finalModuleDisableApproved = await transactionRegistry.isApprovedTransaction(moduleDisableTxHash);
    
    moduleEnableResult.isApproved = finalModuleEnableApproved;
    moduleDisableResult.isApproved = finalModuleDisableApproved;
    
    console.log(`\n📊 NEW TRANSACTION REGISTRY APPROVAL STATUS:`);
    console.log(`• FeeTakeSafeModule Enable: ${finalModuleEnableApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}`);
    console.log(`• FeeTakeSafeModule Disable: ${finalModuleDisableApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}`);
  }
  
  return {
    transactionRegistry: CONFIG.NEW_TRANSACTION_REGISTRY,
    moduleEnable: moduleEnableResult,
    moduleDisable: moduleDisableResult
  };
}

// Main function
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`\n\n🚀 Script started with account: ${deployerAddress}`);
  
  // Validate configurations
  if (!CONFIG.OLD_TRANSACTION_REGISTRY && !CONFIG.TRANSACTION_REGISTRY) {
    throw new Error('OLD_TRANSACTION_REGISTRY address is required for BravaGuard upgrade. Set the OLD_TRANSACTION_REGISTRY or TRANSACTION_REGISTRY environment variable.');
  }
  
  if (!CONFIG.NEW_BRAVA_GUARD) {
    throw new Error('NEW_BRAVA_GUARD address is required. Set the NEW_BRAVA_GUARD environment variable.');
  }
  
  if (!CONFIG.NEW_FEE_TAKE_SAFE_MODULE) {
    throw new Error('NEW_FEE_TAKE_SAFE_MODULE address is required. Set the NEW_FEE_TAKE_SAFE_MODULE environment variable.');
  }
  
  if (!CONFIG.CURRENT.MULTISIG) {
    throw new Error('MULTISIG address is required. Set the CURRENT_MULTISIG environment variable.');
  }
  
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`Using configuration:
  • OLD Transaction Registry: ${CONFIG.OLD_TRANSACTION_REGISTRY || CONFIG.TRANSACTION_REGISTRY}
  • NEW Transaction Registry: ${CONFIG.NEW_TRANSACTION_REGISTRY || 'Not specified - will skip FeeTakeSafeModule transactions'}
  • BravaGuard: ${CONFIG.NEW_BRAVA_GUARD}
  • New FeeTakeSafeModule: ${CONFIG.NEW_FEE_TAKE_SAFE_MODULE}
  • Current FeeTakeSafeModule: ${CONFIG.CURRENT.FEE_TAKE_SAFE_MODULE || 'Not specified'}
  • Safe/Multisig: ${CONFIG.CURRENT.SAFE}
  • Is Testnet: ${CONFIG.IS_TESTNET}
  • Remove Old Module: ${CONFIG.REMOVE_OLD_MODULE}
  `);
  
  // Set up multisig impersonation
  console.log(`\n🔄 Impersonating multisig account: ${CONFIG.CURRENT.MULTISIG}`);
  
  try {
    // Determine which TransactionRegistry address will be used for the OLD deployment
    const oldTransactionRegistry = CONFIG.OLD_TRANSACTION_REGISTRY || CONFIG.TRANSACTION_REGISTRY;
    
    // Check if the code exists at the OLD TransactionRegistry address
    const code = await ethers.provider.getCode(oldTransactionRegistry);
    if (code === '0x') {
      throw new Error(`No contract found at OLD TransactionRegistry address: ${oldTransactionRegistry}`);
    }
    
    console.log(`✅ Validated contract exists at OLD TransactionRegistry: ${oldTransactionRegistry}`);
    
    // Setup impersonation
    await ethers.provider.send('hardhat_impersonateAccount', [CONFIG.CURRENT.MULTISIG]);
    const multisigSigner = await ethers.getSigner(CONFIG.CURRENT.MULTISIG);
    
    // Fund the impersonated signer if needed
    const balance = await ethers.provider.getBalance(CONFIG.CURRENT.MULTISIG);
    if (balance < ethers.parseEther('0.1')) {
      console.log('Funding multisig account with ETH...');
      await deployer.sendTransaction({
        to: CONFIG.CURRENT.MULTISIG,
        value: ethers.parseEther('1.0')
      });
      console.log(`Funded multisig with 1 ETH`);
    }
    
    console.log(`✅ Successfully impersonating multisig with balance: ${ethers.formatEther(await ethers.provider.getBalance(CONFIG.CURRENT.MULTISIG))} ETH`);
    
    // Connect to AdminVault to grant necessary roles
    console.log(`\n🔑 Checking and granting necessary roles...`);
    try {
      // First, impersonate the admin that can grant roles
      // Assuming owner role is held by the multisig itself for simplicity
      // Connect to AdminVault
      const adminVault = await ethers.getContractAt('IAdminVault', CONFIG.ADMIN_VAULT, multisigSigner);
      
      // Define required roles
      const TRANSACTION_PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TRANSACTION_PROPOSER_ROLE"));
      const TRANSACTION_EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TRANSACTION_EXECUTOR_ROLE"));
      
      // Check if multisig has the necessary roles
      const hasProposerRole = await adminVault.hasRole(TRANSACTION_PROPOSER_ROLE, CONFIG.CURRENT.MULTISIG);
      const hasExecutorRole = await adminVault.hasRole(TRANSACTION_EXECUTOR_ROLE, CONFIG.CURRENT.MULTISIG);
      
      console.log(`Current roles for multisig:
      • TRANSACTION_PROPOSER_ROLE: ${hasProposerRole ? '✅' : '❌'}
      • TRANSACTION_EXECUTOR_ROLE: ${hasExecutorRole ? '✅' : '❌'}`);
      
      // If multisig doesn't have the required roles, grant them if possible
      if (!hasProposerRole || !hasExecutorRole) {
          console.warn(`\n⚠️ WARNING: Multisig doesn't have all required roles.`);
          console.warn(`This script may fail when trying to propose or approve transactions.`);
        
      }
    } catch (error) {
      console.error(`❌ Error when checking or granting roles: ${error}`);
    }
    
    // 1. Approve BravaGuard upgrade in OLD TransactionRegistry
    const oldUpgradeResult = await approveOldUpgradeTransactions(multisigSigner);
    
    // 2. Approve FeeTakeSafeModule transactions in NEW TransactionRegistry (if configured)
    let newUpgradeResult;
    if (CONFIG.NEW_TRANSACTION_REGISTRY) {
      newUpgradeResult = await approveNewUpgradeTransactions(multisigSigner);
    } else {
      console.log('\n⚠️ NEW_TRANSACTION_REGISTRY not configured, skipping FeeTakeSafeModule transactions');
      // Create dummy results for compatibility
      newUpgradeResult = {
        transactionRegistry: '',
        moduleEnable: {
          data: '',
          hash: '',
          wasAlreadyApproved: false,
          isApproved: false,
          proposalTx: '',
          approvalTx: ''
        },
        moduleDisable: {
          data: '',
          hash: '',
          wasAlreadyApproved: false,
          isApproved: false,
          proposalTx: '',
          approvalTx: ''
        }
      };
    }
    
    // Track transaction results
    const results: ResultsData = {
      timestamp: new Date().toISOString(),
      network: {
        name: network.name,
        chainId: network.chainId.toString()
      },
      signer: await multisigSigner.getAddress(),
      contracts: {
        transactionRegistry: `OLD: ${oldUpgradeResult.transactionRegistry}, NEW: ${newUpgradeResult.transactionRegistry || 'Not configured'}`,
        newBravaGuard: CONFIG.NEW_BRAVA_GUARD,
        newFeeTakeSafeModule: CONFIG.NEW_FEE_TAKE_SAFE_MODULE,
        currentFeeTakeSafeModule: CONFIG.CURRENT.FEE_TAKE_SAFE_MODULE || ''
      },
      transactions: {
        guardUpdate: oldUpgradeResult.guardUpdate,
        moduleEnable: newUpgradeResult.moduleEnable,
        moduleDisable: newUpgradeResult.moduleDisable
      }
    };
    
    // Save the results
    await saveApprovalData(results);
    
    // Print summary
    console.log(`\n📊 FINAL APPROVAL STATUS:`);
    console.log(`• BravaGuard Update: ${oldUpgradeResult.guardUpdate.isApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}`);
    console.log(`• FeeTakeSafeModule Enable: ${newUpgradeResult.moduleEnable.isApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}`);
    console.log(`• FeeTakeSafeModule Disable: ${newUpgradeResult.moduleDisable ? newUpgradeResult.moduleDisable.isApproved ? '✅ APPROVED' : '❌ NOT APPROVED' : '❌ NOT APPROVED'}`);
    
    const allApproved = 
      oldUpgradeResult.guardUpdate.isApproved && 
      (CONFIG.NEW_TRANSACTION_REGISTRY ? 
        (newUpgradeResult.moduleEnable.isApproved && 
         newUpgradeResult.moduleDisable ? newUpgradeResult.moduleDisable.isApproved : true) : 
        true);
    
    if (allApproved) {
      console.log(`\n✅ All upgrade transactions are now approved in the TransactionRegistry`);
      console.log(`These transactions can be executed through an UpgradeAction contract`);
      
      console.log(`\n📋 Example for executing these transactions via UpgradeAction:`);
      console.log(`
// Execute BravaGuard update:
const upgradeAction = await ethers.getContractAt('UpgradeAction', '{{YOUR_UPGRADE_ACTION_ADDRESS}}');
const guardUpdateData = '${oldUpgradeResult.guardUpdate.data}';
await upgradeAction.executeAction(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [guardUpdateData]), 0);

// Execute FeeTakeSafeModule enable:
const moduleEnableData = '${newUpgradeResult.moduleEnable.data}';
await upgradeAction.executeAction(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [moduleEnableData]), 0);

// Execute FeeTakeSafeModule disable (after enabling the new module):
const moduleDisableData = '${newUpgradeResult.moduleDisable ? newUpgradeResult.moduleDisable.data : ''}';
await upgradeAction.executeAction(ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [moduleDisableData]), 0);
      `);
    } else {
      console.log(`\n⚠️ Some transactions were not successfully approved.`);
    }
    
    // Stop impersonating
    await ethers.provider.send('hardhat_stopImpersonatingAccount', [CONFIG.CURRENT.MULTISIG]);
    console.log(`\n🧹 Stopped impersonating multisig account`);
    
  } catch (error) {
    console.error(`\n❌ Script execution failed: ${error}`);
    
    // Try to clean up impersonation
    try {
      await ethers.provider.send('hardhat_stopImpersonatingAccount', [CONFIG.CURRENT.MULTISIG]);
      console.log(`\n🧹 Stopped impersonating multisig account`);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
}

// Execute main
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n❌ Script failed: ${error}`);
    process.exit(1);
  });