import { ethers, upgrades, run, tenderly } from 'hardhat';
import fs from 'fs';
import path from 'path';

/**
 * This script deploys a Logger contract with a transparent proxy in front of it.
 * It is designed to work with Ledger or MetaMask on mainnet or testnet.
 * 
 * Usage:
 * 1. Set up environment variables:
 *    - LEDGER_ENABLED=true
 *    - LEDGER_ACCOUNT=0xYourAddress
 *    - TENDERLY_AUTOMATIC_VERIFICATION=true
 *    - TENDERLY_AUTOMATIC_POPULATE_HARDHAT_VERIFY_CONFIG=true
 * 2. Make sure your Ledger is connected, unlocked and the Ethereum app is open
 * 3. Run with: npx hardhat run scripts/deploy-logger-proxy.ts --network <network_name>
 */

// Optionally verify on block explorer
const VERIFY_ON_ETHERSCAN = false;
const VERIFY_ON_TENDERLY = true;

// Configure delay between verification attempts
const VERIFICATION_RETRY_COUNT = 3;
const VERIFICATION_DELAY = 10000; // 10 seconds

async function checkLedgerStatus() {
  // Check if Ledger is configured in environment
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

async function getSigners() {
  try {
    const signers = await ethers.getSigners();
    if (!signers || signers.length === 0) {
      throw new Error("No signers available. Check your network configuration and Ledger setup.");
    }
    return signers;
  } catch (error: any) {
    console.error("❌ Error getting signers:", error.message);
    if (error.message.includes("ledger")) {
      console.error("\n⚠️ LEDGER ISSUE DETECTED!");
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
    console.log('\n====== LOGGER PROXY DEPLOYMENT ======');
    
    // Check Ledger configuration
    await checkLedgerStatus();
    
    // Get deployer account (Ledger if configured, private key otherwise)
    const signers = await getSigners();
    const deployer = signers[0];
    
    if (!deployer) {
      throw new Error("No deployer account available. Check your Ledger configuration.");
    }
    
    const deployerAddress = await deployer.getAddress();
    console.log(`🔑 Deploying using account: ${deployerAddress}`);
    
    // Get network information
    const network = await ethers.provider.getNetwork();
    console.log(`📡 Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Check if user is using Ledger or a similar wallet
    const walletType = ethers.provider.constructor.name;
    console.log(`💼 Wallet type: ${walletType}`);
    
    // Verification check - Make sure user is really ready to deploy
    const balance = await ethers.provider.getBalance(deployerAddress);
    console.log(`💰 Account balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther('0.1')) {
      console.log('⚠️ WARNING: Account balance is less than 0.1 ETH. This may not be enough for deployment.');
      console.log('Please make sure you have enough ETH to cover gas costs.');
    }
    
    console.log('\n🚀 Preparing to deploy Logger with transparent proxy...');
    
    // Deploy Logger with transparent proxy
    const Logger = await ethers.getContractFactory('Logger', deployer);
    
    console.log('📝 Deploying Logger with proxy...');
    console.log('⏳ This may take a moment. Please confirm the transaction on your Ledger when prompted.');
    
    // Deploy with proxy using OpenZeppelin's upgrades plugin
    let logger = await upgrades.deployProxy(Logger, [], {
      initializer: 'initialize',
      kind: 'transparent',
    });
    
    // Important: must wait for deployment and capture the returned contract
    logger = await logger.waitForDeployment();
    const loggerAddress = await logger.getAddress();
    
    console.log(`✅ Logger proxy deployed to: ${loggerAddress}`);
    
    // Get implementation and admin addresses
    const implAddress = await upgrades.erc1967.getImplementationAddress(loggerAddress);
    const adminAddress = await upgrades.erc1967.getAdminAddress(loggerAddress);
    
    console.log(`📊 Logger implementation address: ${implAddress}`);
    console.log(`👑 ProxyAdmin address: ${adminAddress}`);
    
    // Verification - Option 1: Verify on Etherscan
    if (VERIFY_ON_ETHERSCAN) {
      console.log('\n🔍 Verifying implementation contract on Etherscan...');
      try {
        await verifyOnEtherscan(implAddress, []);
        console.log('✅ Logger implementation verified on Etherscan');
      } catch (error: any) {
        console.log(`❌ Failed to verify implementation on Etherscan: ${error.message}`);
      }
    }
    
    // Verification - Option 2: Verify on Tenderly
    if (VERIFY_ON_TENDERLY) {
      console.log('\n🔍 Verifying on Tenderly...');
      try {
        // First verify the implementation - this part works reliably
        console.log('Verifying Logger implementation...');
        await tenderly.verify({
          name: 'Logger',
          address: implAddress,
        });
        console.log('✅ Logger implementation verified on Tenderly');
        
        // For the proxy, we'll provide guidance since automated verification has limitations
        console.log('\n📋 About proxy verification:');
        console.log('The proxy contract may already be recognized in Tenderly through the implementation.');
        console.log('To check your contracts in Tenderly Dashboard:');
        
        // Format URLs for easy viewing
        const tenderlyProject = process.env.TENDERLY_PROJECT || 'your-project';
        const tenderlyUsername = process.env.TENDERLY_USERNAME || 'your-username';
        const network = 'mainnet'; // or the current network
        
        console.log(`1. View Logger implementation: https://dashboard.tenderly.co/${tenderlyUsername}/${tenderlyProject}/${network}/contract/${implAddress}`);
        console.log(`2. View Logger proxy: https://dashboard.tenderly.co/${tenderlyUsername}/${tenderlyProject}/${network}/contract/${loggerAddress}`);
        console.log(`3. View ProxyAdmin: https://dashboard.tenderly.co/${tenderlyUsername}/${tenderlyProject}/${network}/contract/${adminAddress}`);
        
        console.log('\nNote: Tenderly may automatically detect proxy patterns even if verification shows warnings.');
      } catch (error: any) {
        console.log(`❌ Failed to verify on Tenderly: ${error.message}`);
        
        // Provide fallback manual instructions
        console.log('\n🔧 If verification fails, you can verify manually:');
        console.log('1. Go to https://dashboard.tenderly.co/');
        console.log(`2. Navigate to your project and select "Verify Contract"`);
        console.log(`3. For implementation, use contract name "Logger" at address: ${implAddress}`);
        console.log(`4. For proxy, use contract name "ERC1967Proxy" at address: ${loggerAddress}`);
      }
    }
    
    // Save deployment data to a file
    const deploymentData = {
      network: {
        name: network.name,
        chainId: network.chainId.toString()
      },
      deployer: deployerAddress,
      logger: {
        proxy: loggerAddress,
        implementation: implAddress,
        admin: adminAddress
      },
      timestamp: new Date().toISOString(),
      verificationStatus: {
        etherscan: VERIFY_ON_ETHERSCAN,
        tenderly: VERIFY_ON_TENDERLY
      }
    };
    
    // Save to file
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filePath = path.join(__dirname, '../', `logger-deployment-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));
    console.log(`\n📄 Deployment data saved to: ${filePath}`);
    
    console.log('\n====== DEPLOYMENT SUMMARY ======');
    console.log(`📝 Logger Proxy: ${loggerAddress}`);
    console.log(`📝 Implementation: ${implAddress}`);
    console.log(`📝 ProxyAdmin: ${adminAddress}`);
    console.log('\nThese addresses will be needed for the master-logger-upgrade.ts script.');
    console.log('You can now configure that script to use this deployed Logger proxy.');
    
    console.log('\n🔐 For production deployments:');
    console.log(`1. Transfer ownership of the ProxyAdmin (${adminAddress}) to your multisig.`);
    console.log('2. This can be done as part of the master upgrade script.');
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Helper function for Etherscan verification
async function verifyOnEtherscan(address: string, constructorArguments: any[]) {
  for (let attempt = 1; attempt <= VERIFICATION_RETRY_COUNT; attempt++) {
    try {
      await run('verify:verify', {
        address,
        constructorArguments
      });
      return;
    } catch (error: any) {
      if (error.message.includes('Already Verified')) {
        console.log('Contract already verified');
        return;
      }
      
      if (attempt === VERIFICATION_RETRY_COUNT) {
        throw error;
      }
      
      console.log(`Verification attempt ${attempt} failed, retrying in ${VERIFICATION_DELAY/1000}s...`);
      await new Promise(r => setTimeout(r, VERIFICATION_DELAY));
    }
  }
}

// Execute the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 