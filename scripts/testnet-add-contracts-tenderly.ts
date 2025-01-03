import { BaseContract, Signer } from 'ethers';
import { getBytes4 } from '../tests/utils';
import { AdminVault, Logger } from '../typechain-types';

type BaseSetup = {
  logger: Logger;
  adminVault: AdminVault;
  safeProxyFactory: any;
  safe: any;
  signer: Signer;
};

export async function addContractsTenderly(
  deployer: Signer,
  baseSetup: BaseSetup
) {
  console.log('Deploying additional contracts with the account:', await deployer.getAddress());

  const adminVaultAddress = await baseSetup.adminVault.getAddress();
  const loggerAddress = await baseSetup.logger.getAddress();

  // Deploy additional contracts
  const contracts: Record<string, BaseContract> = {
    // Add your new contracts here, for example:
    // vesperSupply: await utils.deploy('VesperSupply', deployer, adminVaultAddress, loggerAddress),
    // vesperWithdraw: await utils.deploy('VesperWithdraw', deployer, adminVaultAddress, loggerAddress),
  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }

  console.log('Adding contracts to admin vault');
  // Add contracts to admin vault
  for (const [_, contract] of Object.entries(contracts)) {
    const contractAddress = await contract.getAddress();
    await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(contractAddress), contractAddress);
    await baseSetup.adminVault.connect(deployer).addAction(getBytes4(contractAddress), contractAddress);
    console.log(`Contract ${contractAddress} added to admin vault`);
  }

  console.log('Adding pools to admin vault');
  // Add your new pools here, for example:
  // const VESPER_USDC_ADDRESS = constants.tokenConfig.vaUSDC.address;
  // await baseSetup.adminVault.connect(deployer).proposePool('Vesper', VESPER_USDC_ADDRESS);
  // await baseSetup.adminVault.connect(deployer).addPool('Vesper', VESPER_USDC_ADDRESS);
  // console.log(`Vesper USDC pool added. PoolId: ${getBytes4(VESPER_USDC_ADDRESS)}`);

  console.log('Additional contracts and pools setup completed');

  return contracts;
} 