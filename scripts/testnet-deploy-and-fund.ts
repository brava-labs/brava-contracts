import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, stable, utils } from '../tests';
import { getBytes4 } from '../tests/utils';

export async function deployAndFundTestnet(deployer: Signer, testAccounts: Signer[]) {
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

  const contracts = {
    // Base contracts
    sequenceExecutor: await utils.deploy('SequenceExecutor', deployer, adminVaultAddress),
    curve3PoolSwap: await utils.deploy(
      'Curve3PoolSwap',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.CURVE_3POOL_ADDRESS
    ),
    buyCover: await utils.deploy('BuyCover', deployer, adminVaultAddress, loggerAddress),
    pullToken: await utils.deploy('PullToken', deployer, adminVaultAddress, loggerAddress),
    sendToken: await utils.deploy('SendToken', deployer, adminVaultAddress, loggerAddress),

    // Protocol contracts
    fluidSupply: await utils.deploy('FluidSupply', deployer, adminVaultAddress, loggerAddress),
    fluidWithdraw: await utils.deploy('FluidWithdraw', deployer, adminVaultAddress, loggerAddress),

    aaveV2Supply: await utils.deploy(
      'AaveV2Supply',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.AAVE_V2_POOL
    ),
    aaveV2Withdraw: await utils.deploy(
      'AaveV2Withdraw',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.AAVE_V2_POOL
    ),
    aaveV3Supply: await utils.deploy(
      'AaveV3Supply',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.AAVE_V3_POOL
    ),
    aaveV3Withdraw: await utils.deploy(
      'AaveV3Withdraw',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.AAVE_V3_POOL
    ),

    acrossSupply: await utils.deploy(
      'AcrossSupply',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.ACROSS_HUB
    ),
    acrossWithdraw: await utils.deploy(
      'AcrossWithdraw',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.ACROSS_HUB
    ),

    clearpoolSupply: await utils.deploy(
      'ClearpoolSupply',
      deployer,
      adminVaultAddress,
      loggerAddress
    ),
    clearpoolWithdraw: await utils.deploy(
      'ClearpoolWithdraw',
      deployer,
      adminVaultAddress,
      loggerAddress
    ),

    morphoSupply: await utils.deploy('MorphoSupply', deployer, adminVaultAddress, loggerAddress),
    morphoWithdraw: await utils.deploy(
      'MorphoWithdraw',
      deployer,
      adminVaultAddress,
      loggerAddress
    ),

    sparkSupply: await utils.deploy('SparkSupply', deployer, adminVaultAddress, loggerAddress),
    sparkWithdraw: await utils.deploy('SparkWithdraw', deployer, adminVaultAddress, loggerAddress),

    strikeSupply: await utils.deploy('StrikeSupply', deployer, adminVaultAddress, loggerAddress),
    strikeWithdraw: await utils.deploy(
      'StrikeWithdraw',
      deployer,
      adminVaultAddress,
      loggerAddress
    ),

    uwuLendSupply: await utils.deploy(
      'UwULendSupply',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.UWU_LEND_POOL
    ),
    uwuLendWithdraw: await utils.deploy(
      'UwULendWithdraw',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.UWU_LEND_POOL
    ),

    yearnSupply: await utils.deploy('YearnSupply', deployer, adminVaultAddress, loggerAddress),
    yearnWithdraw: await utils.deploy('YearnWithdraw', deployer, adminVaultAddress, loggerAddress),

    bendDaoSupply: await utils.deploy(
      'BendDaoSupply',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.BEND_DAO_V1_POOL
    ),
    bendDaoWithdraw: await utils.deploy(
      'BendDaoWithdraw',
      deployer,
      adminVaultAddress,
      loggerAddress,
      constants.BEND_DAO_V1_POOL
    ),
  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }

  console.log('Adding contracts to admin vault');
  // Base contracts
  const curve3PoolSwapAddress = await contracts.curve3PoolSwap.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);

  const buyCoverAddress = await contracts.buyCover.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(buyCoverAddress), buyCoverAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(buyCoverAddress), buyCoverAddress);

  const pullTokenAddress = await contracts.pullToken.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(pullTokenAddress), pullTokenAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(pullTokenAddress), pullTokenAddress);

  const sendTokenAddress = await contracts.sendToken.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(sendTokenAddress), sendTokenAddress);

  // Protocol contracts
  const fluidSupplyAddress = await contracts.fluidSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);

  const fluidWithdrawAddress = await contracts.fluidWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);

  const aaveV2SupplyAddress = await contracts.aaveV2Supply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(aaveV2SupplyAddress), aaveV2SupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(aaveV2SupplyAddress), aaveV2SupplyAddress);

  const aaveV2WithdrawAddress = await contracts.aaveV2Withdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(aaveV2WithdrawAddress), aaveV2WithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(aaveV2WithdrawAddress), aaveV2WithdrawAddress);

  const aaveV3SupplyAddress = await contracts.aaveV3Supply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(aaveV3SupplyAddress), aaveV3SupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(aaveV3SupplyAddress), aaveV3SupplyAddress);

  const aaveV3WithdrawAddress = await contracts.aaveV3Withdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(aaveV3WithdrawAddress), aaveV3WithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(aaveV3WithdrawAddress), aaveV3WithdrawAddress);

  const acrossSupplyAddress = await contracts.acrossSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(acrossSupplyAddress), acrossSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(acrossSupplyAddress), acrossSupplyAddress);

  const acrossWithdrawAddress = await contracts.acrossWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(acrossWithdrawAddress), acrossWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(acrossWithdrawAddress), acrossWithdrawAddress);

  const clearpoolSupplyAddress = await contracts.clearpoolSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(clearpoolSupplyAddress), clearpoolSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(clearpoolSupplyAddress), clearpoolSupplyAddress);

  const clearpoolWithdrawAddress = await contracts.clearpoolWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(clearpoolWithdrawAddress), clearpoolWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(clearpoolWithdrawAddress), clearpoolWithdrawAddress);

  const morphoSupplyAddress = await contracts.morphoSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);

  const morphoWithdrawAddress = await contracts.morphoWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);

  const sparkSupplyAddress = await contracts.sparkSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);

  const sparkWithdrawAddress = await contracts.sparkWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);

  const strikeSupplyAddress = await contracts.strikeSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);

  const strikeWithdrawAddress = await contracts.strikeWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);

  const uwuLendSupplyAddress = await contracts.uwuLendSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(uwuLendSupplyAddress), uwuLendSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(uwuLendSupplyAddress), uwuLendSupplyAddress);

  const uwuLendWithdrawAddress = await contracts.uwuLendWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(uwuLendWithdrawAddress), uwuLendWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(uwuLendWithdrawAddress), uwuLendWithdrawAddress);

  const yearnSupplyAddress = await contracts.yearnSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(yearnSupplyAddress), yearnSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(yearnSupplyAddress), yearnSupplyAddress);

  const yearnWithdrawAddress = await contracts.yearnWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(yearnWithdrawAddress), yearnWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(yearnWithdrawAddress), yearnWithdrawAddress);

  const bendDaoSupplyAddress = await contracts.bendDaoSupply.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(bendDaoSupplyAddress), bendDaoSupplyAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(bendDaoSupplyAddress), bendDaoSupplyAddress);

  const bendDaoWithdrawAddress = await contracts.bendDaoWithdraw.getAddress();
  await baseSetup.adminVault
    .connect(deployer)
    .proposeAction(getBytes4(bendDaoWithdrawAddress), bendDaoWithdrawAddress);
  await baseSetup.adminVault
    .connect(deployer)
    .addAction(getBytes4(bendDaoWithdrawAddress), bendDaoWithdrawAddress);

  console.log('Adding pools to admin vault');
  const FLUID_USDC_ADDRESS = constants.tokenConfig.FLUID_V1_USDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Fluid', FLUID_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Fluid', FLUID_USDC_ADDRESS);
  console.log(`Fluid USDC pool added. PoolId: ${getBytes4(FLUID_USDC_ADDRESS)}`);

  const FLUID_USDT_ADDRESS = constants.tokenConfig.FLUID_V1_USDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Fluid', FLUID_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Fluid', FLUID_USDT_ADDRESS);
  console.log(`Fluid USDT pool added. PoolId: ${getBytes4(FLUID_USDT_ADDRESS)}`);

  const AAVE_V2_USDC_ADDRESS = constants.tokenConfig.AAVE_V2_aUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV2', AAVE_V2_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV2', AAVE_V2_USDC_ADDRESS);
  console.log(`AaveV2 USDC pool added. PoolId: ${getBytes4(AAVE_V2_USDC_ADDRESS)}`);

  const AAVE_V2_USDT_ADDRESS = constants.tokenConfig.AAVE_V2_aUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV2', AAVE_V2_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV2', AAVE_V2_USDT_ADDRESS);
  console.log(`AaveV2 USDT pool added. PoolId: ${getBytes4(AAVE_V2_USDT_ADDRESS)}`);

  const AAVE_V2_DAI_ADDRESS = constants.tokenConfig.AAVE_V2_aDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV2', AAVE_V2_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV2', AAVE_V2_DAI_ADDRESS);
  console.log(`AaveV2 DAI pool added. PoolId: ${getBytes4(AAVE_V2_DAI_ADDRESS)}`);

  const AAVE_V3_USDC_ADDRESS = constants.tokenConfig.AAVE_V3_aUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_USDC_ADDRESS);
  console.log(`AaveV3 USDC pool added. PoolId: ${getBytes4(AAVE_V3_USDC_ADDRESS)}`);

  const AAVE_V3_USDT_ADDRESS = constants.tokenConfig.AAVE_V3_aUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_USDT_ADDRESS);
  console.log(`AaveV3 USDT pool added. PoolId: ${getBytes4(AAVE_V3_USDT_ADDRESS)}`);

  const AAVE_V3_DAI_ADDRESS = constants.tokenConfig.AAVE_V3_aDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('AaveV3', AAVE_V3_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('AaveV3', AAVE_V3_DAI_ADDRESS);
  console.log(`AaveV3 DAI pool added. PoolId: ${getBytes4(AAVE_V3_DAI_ADDRESS)}`);

  const ACROSS_USDC_ADDRESS = constants.tokenConfig.USDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Across', ACROSS_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Across', ACROSS_USDC_ADDRESS);
  console.log(`Across USDC pool added. PoolId: ${getBytes4(ACROSS_USDC_ADDRESS)}`);

  const ACROSS_USDT_ADDRESS = constants.tokenConfig.USDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Across', ACROSS_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Across', ACROSS_USDT_ADDRESS);
  console.log(`Across USDT pool added. PoolId: ${getBytes4(ACROSS_USDT_ADDRESS)}`);

  const ACROSS_DAI_ADDRESS = constants.tokenConfig.DAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Across', ACROSS_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Across', ACROSS_DAI_ADDRESS);
  console.log(`Across DAI pool added. PoolId: ${getBytes4(ACROSS_DAI_ADDRESS)}`);

  const CLEARPOOL_ALPHANONCE_USDC_ADDRESS = constants.tokenConfig.CLEARPOOL_V1_ALP_USDC.address;
  await baseSetup.adminVault
    .connect(deployer)
    .proposePool('Clearpool', CLEARPOOL_ALPHANONCE_USDC_ADDRESS);
  await baseSetup.adminVault
    .connect(deployer)
    .addPool('Clearpool', CLEARPOOL_ALPHANONCE_USDC_ADDRESS);
  console.log(
    `Clearpool Alphanonce USDC pool added. PoolId: ${getBytes4(CLEARPOOL_ALPHANONCE_USDC_ADDRESS)}`
  );

  const CLEARPOOL_AUROS_USDC_ADDRESS = constants.tokenConfig.CLEARPOOL_V1_AUR_USDC.address;
  await baseSetup.adminVault
    .connect(deployer)
    .proposePool('Clearpool', CLEARPOOL_AUROS_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Clearpool', CLEARPOOL_AUROS_USDC_ADDRESS);
  console.log(
    `Clearpool Auros USDC pool added. PoolId: ${getBytes4(CLEARPOOL_AUROS_USDC_ADDRESS)}`
  );

  const MORPHO_FX_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_fxUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_FX_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_FX_USDC_ADDRESS);
  console.log(`Morpho fxUSDC pool added. PoolId: ${getBytes4(MORPHO_FX_USDC_ADDRESS)}`);

  const MORPHO_USUAL_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_USUALUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_USUAL_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_USUAL_USDC_ADDRESS);
  console.log(`Morpho usualUSDC pool added. PoolId: ${getBytes4(MORPHO_USUAL_USDC_ADDRESS)}`);

  const MORPHO_GAUNTLET_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_gtUSDCcore.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_GAUNTLET_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_GAUNTLET_USDC_ADDRESS);
  console.log(`Morpho gauntletUSDC pool added. PoolId: ${getBytes4(MORPHO_GAUNTLET_USDC_ADDRESS)}`);

  const MORPHO_RE7_USDT_ADDRESS = constants.tokenConfig.MORPHO_V1_re7USDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_RE7_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_RE7_USDT_ADDRESS);
  console.log(`Morpho Re7 USDT pool added. PoolId: ${getBytes4(MORPHO_RE7_USDT_ADDRESS)}`);

  const MORPHO_RE_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_reUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_RE_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_RE_USDC_ADDRESS);
  console.log(`Morpho Re USDC pool added. PoolId: ${getBytes4(MORPHO_RE_USDC_ADDRESS)}`);

  const MORPHO_STEAK_USDT_ADDRESS = constants.tokenConfig.MORPHO_V1_steakUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_STEAK_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_STEAK_USDT_ADDRESS);
  console.log(`Morpho Steak USDT pool added. PoolId: ${getBytes4(MORPHO_STEAK_USDT_ADDRESS)}`);

  const MORPHO_V1_GT_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_gtUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_V1_GT_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_V1_GT_USDC_ADDRESS);
  console.log(`Morpho V1 GT USDC pool added. PoolId: ${getBytes4(MORPHO_V1_GT_USDC_ADDRESS)}`);

  const MORPHO_V1_GT_USDT_ADDRESS = constants.tokenConfig.MORPHO_V1_gtUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_V1_GT_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_V1_GT_USDT_ADDRESS);
  console.log(`Morpho V1 GT USDT pool added. PoolId: ${getBytes4(MORPHO_V1_GT_USDT_ADDRESS)}`);

  const MORPHO_STEAK_USDC_ADDRESS = constants.tokenConfig.MORPHO_V1_steakUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Morpho', MORPHO_STEAK_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Morpho', MORPHO_STEAK_USDC_ADDRESS);
  console.log(`Morpho Steak USDC pool added. PoolId: ${getBytes4(MORPHO_STEAK_USDC_ADDRESS)}`);

  const SPARK_DAI_ADDRESS = constants.tokenConfig.sDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Spark', SPARK_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Spark', SPARK_DAI_ADDRESS);
  console.log(`Spark DAI pool added. PoolId: ${getBytes4(SPARK_DAI_ADDRESS)}`);

  const STRIKE_SUSDC_ADDRESS = constants.tokenConfig.sUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Strike', STRIKE_SUSDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Strike', STRIKE_SUSDC_ADDRESS);
  console.log(`Strike sUSDC pool added. PoolId: ${getBytes4(STRIKE_SUSDC_ADDRESS)}`);

  const STRIKE_SUSDT_ADDRESS = constants.tokenConfig.sUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Strike', STRIKE_SUSDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Strike', STRIKE_SUSDT_ADDRESS);
  console.log(`Strike sUSDT pool added. PoolId: ${getBytes4(STRIKE_SUSDT_ADDRESS)}`);

  const UWU_LEND_USDT_ADDRESS = constants.tokenConfig.uUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('UwULend', UWU_LEND_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('UwULend', UWU_LEND_USDT_ADDRESS);
  console.log(`UwULend USDT pool added. PoolId: ${getBytes4(UWU_LEND_USDT_ADDRESS)}`);

  const UWU_LEND_DAI_ADDRESS = constants.tokenConfig.uDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('UwULend', UWU_LEND_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('UwULend', UWU_LEND_DAI_ADDRESS);
  console.log(`UwULend DAI pool added. PoolId: ${getBytes4(UWU_LEND_DAI_ADDRESS)}`);

  const YEARN_DAI_ADDRESS = constants.tokenConfig.yDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Yearn', YEARN_DAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Yearn', YEARN_DAI_ADDRESS);
  console.log(`Yearn DAI pool added. PoolId: ${getBytes4(YEARN_DAI_ADDRESS)}`);

  const YEARN_yvDAI_ADDRESS = constants.tokenConfig.yvDAI.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Yearn', YEARN_yvDAI_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Yearn', YEARN_yvDAI_ADDRESS);
  console.log(`Yearn yvDAI pool added. PoolId: ${getBytes4(YEARN_yvDAI_ADDRESS)}`);

  const BEND_DAO_V1_USDT_ADDRESS = constants.tokenConfig.BEND_V1_USDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('BendDaoV1', BEND_DAO_V1_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('BendDaoV1', BEND_DAO_V1_USDT_ADDRESS);
  console.log(`BendDaoV1 USDT pool added. PoolId: ${getBytes4(BEND_DAO_V1_USDT_ADDRESS)}`);

  // Fund test accounts with USDC
  const fundAmount = ethers.parseUnits('100000', constants.tokenConfig.USDC.decimals);
  for (const account of testAccounts) {
    await stable.fundAccountWithToken(await account.getAddress(), 'USDC', fundAmount);
    console.log(
      `Funded ${await account.getAddress()} with ${ethers.formatUnits(
        fundAmount,
        constants.tokenConfig.USDC.decimals
      )} USDC`
    );
  }

  // Fund test accounts with USDT
  const fundAmountUSDT = ethers.parseUnits('100000', constants.tokenConfig.USDT.decimals);
  for (const account of testAccounts) {
    await stable.fundAccountWithToken(await account.getAddress(), 'USDT', fundAmountUSDT);
    console.log(
      `Funded ${await account.getAddress()} with ${ethers.formatUnits(
        fundAmountUSDT,
        constants.tokenConfig.USDT.decimals
      )} USDT`
    );
  }

  console.log('Deployment and account setup completed');

  return { baseSetup, ...contracts };
}

async function main() {
  const [deployer, ...testAccounts] = await ethers.getSigners();
  await deployAndFundTestnet(deployer, testAccounts);
}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
