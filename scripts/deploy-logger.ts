import { BaseContract, Signer } from "ethers";
import { ethers } from "hardhat";
import { deploy } from "./deployer";


async function deployLogger(_signer?: Signer): Promise<BaseContract> {
    // Use provided signer or the first signer by default by hre
    const signer = _signer ?? (await ethers.getSigners())[0];
    return await deploy("Logger", signer);
}

async function main() {
    await deployLogger();
}

main().catch(console.error);

export {
    deployLogger
};
