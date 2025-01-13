import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, utils } from '../tests';
import { getBytes4 } from '../tests/utils';

export async function deployTestnetTenderly(deployer: Signer, testAccounts: Signer[]) {
  console.log('Deploying contracts with the account:', await deployer.getAddress());

  // Deploy base setup
  const baseSetup = await utils.getBaseSetup(deployer);
  if (!baseSetup) {
    throw new Error('Base setup deployment failed');
  }
  console.log(`Admin Vault deployed at: ${await baseSetup.adminVault.getAddress()}`);
  console.log(`Logger deployed at: ${await baseSetup.logger.getAddress()}`);
  console.log(`Safe Proxy Factory deployed at: ${await baseSetup.safeProxyFactory.getAddress()}`);
  console.log('Base setup deployed');

  // Deploy additional contracts
  const adminVaultAddress = await baseSetup.adminVault.getAddress();
  const loggerAddress = await baseSetup.logger.getAddress();

  const sequenceExecutor = await utils.deploy('SequenceExecutor', deployer, adminVaultAddress);
  const sequenceExecutorAddress = await sequenceExecutor.getAddress();

  const contracts = {
    // Base contracts
    sequenceExecutor: sequenceExecutor,
    curve3PoolSwap: await utils.deploy('Curve3PoolSwap', deployer, adminVaultAddress, loggerAddress, constants.CURVE_3POOL_ADDRESS),
    buyCover: await utils.deploy('BuyCover', deployer, adminVaultAddress, loggerAddress),
    pullToken: await utils.deploy('PullToken', deployer, adminVaultAddress, loggerAddress),
    sendToken: await utils.deploy('SendToken', deployer, adminVaultAddress, loggerAddress),
    bravaGuard: await utils.deploy('BravaGuard', deployer, sequenceExecutorAddress),
    feeTakeSafeModule: await utils.deploy('FeeTakeSafeModule', deployer, adminVaultAddress, sequenceExecutorAddress),

    // Protocol contracts
    fluidSupply: await utils.deploy('FluidSupply', deployer, adminVaultAddress, loggerAddress),
    fluidWithdraw: await utils.deploy('FluidWithdraw', deployer, adminVaultAddress, loggerAddress),

    aaveV3Supply: await utils.deploy('AaveV3Supply', deployer, adminVaultAddress, loggerAddress, constants.AAVE_V3_POOL),
    aaveV3Withdraw: await utils.deploy('AaveV3Withdraw', deployer, adminVaultAddress, loggerAddress, constants.AAVE_V3_POOL),

    morphoSupply: await utils.deploy('MorphoSupply', deployer, adminVaultAddress, loggerAddress),
    morphoWithdraw: await utils.deploy('MorphoWithdraw', deployer, adminVaultAddress, loggerAddress),

    sparkSupply: await utils.deploy('SparkSupply', deployer, adminVaultAddress, loggerAddress),
    sparkWithdraw: await utils.deploy('SparkWithdraw', deployer, adminVaultAddress, loggerAddress),

  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }

  console.log('Adding contracts to admin vault');
  // Base contracts
  const curve3PoolSwapAddress = await contracts.curve3PoolSwap.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);

  const buyCoverAddress = await contracts.buyCover.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(buyCoverAddress), buyCoverAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(buyCoverAddress), buyCoverAddress);

  const pullTokenAddress = await contracts.pullToken.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(pullTokenAddress), pullTokenAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(pullTokenAddress), pullTokenAddress);

  const sendTokenAddress = await contracts.sendToken.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(sendTokenAddress), sendTokenAddress);

  // Protocol contracts
  const fluidSupplyAddress = await contracts.fluidSupply.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);

  const fluidWithdrawAddress = await contracts.fluidWithdraw.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);

  const aaveV3SupplyAddress = await contracts.aaveV3Supply.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(aaveV3SupplyAddress), aaveV3SupplyAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(aaveV3SupplyAddress), aaveV3SupplyAddress);

  const aaveV3WithdrawAddress = await contracts.aaveV3Withdraw.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(aaveV3WithdrawAddress), aaveV3WithdrawAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(aaveV3WithdrawAddress), aaveV3WithdrawAddress);

  const morphoSupplyAddress = await contracts.morphoSupply.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);

  const morphoWithdrawAddress = await contracts.morphoWithdraw.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);

  const sparkSupplyAddress = await contracts.sparkSupply.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);

  const sparkWithdrawAddress = await contracts.sparkWithdraw.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);

  console.log('Adding pools to admin vault');
  const FLUID_USDC_ADDRESS = constants.tokenConfig.fUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Fluid', FLUID_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Fluid', FLUID_USDC_ADDRESS);
  console.log(`Fluid USDC pool added. PoolId: ${getBytes4(FLUID_USDC_ADDRESS)}`);

  const FLUID_USDT_ADDRESS = constants.tokenConfig.fUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Fluid', FLUID_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Fluid', FLUID_USDT_ADDRESS);
  console.log(`Fluid USDT pool added. PoolId: ${getBytes4(FLUID_USDT_ADDRESS)}`);

  const AAVE_V3_USDC_ADDRESS = constants.tokenConfig.aUSDC_V3.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_USDC_ADDRESS);
  console.log(`AaveV3 USDC pool added. PoolId: ${getBytes4(AAVE_V3_USDC_ADDRESS)}`);

  const AAVE_V3_USDT_ADDRESS = constants.tokenConfig.aUSDT_V3.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_USDT_ADDRESS);
  console.log(`AaveV3 USDT pool added. PoolId: ${getBytes4(AAVE_V3_USDT_ADDRESS)}`);

  const AAVE_V3_DAI_ADDRESS = constants.tokenConfig.aDAI_V3.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_DAI_ADDRESS);
  console.log(`AaveV3 DAI pool added. PoolId: ${getBytes4(AAVE_V3_DAI_ADDRESS)}`);

  const MORPHO_FX_USDC_ADDRESS = constants.tokenConfig.morpho_fxUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_FX_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_FX_USDC_ADDRESS);
  console.log(`Morpho FX USDC pool added. PoolId: ${getBytes4(MORPHO_FX_USDC_ADDRESS)}`);

  const MORPHO_GAUNTLET_USDC_ADDRESS = constants.tokenConfig.morpho_gauntletUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_GAUNTLET_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_GAUNTLET_USDC_ADDRESS);
  console.log(`Morpho Gauntlet USDC pool added. PoolId: ${getBytes4(MORPHO_GAUNTLET_USDC_ADDRESS)}`);

  const SPARK_DAI_ADDRESS = constants.tokenConfig.sDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Spark', SPARK_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Spark', SPARK_DAI_ADDRESS);
  console.log(`Spark DAI pool added. PoolId: ${getBytes4(SPARK_DAI_ADDRESS)}`);

  console.log('Deployment and account setup completed');

  return { baseSetup, ...contracts };
}

async function main() {
  const [deployer, ...testAccounts] = await ethers.getSigners();
  await deployTestnetTenderly(deployer, testAccounts);
}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });