import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants } from '../tests';
import { getBytes4 } from '../tests/utils';

export async function addPools(deployer: Signer) {
  console.log('Adding pools with the account:', await deployer.getAddress());

  const adminVaultAddress = "";

  const adminVault = await ethers.getContractAt('AdminVault', adminVaultAddress);

  console.log('Adding pools to admin vault');
  const FLUID_USDC_ADDRESS = constants.tokenConfig.FLUID_V1_USDC.address;
  await adminVault.connect(deployer).proposePool('FluidV1', FLUID_USDC_ADDRESS);
  await adminVault.connect(deployer).addPool('FluidV1', FLUID_USDC_ADDRESS);
  console.log(`Fluid USDC pool added. PoolId: ${getBytes4(FLUID_USDC_ADDRESS)}`);

  const FLUID_USDT_ADDRESS = constants.tokenConfig.FLUID_V1_USDT.address;
  await adminVault.connect(deployer).proposePool('FluidV1', FLUID_USDT_ADDRESS);
  await adminVault.connect(deployer).addPool('FluidV1', FLUID_USDT_ADDRESS);
  console.log(`Fluid USDT pool added. PoolId: ${getBytes4(FLUID_USDT_ADDRESS)}`);

  const AAVE_V3_USDC_ADDRESS = constants.tokenConfig.AAVE_V3_aUSDC.address;
  await adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_USDC_ADDRESS);
  await adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_USDC_ADDRESS);
  console.log(`AaveV3 USDC pool added. PoolId: ${getBytes4(AAVE_V3_USDC_ADDRESS)}`);

  const AAVE_V3_USDT_ADDRESS = constants.tokenConfig.AAVE_V3_aUSDT.address;
  await adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_USDT_ADDRESS);
  await adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_USDT_ADDRESS);
  console.log(`AaveV3 USDT pool added. PoolId: ${getBytes4(AAVE_V3_USDT_ADDRESS)}`);

  const AAVE_V3_DAI_ADDRESS = constants.tokenConfig.AAVE_V3_aDAI.address;
  await adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_DAI_ADDRESS);
  await adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_DAI_ADDRESS);
  console.log(`AaveV3 DAI pool added. PoolId: ${getBytes4(AAVE_V3_DAI_ADDRESS)}`);

  const MORPHO_FX_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_fxUSDC.address;
  await adminVault.connect(deployer).proposePool('MorphoV1', MORPHO_FX_USDC_ADDRESS);
  await adminVault.connect(deployer).addPool('MorphoV1', MORPHO_FX_USDC_ADDRESS);
  console.log(`Morpho FX USDC pool added. PoolId: ${getBytes4(MORPHO_FX_USDC_ADDRESS)}`);

  const MORPHO_GAUNTLET_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_gtUSDC.address;
  await adminVault.connect(deployer).proposePool('MorphoV1', MORPHO_GAUNTLET_USDC_ADDRESS);
  await adminVault.connect(deployer).addPool('MorphoV1', MORPHO_GAUNTLET_USDC_ADDRESS);
  console.log(`Morpho Gauntlet USDC pool added. PoolId: ${getBytes4(MORPHO_GAUNTLET_USDC_ADDRESS)}`);

  const SPARK_DAI_ADDRESS = constants.tokenConfig.SPARK_V1_DAI.address;
  await adminVault.connect(deployer).proposePool('SparkV1', SPARK_DAI_ADDRESS);
  await adminVault.connect(deployer).addPool('SparkV1', SPARK_DAI_ADDRESS);
  console.log(`Spark DAI pool added. PoolId: ${getBytes4(SPARK_DAI_ADDRESS)}`);

  const NOTIONAL_V3_USDC_ADDRESS = constants.tokenConfig.NOTIONAL_V3_USDC.address;
  await adminVault.connect(deployer).proposePool('NotionalV3', NOTIONAL_V3_USDC_ADDRESS);
  await adminVault.connect(deployer).addPool('NotionalV3', NOTIONAL_V3_USDC_ADDRESS);
  console.log(`NotionalV3 USDC pool added. PoolId: ${getBytes4(NOTIONAL_V3_USDC_ADDRESS)}`);

  const YEARN_V3_DAI_ADDRESS = constants.tokenConfig.YEARN_V3_DAI.address;
  await adminVault.connect(deployer).proposePool('YearnV3', YEARN_V3_DAI_ADDRESS);
  await adminVault.connect(deployer).addPool('YearnV3', YEARN_V3_DAI_ADDRESS);
  console.log(`YearnV3 DAI pool added. PoolId: ${getBytes4(YEARN_V3_DAI_ADDRESS)}`);

  const GEARBOX_PASSIVE_USDC_ADDRESS = constants.tokenConfig.GEARBOX_PASSIVE_V3_USDC.address;
  await adminVault.connect(deployer).proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_USDC_ADDRESS);
  await adminVault.connect(deployer).addPool('GearboxPassiveV3', GEARBOX_PASSIVE_USDC_ADDRESS);
  console.log(`GearboxPassive USDC pool added. PoolId: ${getBytes4(GEARBOX_PASSIVE_USDC_ADDRESS)}`);

  const GEARBOX_PASSIVE_USDT_ADDRESS = constants.tokenConfig.GEARBOX_PASSIVE_V3_USDT.address;
  await adminVault.connect(deployer).proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_USDT_ADDRESS);
  await adminVault.connect(deployer).addPool('GearboxPassiveV3', GEARBOX_PASSIVE_USDT_ADDRESS);
  console.log(`GearboxPassive USDT pool added. PoolId: ${getBytes4(GEARBOX_PASSIVE_USDT_ADDRESS)}`);

  const GEARBOX_PASSIVE_DAI_ADDRESS = constants.tokenConfig.GEARBOX_PASSIVE_V3_DAI.address;
  await adminVault.connect(deployer).proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_DAI_ADDRESS);
  await adminVault.connect(deployer).addPool('GearboxPassiveV3', GEARBOX_PASSIVE_DAI_ADDRESS);
  console.log(`GearboxPassive DAI pool added. PoolId: ${getBytes4(GEARBOX_PASSIVE_DAI_ADDRESS)}`);

  console.log('Setup completed');

}

async function main() {
  const [deployer] = await ethers.getSigners();
  await addPools(deployer);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });