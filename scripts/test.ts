import "dotenv/config";
import { ethers } from "hardhat";
import { deploySetup } from "./deploy-setup";
import { deploySafe, executeSafeTransaction } from "./safe";

const OWNER_ADDR = process.env.OWNER_ADDR!;
const ADMIN_ADDR = process.env.ADMIN_ADDR!;

async function test(): Promise<any> {
    const { logger, adminVault, contractRegistry, yearnSupply, buyCover } = await deploySetup();
    const signer = (await ethers.getSigners())[0];
    const signerAddr = await signer.getAddress();
    const safeAddr = await deploySafe(signer);

    console.log(`Owner: ${OWNER_ADDR}`);
    console.log(`Admin: ${ADMIN_ADDR}`);
    console.log(`Safe: ${safeAddr}`);

    const abiCoder = new ethers.AbiCoder();

    const poolAllocationRequest = {
        poolId: 23,
        skip: false,
        coverAmountInAsset: BigInt("500196398981878329")
    }

    const poolAllocationRequestsEncoded = [abiCoder.encode(['tuple(uint40 poolId, bool skip, uint256 coverAmountInAsset)'], [poolAllocationRequest])];
    const params = {
        owner: signerAddr,
        productId: 150,
        coverAsset: 0,
        amount: BigInt("500000000000000000"),
        period: 2592000,
        maxPremiumInAsset: BigInt("1646125793032964"),
        paymentAsset: 0,
        poolAllocationRequests: poolAllocationRequestsEncoded
    }

    const paramsEncoded = abiCoder.encode(['tuple(address owner, uint256 productId, uint256 coverAsset, uint256 amount, uint256 period, uint256 maxPremiumInAsset, uint256 paymentAsset, bytes[] poolAllocationRequests)'], [params]);

    const encodedFunctionCall = buyCover.interface.encodeFunctionData("executeActionDirect", [paramsEncoded]);

    await signer.sendTransaction({
        to: safeAddr,
        value: ethers.parseEther("1.0")
    });
    const txResponse = await executeSafeTransaction(safeAddr, await (buyCover.getAddress()), 0, encodedFunctionCall, 1, signer);
    const txReceipt = await txResponse.wait();

    console.log(`Transaction hash: ${txReceipt}`);

}

async function main() {
    await test();
}

main().catch(console.error);
