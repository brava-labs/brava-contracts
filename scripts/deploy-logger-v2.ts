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