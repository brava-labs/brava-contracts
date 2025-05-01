import { ethers, tenderly, run } from 'hardhat';
import 'dotenv/config';

// ===== EDIT THESE VALUES =====
// Contract information
const CONTRACT_NAME = "BuyCover";
const CONTRACT_ADDRESS = "0xAF88606B38Da4ffc6D3d4F8699e49b99b616f442"; // Replace with your deployed contract address
// Constructor arguments (must match what was used during deployment)
const CONSTRUCTOR_ARGS = [
    // For BuyCover contract
    "0x02219F8B9BB7B9853AA110D687EE82e9835A13fB", // AdminVault address
    "0x99A055251170411c4505519aaeC57020B6129BB8" // Logger address
  ];
// ============================

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

async function main() {
  try {
    console.log(`Starting verification for ${CONTRACT_NAME} at ${CONTRACT_ADDRESS}`);
    
    // Verify on Etherscan
    await verifyContract(CONTRACT_ADDRESS, CONSTRUCTOR_ARGS);
    
    // Verify on Tenderly
    await verifyContractOnTenderly(CONTRACT_ADDRESS, CONTRACT_NAME);
    
    console.log("Verification complete!");
  } catch (error: any) {
    console.error("Verification failed:", error.message);
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