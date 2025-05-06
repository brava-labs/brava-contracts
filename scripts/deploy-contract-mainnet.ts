import { ethers, tenderly, run } from 'hardhat';
import { Signer } from 'ethers';
import 'dotenv/config';

// ===== EDIT THESE VALUES BEFORE RUNNING =====
// Set the contract name to deploy
const CONTRACT_TO_DEPLOY = "BuyCover";

// Set the constructor arguments as an array
// Example: ["0x123...", "0x456...", 1000]
const CONSTRUCTOR_ARGS = [
  // For BuyCover contract
  "0x02219F8B9BB7B9853AA110D687EE82e9835A13fB", // AdminVault address
  "0x99A055251170411c4505519aaeC57020B6129BB8" // Logger address
];
// ===========================================

// This script allows deploying any contract with constructor arguments
// Usage: 
// Set environment variables:
// CONTRACT_NAME=BuyCover CONTRACT_ARGS="0x123,0x456" npx hardhat run scripts/deploy-contract-mainnet.ts --network mainnet

async function deployContract(
  deployer: Signer,
  contractName: string,
  constructorArgs: any[] = []
) {
  console.log(`Deploying ${contractName}...`);
  const factory = await ethers.getContractFactory(contractName, deployer);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log(`${contractName} deployed to: ${contractAddress}`);
  
  return { contract, address: contractAddress };
}

async function verifyContract(
  contractAddress: string,
  constructorArgs: any[],
  contractPath?: string
) {
  console.log(`Verifying ${contractAddress} on Etherscan...`);
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
      contract: contractPath
    });
    console.log(`Successfully verified ${contractAddress} on Etherscan`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`Contract ${contractAddress} is already verified on Etherscan`);
    } else {
      console.error(`Error verifying contract at ${contractAddress}:`, error);
    }
  }
}

async function verifyContractOnTenderly(
  contractAddress: string,
  contractName: string
) {
  console.log(`Verifying ${contractName} on Tenderly...`);
  try {
    await tenderly.verify({
      name: contractName,
      address: contractAddress,
    });
    console.log(`Successfully verified ${contractName} on Tenderly`);
  } catch (error) {
    console.error(`Error verifying contract on Tenderly:`, error);
  }
}

async function checkLedgerStatus() {
  // Check if Ledger is configured in the network settings
  const networkConfig = (await ethers.provider.getNetwork()).name;
  console.log(`Using network: ${networkConfig}`);
  
  // Check for Ledger config in .env
  if (process.env.LEDGER_ENABLED === 'true') {
    if (!process.env.LEDGER_ACCOUNT) {
      throw new Error("LEDGER_ACCOUNT is not set in .env file but LEDGER_ENABLED is true");
    }
    console.log(`Ledger configured with account: ${process.env.LEDGER_ACCOUNT}`);
    console.log("Please make sure your Ledger is connected, unlocked, and the Ethereum app is open");
    console.log("Also ensure 'Contract Data' (or 'Blind Signing') is enabled in the Ethereum app settings");
  } else {
    console.log("Not using Ledger. Will use private key if configured in the environment.");
  }
}

async function getSigners() {
  try {
    const signers = await ethers.getSigners();
    if (!signers || signers.length === 0) {
      throw new Error("No signers available. Check your network configuration and Ledger/private key setup.");
    }
    return signers;
  } catch (error: any) {
    console.error("Error getting signers:", error.message);
    if (error.message.includes("ledger")) {
      console.error("\nLEDGER ISSUE DETECTED!");
      console.error("Please check:");
      console.error("1. Your Ledger device is connected and unlocked");
      console.error("2. The Ethereum app is open on your Ledger");
      console.error("3. 'Contract Data' or 'Blind Signing' is enabled in the Ethereum app settings");
      console.error("4. No other application (like MetaMask) is connected to your Ledger");
      console.error("5. Your .env file contains LEDGER_ENABLED=true and LEDGER_ACCOUNT=0xYourAddress");
    }
    throw error;
  }
}

async function main() {
  try {
    // Validate input parameters
    if (!CONTRACT_TO_DEPLOY) {
      throw new Error("CONTRACT_TO_DEPLOY is not set. Please edit the script and set this variable.");
    }

    if (CONSTRUCTOR_ARGS.some(arg => arg === "")) {
      throw new Error("Some constructor arguments are empty. Please edit the script and check CONSTRUCTOR_ARGS.");
    }
    
    console.log("Starting contract deployment to mainnet...");
    
    // Check Ledger configuration
    await checkLedgerStatus();
    
    // Get deployer account (Ledger if configured, private key otherwise)
    const signers = await getSigners();
    const deployer = signers[0];
    
    if (!deployer) {
      throw new Error("No deployer account available. Check your Ledger or private key configuration.");
    }
    
    const deployerAddress = await deployer.getAddress();
    console.log(`Deploying with account: ${deployerAddress}`);
    
    // Get network information
    const network = await ethers.provider.getNetwork();
    console.log(`Current network: ${network.name} (chainId: ${network.chainId})`);
    
    console.log(`Contract to deploy: ${CONTRACT_TO_DEPLOY}`);
    console.log(`Constructor arguments: ${CONSTRUCTOR_ARGS.length > 0 ? CONSTRUCTOR_ARGS.join(', ') : 'None'}`);
    
    // Deploy contract
    const { contract, address: contractAddress } = await deployContract(deployer, CONTRACT_TO_DEPLOY, CONSTRUCTOR_ARGS);
    
    // Verify contracts
    await verifyContract(contractAddress, CONSTRUCTOR_ARGS);
    await verifyContractOnTenderly(contractAddress, CONTRACT_TO_DEPLOY);
    
    console.log("\nDeployment summary:");
    console.log(`${CONTRACT_TO_DEPLOY} deployed to: ${contractAddress}`);
    console.log("Contract has been deployed and verified successfully");
    
    return { contract, contractAddress };
  } catch (error: any) {
    console.error("\n===== DEPLOYMENT FAILED =====");
    console.error(error.message);
    
    if (error.message.includes("could not detect network")) {
      console.error("\nNetwork issue. Make sure your RPC URL is correct in .env file (MAINNET_RPC_URL)");
    }
    
    throw error;
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 