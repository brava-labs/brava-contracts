import { ethers } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { formatUnits } from 'ethers';
import * as constants from './constants';
import { log } from './utils';

const hre: HardhatRuntimeEnvironment = require('hardhat');

// Stablecoin contract getters
const getUSDC = () => ethers.getContractAt('IERC20', constants.tokenConfig.USDC.address);
const getUSDT = () => ethers.getContractAt('IERC20', constants.tokenConfig.USDT.address);
const getDAI = () => ethers.getContractAt('IERC20', constants.tokenConfig.DAI.address);
const getStables = async () => {
  return { USDC: await getUSDC(), USDT: await getUSDT(), DAI: await getDAI() };
};

async function fundAccountWithStablecoin(recipient: string, tokenSymbol: string, amount: number) {
  const token = constants.tokenConfig[tokenSymbol as keyof typeof constants.tokenConfig];

  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [token.whale],
  });

  const whaleSigner = await ethers.getSigner(token.whale);
  const tokenContract = await ethers.getContractAt('IERC20', token.address, whaleSigner);

  const amountBN = BigNumber.from(amount);
  const amountToSend = amountBN.mul(BigNumber.from(10).pow(token.decimals));
  await tokenContract.transfer(recipient, amountToSend.toString());

  await hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [token.whale],
  });

  log(
    `Funded ${recipient} with ${formatUnits(
      amountToSend.toString(),
      token.decimals
    )} ${tokenSymbol}`
  );
}

export { fundAccountWithStablecoin, getStables, getUSDC, getUSDT, getDAI };
