import "dotenv/config";
import { BaseContract, Signer } from "ethers";
import { ethers } from "hardhat";
import { deploy } from "./deployer";

const ADMIN_VAULT_ADDR = process.env.ADMIN_VAULT_ADDR ?? "";


async function deployContractRegistry(adminVault: string, _signer?: Signer): Promise<BaseContract> {
    // Use provided signer or the first signer by default by hre
    const signer = _signer ?? (await ethers.getSigners())[0];
    return await deploy("ContractRegistry", signer, adminVault);
}

async function main() {
    await deployContractRegistry(ADMIN_VAULT_ADDR);
}

main().catch(console.error);

export {
    deployContractRegistry
};
