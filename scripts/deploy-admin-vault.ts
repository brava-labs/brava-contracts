import "dotenv/config";
import { BaseContract, Signer } from "ethers";
import { ethers } from "hardhat";
import { deploy } from "./deployer";

const OWNER_ADDR = process.env.OWNER_ADDR!;
const ADMIN_ADDR = process.env.ADMIN_ADDR!;


async function deployAdminVault(owner: string, admin: string, _signer?: Signer): Promise<BaseContract> {
    // Use provided signer or the first signer by default by hre
    const signer = _signer ?? (await ethers.getSigners())[0];
    return await deploy("AdminVault", signer, owner, admin);
}

async function main() {
    await deployAdminVault(OWNER_ADDR, ADMIN_ADDR);
}

main().catch(console.error);

export {
    deployAdminVault
};
