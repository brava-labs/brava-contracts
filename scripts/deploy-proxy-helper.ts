import { ethers } from "hardhat";

interface ProxyDeploymentParams {
    implementation: string;
    proxyAdmin: string;
    initData: string;
    description?: string;
}

/**
 * Helper function to deploy an ERC1967 proxy
 */
export async function deployProxy(params: ProxyDeploymentParams) {
    const { implementation, proxyAdmin, initData, description = "contract" } = params;
    
    console.log(`\nDeploying ${description} proxy...`);
    console.log(`Implementation: ${implementation}`);
    console.log(`ProxyAdmin: ${proxyAdmin}`);
    
    // Deploy the proxy
    const proxyFactory = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await proxyFactory.deploy(implementation, initData);
    await proxy.waitForDeployment();
    
    const proxyAddress = await proxy.getAddress();
    console.log(`${description} proxy deployed to: ${proxyAddress}`);
    
    // Transfer proxy admin to the ProxyAdmin contract
    // Note: This step depends on your proxy setup. 
    // If using OpenZeppelin's ProxyAdmin pattern, this might be automatic
    console.log(`Proxy admin should be managed by: ${proxyAdmin}`);
    
    return proxyAddress;
}

/**
 * Main function to deploy SafeDeployment system proxies
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 4) {
        console.error("Usage: npx hardhat run scripts/deploy-proxy-helper.ts -- <component> <implementation> <proxyAdmin> <adminVault> <logger> [setupRegistry]");
        console.error("Components: setup-registry, safe-deployment");
        process.exit(1);
    }
    
    const [component, implementation, proxyAdmin, adminVault, logger, setupRegistry] = args;
    
    let initData: string;
    let description: string;
    
    if (component === "setup-registry") {
        description = "SafeSetupRegistry";
        const setupRegistryInterface = new ethers.Interface([
            "function initialize(address _adminVault, address _logger)"
        ]);
        initData = setupRegistryInterface.encodeFunctionData("initialize", [adminVault, logger]);
        
    } else if (component === "safe-deployment") {
        if (!setupRegistry) {
            console.error("setupRegistry address required for safe-deployment");
            process.exit(1);
        }
        
        description = "SafeDeployment";
        
        // You'll need to get these Safe addresses for your network
        const SAFE_PROXY_FACTORY = process.env.SAFE_PROXY_FACTORY || "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
        const SAFE_SINGLETON = process.env.SAFE_SINGLETON || "0x41675C099F32341bf84BFc5382aF534df5C7461a";
        const SAFE_SETUP = process.env.SAFE_SETUP || "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb";
        
        const deploymentInterface = new ethers.Interface([
            "function initialize(address _adminVault, address _logger, address _safeProxyFactory, address _safeSingleton, address _safeSetup, address _setupRegistry)"
        ]);
        initData = deploymentInterface.encodeFunctionData("initialize", [
            adminVault, 
            logger, 
            SAFE_PROXY_FACTORY, 
            SAFE_SINGLETON, 
            SAFE_SETUP, 
            setupRegistry
        ]);
        
    } else {
        console.error("Invalid component. Use: setup-registry or safe-deployment");
        process.exit(1);
    }
    
    const proxyAddress = await deployProxy({
        implementation,
        proxyAdmin,
        initData,
        description
    });
    
    console.log(`\n✅ ${description} proxy deployed successfully!`);
    console.log(`Proxy address: ${proxyAddress}`);
    console.log(`Use this address in your application, not the implementation address.`);
    
    return proxyAddress;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export { main as deployProxyHelper }; 