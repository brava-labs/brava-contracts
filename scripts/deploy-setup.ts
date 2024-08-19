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
  const swap = await deploy(
    "Curve3PoolSwap",
    signer,
    await contractRegistry.getAddress(),
    await logger.getAddress(),
    "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
  );
  return { logger, adminVault, contractRegistry, yearnSupply, buyCover, swap };
}

async function main() {
  await deploySetup();
}

main().catch(console.error);

export { deploySetup };
