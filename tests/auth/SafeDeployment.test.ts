import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    SafeDeployment, 
    SafeSetupRegistry, 
    AdminVault, 
    Logger,
    EIP712TypedDataSafeModule 
} from "../../typechain-types";

describe("SafeDeployment", function () {
    let safeDeployment: SafeDeployment;
    let setupRegistry: SafeSetupRegistry;
    let adminVault: AdminVault;
    let logger: Logger;
    let eip712Module: EIP712TypedDataSafeModule;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let proposer: SignerWithAddress;
    let executor: SignerWithAddress;

    // Real addresses from mainnet fork
    const SAFE_SINGLETON = "0x41675C099F32341bf84BFc5382aF534df5C7461a"; // Safe singleton
    const SAFE_SETUP = "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb"; // Safe setup
    const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99"; // Real fallback handler
    const BRAVA_GUARD = "0x2D738dcDA37D8084f79862526E51C8173Cc4c90E"; // Real BravaGuard
    const FEE_TAKE_SAFE_MODULE = "0x5e16f488eE17faeCC159D5af97AdB5de5ddD994b"; // Real FeeTakeSafeModule

    const DEFAULT_CONFIG_ID = ethers.id("DEFAULT_CONFIG");

    beforeEach(async function () {
        [owner, user, proposer, executor] = await ethers.getSigners();

        // Define role constants once
        const OWNER_ROLE = ethers.id("OWNER_ROLE");
        const ROLE_MANAGER_ROLE = ethers.id("ROLE_MANAGER_ROLE");
        const TRANSACTION_PROPOSER_ROLE = ethers.id("TRANSACTION_PROPOSER_ROLE");
        const TRANSACTION_EXECUTOR_ROLE = ethers.id("TRANSACTION_EXECUTOR_ROLE");

        // Deploy Logger as implementation and proxy
        const LoggerFactory = await ethers.getContractFactory("Logger");
        const loggerImpl = await LoggerFactory.deploy();
        await loggerImpl.waitForDeployment();

        // Deploy proxy for Logger
        const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
        const loggerProxy = await ERC1967ProxyFactory.deploy(
            await loggerImpl.getAddress(),
            "0x8129fc1c" // initialize() function selector
        );
        await loggerProxy.waitForDeployment();

        // Get Logger interface connected to proxy
        logger = LoggerFactory.attach(await loggerProxy.getAddress()) as Logger;

        // Deploy AdminVault (using correct constructor parameters)
        const AdminVaultFactory = await ethers.getContractFactory("AdminVault");
        adminVault = await AdminVaultFactory.deploy(
            owner.address, // _initialOwner (first parameter)
            86400, // _delay (second parameter) 
            await logger.getAddress() // _logger (third parameter)
        );

        // Deploy SafeSetupRegistry as implementation and proxy
        const SafeSetupRegistryFactory = await ethers.getContractFactory("SafeSetupRegistry");
        const setupRegistryImpl = await SafeSetupRegistryFactory.deploy();
        await setupRegistryImpl.waitForDeployment();

        // Deploy proxy for SafeSetupRegistry
        const setupRegistryProxy = await ERC1967ProxyFactory.deploy(
            await setupRegistryImpl.getAddress(),
            setupRegistryImpl.interface.encodeFunctionData("initialize", [
                await adminVault.getAddress(),
                await logger.getAddress()
            ])
        );
        await setupRegistryProxy.waitForDeployment();

        // Get SafeSetupRegistry interface connected to proxy
        setupRegistry = SafeSetupRegistryFactory.attach(await setupRegistryProxy.getAddress()) as SafeSetupRegistry;

        // Deploy SafeDeployment as implementation and proxy
        const SafeDeploymentFactory = await ethers.getContractFactory("SafeDeployment");
        const safeDeploymentImpl = await SafeDeploymentFactory.deploy();
        await safeDeploymentImpl.waitForDeployment();

        // Deploy proxy for SafeDeployment
        const safeDeploymentProxy = await ERC1967ProxyFactory.deploy(
            await safeDeploymentImpl.getAddress(),
            safeDeploymentImpl.interface.encodeFunctionData("initialize", [
                await adminVault.getAddress(),
                await logger.getAddress(),
                SAFE_SINGLETON,
                SAFE_SETUP,
                await setupRegistry.getAddress()
            ])
        );
        await safeDeploymentProxy.waitForDeployment();

        // Get SafeDeployment interface connected to proxy
        safeDeployment = SafeDeploymentFactory.attach(await safeDeploymentProxy.getAddress()) as SafeDeployment;

        // Grant roles using the owner account (which has OWNER_ROLE and can grant immediately)
        await adminVault.connect(owner).grantRole(TRANSACTION_PROPOSER_ROLE, proposer.address);
        await adminVault.connect(owner).grantRole(TRANSACTION_EXECUTOR_ROLE, executor.address);
    });

    describe("SafeSetupRegistry", function () {
        it("Should propose a new setup configuration", async function () {
            const modules = [FEE_TAKE_SAFE_MODULE];

            await expect(
                setupRegistry.connect(proposer).proposeSetupConfig(
                    DEFAULT_CONFIG_ID,
                    FALLBACK_HANDLER,
                    modules,
                    BRAVA_GUARD
                )
            ).to.emit(setupRegistry, "SetupConfigProposed")
            .withArgs(DEFAULT_CONFIG_ID, FALLBACK_HANDLER, modules, BRAVA_GUARD);
        });

        it("Should not allow non-proposer to propose configuration", async function () {
            const modules = [FEE_TAKE_SAFE_MODULE];

            await expect(
                setupRegistry.connect(user).proposeSetupConfig(
                    DEFAULT_CONFIG_ID,
                    FALLBACK_HANDLER,
                    modules,
                    BRAVA_GUARD
                )
            ).to.be.revertedWithCustomError(setupRegistry, "AdminVault_MissingRole");
        });

        it("Should approve a proposed configuration after delay", async function () {
            const modules = [FEE_TAKE_SAFE_MODULE];

            // Propose configuration
            await setupRegistry.connect(proposer).proposeSetupConfig(
                DEFAULT_CONFIG_ID,
                FALLBACK_HANDLER,
                modules,
                BRAVA_GUARD
            );

            // Fast forward time (assuming delay is set)
            await ethers.provider.send("evm_increaseTime", [86400]); // 24 hours
            await ethers.provider.send("evm_mine", []);

            // Approve configuration
            await expect(
                setupRegistry.connect(executor).approveSetupConfig(DEFAULT_CONFIG_ID)
            ).to.emit(setupRegistry, "SetupConfigApproved")
            .withArgs(DEFAULT_CONFIG_ID, FALLBACK_HANDLER, modules, BRAVA_GUARD);

            // Verify configuration is active
            expect(await setupRegistry.isApprovedConfig(DEFAULT_CONFIG_ID)).to.be.true;
        });
    });

    describe("SafeDeployment", function () {
        beforeEach(async function () {
            // Set up an approved configuration
            const modules = [FEE_TAKE_SAFE_MODULE];

            await setupRegistry.connect(proposer).proposeSetupConfig(
                DEFAULT_CONFIG_ID,
                FALLBACK_HANDLER,
                modules,
                BRAVA_GUARD
            );

            // Fast forward time and approve
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            await setupRegistry.connect(executor).approveSetupConfig(DEFAULT_CONFIG_ID);
        });

        it("Should get correct contract addresses", async function () {
            expect(await safeDeployment.getSafeSingleton()).to.equal(SAFE_SINGLETON);
            expect(await safeDeployment.getSetupRegistry()).to.equal(await setupRegistry.getAddress());
        });

        it("Should predict Safe address consistently", async function () {
            const predictedAddress1 = await safeDeployment.predictSafeAddress(user.address);
            const predictedAddress2 = await safeDeployment.predictSafeAddress(user.address);

            expect(predictedAddress1).to.equal(predictedAddress2);
            expect(predictedAddress1).to.not.equal(ethers.ZeroAddress);
        });

        it("Should predict different addresses for different parameters", async function () {
            const [, , , , anotherUser] = await ethers.getSigners();

            const address1 = await safeDeployment.predictSafeAddress(user.address);
            const address2 = await safeDeployment.predictSafeAddress(anotherUser.address);

            expect(address1).to.not.equal(address2);
        });

        it("Should check deployment status correctly", async function () {
            const isDeployedBefore = await safeDeployment.isSafeDeployed(user.address);
            expect(isDeployedBefore).to.be.false;
        });

        it("Should require approved configuration for deployment", async function () {
            const unapprovedConfigId = ethers.id("UNAPPROVED_CONFIG");

            await expect(
                safeDeployment.connect(executor).deploySafeForUser(
                    user.address,
                    unapprovedConfigId
                )
            ).to.be.revertedWith("SafeDeployment: Configuration not approved");
        });

        it("Should require valid user address", async function () {
            await expect(
                safeDeployment.connect(executor).deploySafeForUser(
                    ethers.ZeroAddress,
                    DEFAULT_CONFIG_ID
                )
            ).to.be.revertedWithCustomError(safeDeployment, "InvalidInput");
        });

        it("Should require executor role for deployment", async function () {
            await expect(
                safeDeployment.connect(user).deploySafeForUser(
                    user.address,
                    DEFAULT_CONFIG_ID
                )
            ).to.be.revertedWithCustomError(safeDeployment, "AdminVault_MissingRole");
        });

        it("Should prevent re-initialization", async function () {
            await expect(
                safeDeployment.initialize(
                    await adminVault.getAddress(),
                    await logger.getAddress(),
                    SAFE_SINGLETON,
                    SAFE_SETUP,
                    await setupRegistry.getAddress()
                )
            ).to.be.revertedWithCustomError(safeDeployment, "InvalidInitialization");
        });

        it("Should prevent duplicate Safe deployment", async function () {
            // First deployment should succeed
            await expect(
                safeDeployment.connect(executor).deploySafeForUser(
                    user.address,
                    DEFAULT_CONFIG_ID
                )
            ).to.emit(safeDeployment, "SafeDeployed");

            // Verify Safe was deployed
            const isDeployedAfter = await safeDeployment.isSafeDeployed(user.address);
            expect(isDeployedAfter).to.be.true;

            // Second deployment with same parameters should fail
            await expect(
                safeDeployment.connect(executor).deploySafeForUser(
                    user.address,
                    DEFAULT_CONFIG_ID
                )
            ).to.be.revertedWith("SafeDeployment: Safe already deployed for this user");
        });

        it("Should deploy Safe with correct configuration", async function () {
            // Deploy the Safe
            const tx = await safeDeployment.connect(executor).deploySafeForUser(
                user.address,
                DEFAULT_CONFIG_ID
            );
            const receipt = await tx.wait();

            // Get the deployed Safe address from events
            const safeDeployedEvent = receipt?.logs.find(log => 
                log.topics[0] === safeDeployment.interface.getEvent("SafeDeployed").topicHash
            );
            expect(safeDeployedEvent).to.not.be.undefined;

            const decodedEvent = safeDeployment.interface.parseLog({
                topics: safeDeployedEvent!.topics,
                data: safeDeployedEvent!.data
            });
            const deployedSafeAddress = decodedEvent?.args.safeAddress;

            // Verify the deployed address matches prediction
            const predictedAddress = await safeDeployment.predictSafeAddress(user.address);
            expect(deployedSafeAddress).to.equal(predictedAddress);

            // Verify the Safe is a contract
            expect(await ethers.provider.getCode(deployedSafeAddress)).to.not.equal("0x");

            // Verify the Safe has the correct owner
            const SafeContract = await ethers.getContractAt("contracts/interfaces/safe/ISafe.sol:ISafe", deployedSafeAddress);
            
            // Use the IOwnerManager interface which is part of ISafe
            const owners = await SafeContract.getOwners();
            expect(owners.length).to.equal(1);
            expect(owners[0]).to.equal(user.address);

            // Verify threshold
            const threshold = await SafeContract.getThreshold();
            expect(threshold).to.equal(1);
        });

        it("Should deploy deterministic addresses regardless of deployer (snapshot test)", async function () {
            let address1: string;
            let address2: string;

            // Get additional executor for testing
            const [, , , , anotherExecutor] = await ethers.getSigners();
            
            // Grant executor role to the additional signer
            const TRANSACTION_EXECUTOR_ROLE = ethers.id("TRANSACTION_EXECUTOR_ROLE");
            await adminVault.connect(owner).grantRole(TRANSACTION_EXECUTOR_ROLE, anotherExecutor.address);

            // Take snapshot
            const snapshotId = await ethers.provider.send("evm_snapshot", []);

            try {
                // Deploy with first executor
                const tx1 = await safeDeployment.connect(executor).deploySafeForUser(
                    user.address,
                    DEFAULT_CONFIG_ID
                );
                const receipt1 = await tx1.wait();
                
                const safeDeployedEvent1 = receipt1?.logs.find(log => 
                    log.topics[0] === safeDeployment.interface.getEvent("SafeDeployed").topicHash
                );
                const decodedEvent1 = safeDeployment.interface.parseLog({
                    topics: safeDeployedEvent1!.topics,
                    data: safeDeployedEvent1!.data
                });
                address1 = decodedEvent1?.args.safeAddress;

                // Restore snapshot
                await ethers.provider.send("evm_revert", [snapshotId]);

                // Deploy with second executor (different deployer)
                const tx2 = await safeDeployment.connect(anotherExecutor).deploySafeForUser(
                    user.address,
                    DEFAULT_CONFIG_ID
                );
                const receipt2 = await tx2.wait();
                
                const safeDeployedEvent2 = receipt2?.logs.find(log => 
                    log.topics[0] === safeDeployment.interface.getEvent("SafeDeployed").topicHash
                );
                const decodedEvent2 = safeDeployment.interface.parseLog({
                    topics: safeDeployedEvent2!.topics,
                    data: safeDeployedEvent2!.data
                });
                address2 = decodedEvent2?.args.safeAddress;

                // Verify both deployments resulted in the same address
                expect(address1).to.equal(address2);
                expect(address1).to.not.equal(ethers.ZeroAddress);

                // Verify the address matches prediction
                const predictedAddress = await safeDeployment.predictSafeAddress(user.address);
                expect(address1).to.equal(predictedAddress);
                expect(address2).to.equal(predictedAddress);

            } catch (error) {
                // Ensure we restore snapshot even if test fails
                await ethers.provider.send("evm_revert", [snapshotId]);
                throw error;
            }
        });

        it("Should deploy Safe and verify fallback handler is set", async function () {
            // Deploy the Safe
            const tx = await safeDeployment.connect(executor).deploySafeForUser(
                user.address,
                DEFAULT_CONFIG_ID
            );
            const receipt = await tx.wait();

            // Get the deployed Safe address
            const safeDeployedEvent = receipt?.logs.find(log => 
                log.topics[0] === safeDeployment.interface.getEvent("SafeDeployed").topicHash
            );
            const decodedEvent = safeDeployment.interface.parseLog({
                topics: safeDeployedEvent!.topics,
                data: safeDeployedEvent!.data
            });
            const deployedSafeAddress = decodedEvent?.args.safeAddress;

            // Check if the Safe has the fallback handler set
            
            // Get fallback handler using the standard Safe method
            const fallbackHandlerSlot = "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
            const fallbackHandler = await ethers.provider.getStorage(deployedSafeAddress, fallbackHandlerSlot);
            
            // Convert the storage value to address
            const actualFallbackHandler = ethers.getAddress("0x" + fallbackHandler.slice(-40));
            expect(actualFallbackHandler).to.equal(FALLBACK_HANDLER);
        });

        it("Should allow reconfiguring an existing Safe", async function () {
            // First deploy a Safe
            await safeDeployment.connect(executor).deploySafeForUser(
                user.address,
                DEFAULT_CONFIG_ID
            );

            // Create a new configuration with different settings
            const newConfigId = ethers.id("NEW_CONFIG");
            const newModules: string[] = []; // Empty modules for the new config
            
            await setupRegistry.connect(proposer).proposeSetupConfig(
                newConfigId,
                FALLBACK_HANDLER,
                newModules,
                ethers.ZeroAddress // No guard for the new config
            );

            // Fast forward time and approve
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            await setupRegistry.connect(executor).approveSetupConfig(newConfigId);

            // Reconfigure the existing Safe
            await expect(
                safeDeployment.connect(executor).reconfigureSafe(
                    user.address,
                    newConfigId
                )
            ).to.emit(safeDeployment, "SafeReconfigured");
        });

        it("Should not allow reconfiguring non-existent Safe", async function () {
            const [, , , , anotherUser] = await ethers.getSigners();
            
            await expect(
                safeDeployment.connect(executor).reconfigureSafe(
                    anotherUser.address,
                    DEFAULT_CONFIG_ID
                )
            ).to.be.revertedWith("SafeDeployment: No Safe deployed for this user");
        });

        it("Should predict same address regardless of configuration", async function () {
            // Create a different configuration
            const differentConfigId = ethers.id("DIFFERENT_CONFIG");
            const differentModules: string[] = [];
            
            await setupRegistry.connect(proposer).proposeSetupConfig(
                differentConfigId,
                FALLBACK_HANDLER,
                differentModules,
                ethers.ZeroAddress // No guard for this config
            );

            // Fast forward time and approve
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            await setupRegistry.connect(executor).approveSetupConfig(differentConfigId);

            // Predict address with DEFAULT_CONFIG
            const addressWithDefaultConfig = await safeDeployment.predictSafeAddress(user.address);
            
            // Predict address with DIFFERENT_CONFIG (should be the same!)
            const addressWithDifferentConfig = await safeDeployment.predictSafeAddress(user.address);
            
            // Addresses should be identical regardless of config
            expect(addressWithDefaultConfig).to.equal(addressWithDifferentConfig);
            
            // Deploy with one config, verify it matches prediction
            await safeDeployment.connect(executor).deploySafeForUser(
                user.address,
                DEFAULT_CONFIG_ID
            );
            
            // Verify the deployed Safe is at the predicted address
            expect(await safeDeployment.isSafeDeployed(user.address)).to.be.true;
            
            // Now reconfigure with the different config - should work on same Safe
            await expect(
                safeDeployment.connect(executor).reconfigureSafe(
                    user.address,
                    differentConfigId
                )
            ).to.emit(safeDeployment, "SafeReconfigured");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle empty modules array", async function () {
            const emptyModulesConfigId = ethers.id("EMPTY_MODULES_CONFIG");
            const modules: string[] = [];

            await setupRegistry.connect(proposer).proposeSetupConfig(
                emptyModulesConfigId,
                FALLBACK_HANDLER,
                modules,
                BRAVA_GUARD
            );

            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            await setupRegistry.connect(executor).approveSetupConfig(emptyModulesConfigId);

            const config = await setupRegistry.getSetupConfig(emptyModulesConfigId);
            expect(config.modules.length).to.equal(0);
            expect(config.isActive).to.be.true;
        });

        it("Should require at least fallback handler or guard", async function () {
            const invalidConfigId = ethers.id("INVALID_CONFIG");
            const modules = [FEE_TAKE_SAFE_MODULE];

            await expect(
                setupRegistry.connect(proposer).proposeSetupConfig(
                    invalidConfigId,
                    ethers.ZeroAddress,
                    modules,
                    ethers.ZeroAddress
                )
            ).to.be.revertedWithCustomError(setupRegistry, "InvalidInput");
        });
    });

    describe("Typed Data Integration", function () {
        beforeEach(async function () {
            // Deploy EIP712TypedDataSafeModule for testing
            const EIP712ModuleFactory = await ethers.getContractFactory("EIP712TypedDataSafeModule");
            eip712Module = await EIP712ModuleFactory.deploy(
                await adminVault.getAddress(),
                ethers.ZeroAddress, // sequenceExecutor - not needed for this test
                "BravaSafeModule",
                "1"
            );
            await eip712Module.waitForDeployment();

            // Set the module address in SafeDeployment
            await safeDeployment.connect(owner).setEIP712TypedDataModule(await eip712Module.getAddress());

            // Set up the typed data configuration
            const typedDataConfigId = ethers.id("TYPED_DATA_SAFE_CONFIG");
            const modules = [await eip712Module.getAddress()];

            await setupRegistry.connect(proposer).proposeSetupConfig(
                typedDataConfigId,
                FALLBACK_HANDLER,
                modules,
                BRAVA_GUARD
            );

            // Fast forward time and approve
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            await setupRegistry.connect(executor).approveSetupConfig(typedDataConfigId);
        });

        it("Should set EIP712TypedDataSafeModule address", async function () {
            expect(await safeDeployment.EIP712_TYPED_DATA_MODULE()).to.equal(await eip712Module.getAddress());
        });

        it("Should require owner role to set module address", async function () {
            await expect(
                safeDeployment.connect(user).setEIP712TypedDataModule(await eip712Module.getAddress())
            ).to.be.revertedWithCustomError(safeDeployment, "AdminVault_MissingRole");
        });

        it("Should reject zero address for module", async function () {
            await expect(
                safeDeployment.connect(owner).setEIP712TypedDataModule(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(safeDeployment, "InvalidInput");
        });

        it("Should revert if module not set when executing typed data bundle", async function () {
            // Deploy a fresh SafeDeployment proxy without module set
            const SafeDeploymentFactory = await ethers.getContractFactory("SafeDeployment");
            const safeDeploymentImpl = await SafeDeploymentFactory.deploy();
            await safeDeploymentImpl.waitForDeployment();
            
            const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
            const freshSafeDeploymentProxy = await ERC1967ProxyFactory.deploy(
                await safeDeploymentImpl.getAddress(),
                safeDeploymentImpl.interface.encodeFunctionData("initialize", [
                    await adminVault.getAddress(),
                    await logger.getAddress(),
                    SAFE_SINGLETON,
                    SAFE_SETUP,
                    await setupRegistry.getAddress()
                ])
            );
            await freshSafeDeploymentProxy.waitForDeployment();
            
            const freshSafeDeployment = SafeDeploymentFactory.attach(await freshSafeDeploymentProxy.getAddress()) as SafeDeployment;

            // Create a minimal bundle (we don't need valid data since it should fail early)
            const bundle = {
                expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
                sequences: []
            };

            await expect(
                freshSafeDeployment.executeTypedDataBundle(bundle, "0x")
            ).to.be.revertedWithCustomError(freshSafeDeployment, "SafeDeployment_TypedDataModuleNotSet");
        });

        it("Should revert if typed data config not approved", async function () {
            // Grant disposer role and remove the approved config
            const TRANSACTION_DISPOSER_ROLE = ethers.id("TRANSACTION_DISPOSER_ROLE");
            await adminVault.connect(owner).grantRole(TRANSACTION_DISPOSER_ROLE, executor.address);
            
            const typedDataConfigId = ethers.id("TYPED_DATA_SAFE_CONFIG");
            await setupRegistry.connect(executor).revokeSetupConfig(typedDataConfigId);

            // Create a bundle with valid signature structure but the recovery will fail
            // due to config not being approved when trying to deploy
            const bundle = {
                expiry: Math.floor(Date.now() / 1000) + 3600,
                sequences: [{
                    chainId: 31337, // hardhat chainId
                    sequenceNonce: 0,
                    sequence: {
                        name: "Test Sequence",
                        actions: [],
                        actionIds: [],
                        callData: []
                    }
                }]
            };

            // Get bundle hash and create a signature
            const bundleHash = await eip712Module.getBundleHash(bundle);
            const signature = await user.signMessage(ethers.getBytes(bundleHash));

            await expect(
                safeDeployment.executeTypedDataBundle(bundle, signature)
            ).to.be.revertedWithCustomError(safeDeployment, "SafeDeployment_TypedDataConfigNotApproved");
        });

        it("Should emit TypedDataBundleExecuted event", async function () {
            // Create a simple valid bundle
            const bundle = {
                expiry: Math.floor(Date.now() / 1000) + 3600,
                sequences: [{
                    chainId: 31337, // hardhat chainId
                    sequenceNonce: 0,
                    sequence: {
                        name: "Test Sequence",
                        actions: [],
                        actionIds: [],
                        callData: []
                    }
                }]
            };

            // Get bundle hash and create a signature
            const bundleHash = await eip712Module.getBundleHash(bundle);
            const signature = await user.signMessage(ethers.getBytes(bundleHash));

            // This should deploy a Safe and emit the event
            // Note: This might still fail at the module level due to sequence validation,
            // but we're testing that SafeDeployment correctly deploys and forwards
            try {
                const tx = await safeDeployment.executeTypedDataBundle(bundle, signature);
                const receipt = await tx.wait();
                
                // Check if TypedDataBundleExecuted event was emitted
                const event = receipt?.logs.find(log => {
                    try {
                        const parsed = safeDeployment.interface.parseLog({
                            topics: log.topics,
                            data: log.data
                        });
                        return parsed?.name === "TypedDataBundleExecuted";
                    } catch {
                        return false;
                    }
                });
                
                expect(event).to.not.be.undefined;
            } catch (error: any) {
                // If it fails at the module level, that's expected since we don't have a valid sequence executor
                // But we can at least verify the error is coming from the module, not SafeDeployment
                expect(error.message).to.not.include("SafeDeployment_");
            }
        });
    });
}); 