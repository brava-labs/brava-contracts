import { BaseContract, Signer } from "ethers";
import { ethers } from "hardhat";

async function deploy(contractName: string, signer: Signer, ...args: any[]): Promise<BaseContract> {
    console.log(`Deploying ${contractName} with args: ${args}`);
    const factory = await ethers.getContractFactory(contractName, signer);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    console.log(`${contractName} deployed at: ${await contract.getAddress()}`);
    return contract;
}

export { deploy };
