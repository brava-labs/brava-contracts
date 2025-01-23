import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, utils } from '../tests';

export async function deployActionsMvp(deployer: Signer) {
  console.log('Deploying contracts with the account:', await deployer.getAddress());

  const adminVaultAddress = "";
  const loggerAddress = "";

  const contracts = {
    // Protocol contracts
    fluidSupply: await utils.deploy('FluidV1Supply', deployer, adminVaultAddress, loggerAddress),
    fluidWithdraw: await utils.deploy('FluidV1Withdraw', deployer, adminVaultAddress, loggerAddress),

    aaveV3Supply: await utils.deploy('AaveV3Supply', deployer, adminVaultAddress, loggerAddress, constants.AAVE_V3_POOL),
    aaveV3Withdraw: await utils.deploy('AaveV3Withdraw', deployer, adminVaultAddress, loggerAddress, constants.AAVE_V3_POOL),

    morphoSupply: await utils.deploy('MorphoV1Supply', deployer, adminVaultAddress, loggerAddress),
    morphoWithdraw: await utils.deploy('MorphoV1Withdraw', deployer, adminVaultAddress, loggerAddress),

    sparkSupply: await utils.deploy('SparkV1Supply', deployer, adminVaultAddress, loggerAddress),
    sparkWithdraw: await utils.deploy('SparkV1Withdraw', deployer, adminVaultAddress, loggerAddress),

    notionalV3Supply: await utils.deploy('NotionalV3Supply', deployer, adminVaultAddress, loggerAddress, constants.NOTIONAL_ROUTER),
    notionalV3Withdraw: await utils.deploy('NotionalV3Withdraw', deployer, adminVaultAddress, loggerAddress, constants.NOTIONAL_ROUTER),

    yearnV3Supply: await utils.deploy('YearnV3Supply', deployer, adminVaultAddress, loggerAddress),
    yearnV3Withdraw: await utils.deploy('YearnV3Withdraw', deployer, adminVaultAddress, loggerAddress),

    gearboxPassiveSupply: await utils.deploy('GearboxPassiveV3Supply', deployer, adminVaultAddress, loggerAddress),
    gearboxPassiveWithdraw: await utils.deploy('GearboxPassiveV3Withdraw', deployer, adminVaultAddress, loggerAddress),
  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }


  console.log('Deployment completed');

  return { ...contracts };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  await deployActionsMvp(deployer);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });