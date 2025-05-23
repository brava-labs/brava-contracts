import { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import path from 'path';

// Configuration - EDIT THESE VALUES
const PROXY_ADDRESS = '0xB4Ae0e64217cFc7244693f9072585C8E80B2280f'; // The proxy address we want to update
const OLD_LOGGER_IMPL = '0x18A11c9F59C4453478b0D39948394c6EE80723b6'; // Old implementation to switch to
const NEW_LOGGER_IMPL = '0x22A27BFDaB494041E5EbA8759D80748bCAf9a5D2'; // Current implementation to switch back to

/**
 * This script toggles the implementation of the Logger proxy between 
 * the specified old and new implementations using the OZ Admin functions.
 * 
 * Usage: 
 * - Ensure the Ethereum app is open on your Ledger
 * - Run: npx hardhat run scripts/switch-logger-implementation.ts --network mainnet
 */

async function checkLedgerStatus() {
  if (process.env.LEDGER_ENABLED === 'true') {
    if (!process.env.LEDGER_ACCOUNT) {
      throw new Error("LEDGER_ACCOUNT is not set in .env file but LEDGER_ENABLED is true");
    }
    console.log(`\n🔑 Ledger configured with account: ${process.env.LEDGER_ACCOUNT}`);
    console.log("🔓 Please make sure your Ledger is connected, unlocked, and the Ethereum app is open");
    console.log("📝 Also ensure 'Contract Data' (or 'Blind Signing') is enabled in the Ethereum app settings");
  } else {
    console.log("\n🔑 Not using Ledger. Will use default provider/signer.");
  }
}

async function main() {
  try {
    console.log('\n====== LOGGER IMPLEMENTATION SWITCH ======');
    
    // Check Ledger configuration
    await checkLedgerStatus();
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log(`🔑 Using account: ${deployerAddress}`);
    
    // Check current implementation
    const currentImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
    console.log(`📊 Current implementation address: ${currentImplAddress}`);
    
    // Get admin address
    const adminAddress = await upgrades.erc1967.getAdminAddress(PROXY_ADDRESS);
    console.log(`👑 Proxy admin address: ${adminAddress}`);
    
    // Decide which implementation to use
    let targetImpl: string;
    if (currentImplAddress.toLowerCase() === NEW_LOGGER_IMPL.toLowerCase()) {
      console.log(`🔄 Switching to OLD implementation: ${OLD_LOGGER_IMPL}`);
      targetImpl = OLD_LOGGER_IMPL;
    } else {
      console.log(`🔄 Switching back to NEW implementation: ${NEW_LOGGER_IMPL}`);
      targetImpl = NEW_LOGGER_IMPL;
    }
    
    // Get the ProxyAdmin contract at the adminAddress
    const adminAbi = [
      "function upgrade(address proxy, address implementation) external",
      "function owner() external view returns (address)"
    ];
    
    const proxyAdmin = new ethers.Contract(adminAddress, adminAbi, deployer);
    
    // Check if we have ownership of the admin contract
    const adminOwner = await proxyAdmin.owner();
    console.log(`🔑 ProxyAdmin owner: ${adminOwner}`);
    
    if (adminOwner.toLowerCase() !== deployerAddress.toLowerCase()) {
      console.log(`⚠️ Warning: You (${deployerAddress}) are not the owner of the ProxyAdmin (${adminOwner})`);
      console.log(`   The transaction may fail if you don't have permission to upgrade.`);
    }
    
    // Upgrade the implementation directly using the admin contract
    console.log(`\n⏳ Upgrading implementation to ${targetImpl}...`);
    console.log('Please confirm the transaction on your Ledger when prompted.');
    
    // Call the upgrade function on the ProxyAdmin contract
    const upgradeTx = await proxyAdmin.upgrade(PROXY_ADDRESS, targetImpl);
    console.log(`📤 Transaction sent: ${upgradeTx.hash}`);
    
    // Wait for the transaction to be mined
    console.log(`⏳ Waiting for transaction confirmation...`);
    const receipt = await upgradeTx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Verify the change worked
    const newImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
    console.log(`\n📊 New implementation address: ${newImplAddress}`);
    
    if (newImplAddress.toLowerCase() !== targetImpl.toLowerCase()) {
      console.error(`❌ Implementation update failed! Expected ${targetImpl} but got ${newImplAddress}`);
    } else {
      console.log(`✅ Implementation successfully changed to ${targetImpl}`);
    }
    
    // Save a record of the change
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const network = await ethers.provider.getNetwork();
    
    const implChangeRecord = {
      proxy: PROXY_ADDRESS,
      oldImplementation: currentImplAddress,
      newImplementation: newImplAddress,
      deployer: deployerAddress,
      timestamp: timestamp,
      network: {
        name: network.name,
        chainId: network.chainId.toString()
      },
      transactionHash: upgradeTx.hash
    };
    
    const filePath = path.join(__dirname, '../', `logger-implementation-change-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(implChangeRecord, null, 2));
    console.log(`\n📄 Change record saved to: ${filePath}`);
    
  } catch (error) {
    console.error('❌ Operation failed:', error);
    console.error(error);
    process.exit(1);
  }
}

// Execute the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 