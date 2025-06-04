import { ethers } from "hardhat";
import { writeFileSync } from "fs";

// Safe contract addresses - these should be updated for your target network
const SAFE_ADDRESSES = {
    // Mainnet addresses
    mainnet: {
        SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
        SAFE_SINGLETON: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
        SAFE_SETUP: "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb",
        COMPATIBILITY_FALLBACK_HANDLER: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99"
    },
    // Add other networks as needed
    goerli: {
        SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
        SAFE_SINGLETON: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
        SAFE_SETUP: "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb",
        COMPATIBILITY_FALLBACK_HANDLER: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99"
    }
};

// Default Brava infrastructure addresses
const BRAVA_INFRASTRUCTURE = {
    // Use your existing deployed AdminVault (behind proxy)
    ADMIN_VAULT: "0xca63cB852606961698670eAfd6e6Ca2853Df2C5c",
    // Add your Logger proxy address here
    LOGGER: process.env.LOGGER_ADDRESS || "", // Set this to your Logger proxy address
    // Add your existing ProxyAdmin address here (the one managing Logger proxy)
    PROXY_ADMIN: process.env.PROXY_ADMIN_ADDRESS || "" // Set this to your existing ProxyAdmin address
};

interface DeploymentResult {
    network: string;
    timestamp: string;
    contracts: {
        safeSetupRegistry: string;
        safeDeployment: string;
    };
    addresses: {
        adminVault: string;
        logger: string;
        safeProxyFactory: string;
        safeSingleton: string;
        safeSetup: string;
    };
    roles: {
        proposerRole: string;
        executorRole: string;
        cancelerRole: string;
        disposerRole: string;
    };
}

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const networkName = network.name;

    console.log("Deploying Safe Deployment System...");
    console.log("Network:", networkName);
    console.log("Deployer:", deployer.address);
    console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    // Get Safe addresses for the current network
    const safeAddresses = SAFE_ADDRESSES[networkName as keyof typeof SAFE_ADDRESSES];
    if (!safeAddresses) {
        throw new Error(`Safe addresses not configured for network: ${networkName}`);
    }

    console.log("Using Safe addresses:", safeAddresses);

    // Use existing Brava infrastructure or environment variables
    const adminVaultAddress = process.env.ADMIN_VAULT_ADDRESS || BRAVA_INFRASTRUCTURE.ADMIN_VAULT;
    const loggerAddress = process.env.LOGGER_ADDRESS || BRAVA_INFRASTRUCTURE.LOGGER;
    const proxyAdminAddress = process.env.PROXY_ADMIN_ADDRESS || BRAVA_INFRASTRUCTURE.PROXY_ADMIN;

    if (!adminVaultAddress || !loggerAddress || !proxyAdminAddress) {
        throw new Error(`
Missing required addresses. Please set environment variables or update BRAVA_INFRASTRUCTURE:
- ADMIN_VAULT_ADDRESS: ${adminVaultAddress || 'NOT SET'}
- LOGGER_ADDRESS: ${loggerAddress || 'NOT SET'}
- PROXY_ADMIN_ADDRESS: ${proxyAdminAddress || 'NOT SET'}

For using existing Brava infrastructure:
- AdminVault (proxy): ${BRAVA_INFRASTRUCTURE.ADMIN_VAULT}
- Logger (proxy): Update BRAVA_INFRASTRUCTURE.LOGGER in this script
- ProxyAdmin (managing Logger proxy): Update BRAVA_INFRASTRUCTURE.PROXY_ADMIN in this script
        `);
    }

    console.log("Using existing AdminVault (proxy):", adminVaultAddress);
    console.log("Using existing Logger (proxy):", loggerAddress);
    console.log("Using existing ProxyAdmin (managing Logger proxy):", proxyAdminAddress);

    // Verify the AdminVault is accessible
    console.log("\nVerifying AdminVault access...");
    const adminVault = await ethers.getContractAt("AdminVault", adminVaultAddress);
    try {
        const hasOwnerRole = await adminVault.hasRole(ethers.id("OWNER_ROLE"), deployer.address);
        const hasManagerRole = await adminVault.hasRole(ethers.id("ROLE_MANAGER_ROLE"), deployer.address);
        console.log("Deployer has OWNER_ROLE:", hasOwnerRole);
        console.log("Deployer has ROLE_MANAGER_ROLE:", hasManagerRole);
        
        if (!hasOwnerRole && !hasManagerRole) {
            console.warn("⚠️  WARNING: Deployer has no admin roles in AdminVault");
            console.warn("   You'll need admin access to grant roles for Safe deployment");
        }
    } catch (error: any) {
        console.warn("⚠️  Could not verify AdminVault roles:", error.message);
    }

    // Deploy SafeSetupRegistry implementation
    console.log("\nDeploying SafeSetupRegistry implementation...");
    const SafeSetupRegistryFactory = await ethers.getContractFactory("SafeSetupRegistry");
    const safeSetupRegistryImpl = await SafeSetupRegistryFactory.deploy();
    await safeSetupRegistryImpl.waitForDeployment();
    console.log("SafeSetupRegistry implementation deployed to:", await safeSetupRegistryImpl.getAddress());

    // Deploy SafeDeployment implementation
    console.log("\nDeploying SafeDeployment implementation...");
    const SafeDeploymentFactory = await ethers.getContractFactory("SafeDeployment");
    const safeDeploymentImpl = await SafeDeploymentFactory.deploy();
    await safeDeploymentImpl.waitForDeployment();
    console.log("SafeDeployment implementation deployed to:", await safeDeploymentImpl.getAddress());

    console.log("\n" + "=".repeat(60));
    console.log("PROXY DEPLOYMENT OPTIONS");
    console.log("=".repeat(60));
    
    if (proxyAdminAddress && proxyAdminAddress !== "") {
        console.log("✅ ProxyAdmin available for proxy deployment");
        console.log("\nTo deploy behind proxies using your existing ProxyAdmin:");
        console.log("\n1. Deploy SafeSetupRegistry proxy:");
        console.log(`   npx hardhat run --network ${networkName} scripts/deploy-proxy.js \\`);
        console.log(`     --implementation ${await safeSetupRegistryImpl.getAddress()} \\`);
        console.log(`     --proxy-admin ${proxyAdminAddress} \\`);
        console.log(`     --init-data "initialize(address,address)" \\`);
        console.log(`     --init-args "${adminVaultAddress},${loggerAddress}"`);
        
        console.log("\n2. Deploy SafeDeployment proxy:");
        console.log(`   npx hardhat run --network ${networkName} scripts/deploy-proxy.js \\`);
        console.log(`     --implementation ${await safeDeploymentImpl.getAddress()} \\`);
        console.log(`     --proxy-admin ${proxyAdminAddress} \\`);
        console.log(`     --init-data "initialize(address,address,address,address,address,address)" \\`);
        console.log(`     --init-args "${adminVaultAddress},${loggerAddress},${safeAddresses.SAFE_PROXY_FACTORY},${safeAddresses.SAFE_SINGLETON},${safeAddresses.SAFE_SETUP},<SETUP_REGISTRY_PROXY_ADDRESS>"`);
        
        console.log("\n⚠️  IMPORTANT: Replace <SETUP_REGISTRY_PROXY_ADDRESS> with the actual proxy address from step 1");
        console.log("\n✅ Benefits of proxy deployment:");
        console.log("   - Upgradeability while maintaining contract addresses");
        console.log("   - Deterministic Safe addresses remain consistent across upgrades");
        console.log("   - Centralized proxy management with existing ProxyAdmin");
    } else {
        console.log("⚠️  No ProxyAdmin address provided");
        console.log("   Deploying as implementation contracts only (not upgradeable)");
        console.log("   To deploy behind proxies later, set PROXY_ADMIN_ADDRESS environment variable");
    }

    // For demonstration, initialize the implementations directly
    // In production, you would initialize the proxies instead
    console.log("\n" + "=".repeat(60));
    console.log("IMPLEMENTATION INITIALIZATION (FOR TESTING)");
    console.log("=".repeat(60));
    console.log("Note: In production, initialize the proxies, not the implementations");

    // Initialize SafeSetupRegistry implementation
    console.log("\nInitializing SafeSetupRegistry implementation...");
    await safeSetupRegistryImpl.initialize(adminVaultAddress, loggerAddress);
    console.log("SafeSetupRegistry implementation initialized");

    // Initialize SafeDeployment implementation
    console.log("\nInitializing SafeDeployment implementation...");
    await safeDeploymentImpl.initialize(
        adminVaultAddress,
        loggerAddress,
        safeAddresses.SAFE_PROXY_FACTORY,
        safeAddresses.SAFE_SINGLETON,
        safeAddresses.SAFE_SETUP,
        await safeSetupRegistryImpl.getAddress()
    );
    console.log("SafeDeployment implementation initialized");

    // Verify deployment
    console.log("\nVerifying deployment...");
    console.log("SafeSetupRegistry adminVault:", await safeSetupRegistryImpl.ADMIN_VAULT());
    console.log("SafeSetupRegistry logger:", await safeSetupRegistryImpl.LOGGER());
    console.log("SafeDeployment safeSingleton:", await safeDeploymentImpl.getSafeSingleton());
    console.log("SafeDeployment safeProxyFactory:", await safeDeploymentImpl.getSafeProxyFactory());
    console.log("SafeDeployment setupRegistry:", await safeDeploymentImpl.getSetupRegistry());

    // Prepare deployment result
    const deploymentResult: DeploymentResult = {
        network: networkName,
        timestamp: new Date().toISOString(),
        contracts: {
            safeSetupRegistry: await safeSetupRegistryImpl.getAddress(),
            safeDeployment: await safeDeploymentImpl.getAddress()
        },
        addresses: {
            adminVault: adminVaultAddress,
            logger: loggerAddress,
            safeProxyFactory: safeAddresses.SAFE_PROXY_FACTORY,
            safeSingleton: safeAddresses.SAFE_SINGLETON,
            safeSetup: safeAddresses.SAFE_SETUP
        },
        roles: {
            proposerRole: ethers.id("TRANSACTION_PROPOSER_ROLE"),
            executorRole: ethers.id("TRANSACTION_EXECUTOR_ROLE"),
            cancelerRole: ethers.id("TRANSACTION_CANCELER_ROLE"),
            disposerRole: ethers.id("TRANSACTION_DISPOSER_ROLE")
        }
    };

    // Save deployment result
    const filename = `safe-deployment-${networkName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(filename, JSON.stringify(deploymentResult, null, 2));
    console.log(`\nDeployment result saved to: ${filename}`);

    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log(`Network: ${networkName}`);
    console.log(`SafeSetupRegistry implementation: ${await safeSetupRegistryImpl.getAddress()}`);
    console.log(`SafeDeployment implementation: ${await safeDeploymentImpl.getAddress()}`);
    console.log(`Using AdminVault (proxy): ${adminVaultAddress}`);
    console.log(`Using Logger (proxy): ${loggerAddress}`);
    if (proxyAdminAddress && proxyAdminAddress !== "") {
        console.log(`Using ProxyAdmin: ${proxyAdminAddress}`);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("RECOMMENDED NEXT STEPS");
    console.log("=".repeat(60));
    
    if (proxyAdminAddress && proxyAdminAddress !== "") {
        console.log("✅ RECOMMENDED: Deploy behind proxies for upgradeability");
        console.log("\n1. Deploy proxies using the commands shown above");
        console.log("2. Use the proxy addresses (not implementation addresses) in your application");
        console.log("3. Grant appropriate roles to users in AdminVault");
        console.log("4. Propose and approve initial Safe configurations");
        console.log("5. Test Safe deployment with approved configurations");
        
        console.log("\n📝 Proxy Management Benefits:");
        console.log("   - Safe addresses remain deterministic across upgrades");
        console.log("   - Centralized upgrade control with existing ProxyAdmin");
        console.log("   - Consistent proxy management across protocol");
    } else {
        console.log("⚠️  ALTERNATIVE: Using implementation contracts directly");
        console.log("   - Not upgradeable");
        console.log("   - Safe addresses will change if contracts are redeployed");
        console.log("   - Consider deploying behind proxies for production use");
    }
    
    console.log("\n🔑 Role Setup Commands (after proxy deployment):");
    console.log(`await adminVault.grantRole("${deploymentResult.roles.proposerRole}", proposerAddress);`);
    console.log(`await adminVault.grantRole("${deploymentResult.roles.executorRole}", executorAddress);`);

    return deploymentResult;
}

// Handle script execution
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export { main as deploySafeSystem }; 