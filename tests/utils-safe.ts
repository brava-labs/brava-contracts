import { BigNumberish, BytesLike, Signer, BaseContract } from 'ethers';
import { ethers, artifacts } from 'hardhat';

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

enum Operation {
  Call = 0,
  DelegateCall = 1,
}

async function encodeSetupArgs(setupArgs: ISetupArgs) {
  const safeArtifact = await artifacts.readArtifact('ISafe');
  const safeInterface = new ethers.Interface(safeArtifact.abi);
  return safeInterface.encodeFunctionData('setup', [
    setupArgs.owners,
    setupArgs.threshold,
    setupArgs.to,
    setupArgs.data,
    setupArgs.fallbackHandler,
    setupArgs.paymentToken,
    setupArgs.payment,
    setupArgs.paymentReceiver,
  ]);
}

async function executeSafeTransaction(
  safeAddr: string,
  to: string,
  value: BigNumberish,
  data: BytesLike,
  operation: Operation,
  _signer?: Signer
) {
  const abiCoder = new ethers.AbiCoder();
  const signer = _signer ?? (await ethers.getSigners())[0];
  const safe = await ethers.getContractAt('ISafe', safeAddr, signer);
  // We don't need to actually sign a transaction with 1/1 threshold
  // https://github.com/safe-global/safe-smart-account/blob/bf943f80fec5ac647159d26161446ac5d716a294/contracts/Safe.sol#L316
  const signature =
    abiCoder.encode(['address', 'bytes32'], [await signer.getAddress(), ethers.ZeroHash]) + '01';
  const txResponse = await safe.execTransaction(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    signature
  );
  return txResponse;
}

export { executeSafeTransaction };
