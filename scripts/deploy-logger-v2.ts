import { ethers, upgrades } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${await deployer.getAddress()}`);
  
  // Deploy Logger as upgradeable
  const Logger = await ethers.getContractFactory("Logger");
  
  console.log("Deploying Logger V2...");
  const logger = await upgrades.deployProxy(Logger, [], {
    initializer: 'initialize',
    kind: 'transparent',
  });
  
  await logger.waitForDeployment();
  const loggerAddress = await logger.getAddress();
  
  console.log("Logger V2 proxy deployed to:", loggerAddress);
  
  // Get the implementation and admin addresses
  const implAddress = await upgrades.erc1967.getImplementationAddress(loggerAddress);
  const adminAddress = await upgrades.erc1967.getAdminAddress(loggerAddress);
  
  console.log("Implementation address:", implAddress);
  console.log("Admin address:", adminAddress);
  console.log("\nImportant: Save these addresses for future reference");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 

// ===========================================================================
// STEP 1: Transfer Proxy Admin Ownership to a Safe/Multisig
// ===========================================================================
/*
async function transferProxyAdmin() {
  // The proxy address that was deployed above
  const PROXY_ADDRESS = "0x..."; // Replace with the deployed proxy address
  
  // The new admin address (usually a Gnosis Safe or other multisig)
  const NEW_ADMIN_ADDRESS = "0x..."; // Replace with your multisig/safe address
  
  console.log(`Transferring proxy admin for ${PROXY_ADDRESS} to ${NEW_ADMIN_ADDRESS}...`);
  
  // Get the ProxyAdmin contract
  const admin = await upgrades.admin.getInstance();
  
  // Transfer ownership of the proxy
  const tx = await upgrades.admin.changeProxyAdmin(PROXY_ADDRESS, NEW_ADMIN_ADDRESS);
  await tx.wait();
  
  console.log("Proxy admin transferred successfully!");
  console.log("New admin address:", NEW_ADMIN_ADDRESS);
}
*/

// ===========================================================================
// STEP 2: Upgrade Implementation (When Needed)
// ===========================================================================
/*
async function upgradeImplementation() {
  // If you've transferred admin rights to a multisig, this would need to be 
  // executed from that multisig. This is just the script you would propose to
  // the multisig to execute.
  
  // The proxy address to upgrade
  const PROXY_ADDRESS = "0x..."; // Replace with your proxy address
  
  // Get the new implementation contract factory
  const LoggerV3 = await ethers.getContractFactory("Logger"); // Make sure this is the updated contract
  
  console.log(`Upgrading implementation for proxy at ${PROXY_ADDRESS}...`);
  
  // Prepare the upgrade
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, LoggerV3);
  await upgraded.waitForDeployment();
  
  // Get the new implementation address
  const newImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  
  console.log("Upgrade completed successfully!");
  console.log("New implementation address:", newImplAddress);
}
*/ 