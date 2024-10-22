import { Pool } from 'athena-sdk';
import { ethers } from 'hardhat';
import { constants } from '../tests';
import { deposit } from './deposit';
import { approveTokenForSafe, deploySafeForSigner } from './safe-setup';
import { deployAndFundTestnet } from './testnet-deploy-and-fund';

async function testnetSetup() {
  const [deployer, ...testAccounts] = await ethers.getSigners();
  const contracts = await deployAndFundTestnet(deployer, testAccounts);
  const safeAddress = await deploySafeForSigner(testAccounts[0], await contracts.baseSetup.safeProxyFactory.getAddress());
  
  // Approve USDC for the Safe
  await approveTokenForSafe(testAccounts[0], safeAddress, constants.tokenConfig.USDC.address, ethers.MaxUint256);
  // Define deposit parameters
  const depositAmount = 1000000000n; // 1000 USDC (assuming 6 decimal places)
  const strategyId = 1;
  const pool = Pool.FluidUSDC;

  await deposit(testAccounts[0], safeAddress, await contracts.sequenceExecutor.getAddress(), pool, depositAmount, strategyId);

  console.log(`Deposited ${depositAmount} USDC into ${pool} for strategy ${strategyId}`);

  await approveTokenForSafe(testAccounts[0], safeAddress, constants.tokenConfig.USDT.address, ethers.MaxUint256);
  await deposit(testAccounts[0], safeAddress, await contracts.sequenceExecutor.getAddress(), Pool.FluidUSDT, depositAmount, strategyId);

  console.log(`Deposited ${depositAmount} USDT into ${pool} for strategy ${strategyId}`);
}

async function main() {
  await testnetSetup();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
