import { ethers, network } from 'hardhat';
import { Signer, BaseContract } from 'ethers';
import * as constants from './constants';
// import * as safe from './utils-safe';
import { ISafe } from '../typechain-types/interfaces/safe/ISafe';
import { deploySafe } from 'athena-sdk';

export const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';

export function log(...args: unknown[]): void {
  if (isLoggingEnabled) {
    console.log(...args);
  }
}

export function formatAmount(amount: bigint, decimals: number): string {
  return (amount / BigInt(10 ** decimals)).toString();
}

export async function deploy<T extends BaseContract>(
  contractName: string,
  signer: Signer,
  ...args: unknown[]
): Promise<T> {
  log(`Deploying ${contractName} with args:`, args);
  const factory = await ethers.getContractFactory(contractName, signer);
  const contract = (await factory.deploy(...args)) as T;
  await contract.waitForDeployment();
  log(`${contractName} deployed at:`, await contract.getAddress());
  return contract;
}

export async function deployBaseSetup(signer?: Signer): Promise<{
  logger: BaseContract;
  adminVault: BaseContract;
  contractRegistry: BaseContract;
  safeAddr: string;
}> {
  const deploySigner = signer ?? (await ethers.getSigners())[0];
  const logger = await deploy('Logger', deploySigner);
  const adminVault = await deploy(
    'AdminVault',
    deploySigner,
    constants.OWNER_ADDRESS,
    constants.ADMIN_ADDRESS
  );
  const contractRegistry = await deploy(
    'ContractRegistry',
    deploySigner,
    await adminVault.getAddress()
  );
  const safeAddr = await deploySafe(deploySigner);
  return { logger, adminVault, contractRegistry, safeAddr };
}

let baseSetupCache: Awaited<ReturnType<typeof deployBaseSetup>> | null = null;
let baseSetupSnapshotId: string | null = null;

export async function getBaseSetup(signer?: Signer): Promise<ReturnType<typeof deployBaseSetup>> {
  if (baseSetupCache && baseSetupSnapshotId) {
    log('Reverting to snapshot');
    await network.provider.send('evm_revert', [baseSetupSnapshotId]);
    baseSetupSnapshotId = await network.provider.send('evm_snapshot', []);
    return baseSetupCache;
  }

  log('Deploying base setup');
  const setup = await deployBaseSetup(signer);
  baseSetupCache = setup;
  baseSetupSnapshotId = await network.provider.send('evm_snapshot', []);
  return setup;
}
