import "dotenv/config";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { deploy } from "./deployer";

const OWNER_ADDR = process.env.OWNER_ADDR!;
const ADMIN_ADDR = process.env.ADMIN_ADDR!;


async function deploySetup(_signer?: Signer): Promise<any> {
    // Use provided signer or the first signer by default by hre
    const signer = _signer ?? (await ethers.getSigners())[0];
    const logger = await deploy("Logger", signer);
    const adminVault = await deploy("AdminVault", signer, OWNER_ADDR, ADMIN_ADDR);
    const contractRegistry = await deploy("ContractRegistry", signer, await adminVault.getAddress());
    const yearnSupply = await deploy("YearnSupply", signer, await contractRegistry.getAddress(), await logger.getAddress());
    const buyCover = await deploy("BuyCover", signer, await contractRegistry.getAddress(), await logger.getAddress());

    return { logger, adminVault, contractRegistry, yearnSupply, buyCover };
}

async function main() {
    await deploySetup();
}

main().catch(console.error);

export { deploySetup };
