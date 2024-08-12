import { BigNumberish, BytesLike, Signer } from "ethers";
import { artifacts, ethers } from "hardhat";

const SAFE_PROXY_FACTORY_ADDR = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const SAFE_SINGLETON_ADDR = "0x41675C099F32341bf84BFc5382aF534df5C7461a";

interface ISetupArgs {
    owners: string[];
    threshold: BigNumberish;
    to: string;
    data: BytesLike;
    fallbackHandler: string;
    paymentToken: string;
    payment: BigNumberish;
    paymentReceiver: string;
}

async function encodeSetupArgs(setupArgs: ISetupArgs) { 
    const safeArtifact = await artifacts.readArtifact("ISafe");
    const safeInterface = new ethers.Interface(safeArtifact.abi);
    return safeInterface.encodeFunctionData("setup", [
        setupArgs.owners,
        setupArgs.threshold,
        setupArgs.to,
        setupArgs.data,
        setupArgs.fallbackHandler,
        setupArgs.paymentToken,
        setupArgs.payment,
        setupArgs.paymentReceiver
    ]);
}

async function deploySafe(_signer?: Signer): Promise<any> {
    const signer = _signer ?? (await ethers.getSigners())[0];
    const abiCoder = new ethers.AbiCoder();
    const salt = Date.now()
    const safeProxyFactory = await ethers.getContractAt("ISafeProxyFactory", SAFE_PROXY_FACTORY_ADDR, _signer);

    const setupArgs: ISetupArgs = {
        owners: [await signer.getAddress()],
        threshold: 1,
        to: ethers.ZeroAddress,
        data: "0x",
        fallbackHandler: ethers.ZeroAddress,
        paymentToken: ethers.ZeroAddress,
        payment: 0,
        paymentReceiver: ethers.ZeroAddress
    };

    const encodedSetupArgs = await encodeSetupArgs(setupArgs);

    const txResponse = await safeProxyFactory.createProxyWithNonce(
        SAFE_SINGLETON_ADDR,
        encodedSetupArgs,
        salt
    );

    const txReceipt = await txResponse.wait();

    // Get the safe address from the logs
    const safeAddr = abiCoder.decode(["address"], txReceipt?.logs?.[1]?.topics?.[1]!)[0];
    console.log(`Safe deployed at: ${safeAddr}`);

    return safeAddr;
}

async function executeSafeTransaction(safeAddr: string, to: string, value: BigNumberish, data: BytesLike, operation: Operation, _signer?: Signer) {
    const abiCoder = new ethers.AbiCoder();
    const signer = _signer ?? (await ethers.getSigners())[0];
    const safe = await ethers.getContractAt("ISafe", safeAddr, signer);
    // We don't need to actually sign a transaction with 1/1 threshold
    // https://github.com/safe-global/safe-smart-account/blob/bf943f80fec5ac647159d26161446ac5d716a294/contracts/Safe.sol#L316
    const signature = abiCoder.encode(["address", "bytes32"], [await signer.getAddress(), ethers.ZeroHash]) + '01';
    const txResponse = await safe.execTransaction(to, value, data, operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, signature);
    return txResponse;
}

enum Operation {
    Call = 0,
    DelegateCall = 1
}

async function main() {
}

main().catch(console.error);

export {
    deploySafe, executeSafeTransaction, Operation
};
