import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { getBytes4 } from '../tests/utils';

export async function addActions(deployer: Signer) {
  console.log('Adding actions with the account:', await deployer.getAddress());


  const adminVaultAddress = "";

  const curve3PoolSwapAddress = "";
  const buyCoverAddress = "";
  const pullTokenAddress = "";
  const sendTokenAddress = "";
  const fluidSupplyAddress = "";
  const fluidWithdrawAddress = "";
  const aaveV3SupplyAddress = "";
  const aaveV3WithdrawAddress = "";
  const morphoSupplyAddress = "";
  const morphoWithdrawAddress = "";
  const sparkSupplyAddress = "";
  const sparkWithdrawAddress = "";
  const notionalV3SupplyAddress = "";
  const notionalV3WithdrawAddress = "";
  const yearnV3SupplyAddress = "";
  const yearnV3WithdrawAddress = "";
  const gearboxPassiveSupplyAddress = "";
  const gearboxPassiveWithdrawAddress = "";

  const adminVault = await ethers.getContractAt('AdminVault', adminVaultAddress);

  console.log('Adding contracts to admin vault');
  // Base contracts
  await adminVault.connect(deployer).proposeAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);
  await adminVault.connect(deployer).addAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(buyCoverAddress), buyCoverAddress);
  await adminVault.connect(deployer).addAction(getBytes4(buyCoverAddress), buyCoverAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(pullTokenAddress), pullTokenAddress);
  await adminVault.connect(deployer).addAction(getBytes4(pullTokenAddress), pullTokenAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
  await adminVault.connect(deployer).addAction(getBytes4(sendTokenAddress), sendTokenAddress);

  // Protocol contracts
  await adminVault.connect(deployer).proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(aaveV3SupplyAddress), aaveV3SupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(aaveV3SupplyAddress), aaveV3SupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(aaveV3WithdrawAddress), aaveV3WithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(aaveV3WithdrawAddress), aaveV3WithdrawAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(morphoSupplyAddress), morphoSupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(morphoWithdrawAddress), morphoWithdrawAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(sparkSupplyAddress), sparkSupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(sparkWithdrawAddress), sparkWithdrawAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(notionalV3SupplyAddress), notionalV3SupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(notionalV3SupplyAddress), notionalV3SupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(notionalV3WithdrawAddress), notionalV3WithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(notionalV3WithdrawAddress), notionalV3WithdrawAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(yearnV3SupplyAddress), yearnV3SupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(yearnV3SupplyAddress), yearnV3SupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(yearnV3WithdrawAddress), yearnV3WithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(yearnV3WithdrawAddress), yearnV3WithdrawAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(gearboxPassiveSupplyAddress), gearboxPassiveSupplyAddress);
  await adminVault.connect(deployer).addAction(getBytes4(gearboxPassiveSupplyAddress), gearboxPassiveSupplyAddress);

  await adminVault.connect(deployer).proposeAction(getBytes4(gearboxPassiveWithdrawAddress), gearboxPassiveWithdrawAddress);
  await adminVault.connect(deployer).addAction(getBytes4(gearboxPassiveWithdrawAddress), gearboxPassiveWithdrawAddress);

  console.log('Setup completed');
}

async function main() {
  const [deployer] = await ethers.getSigners();
  await addActions(deployer);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });