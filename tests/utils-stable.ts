import { ethers } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { formatUnits } from 'ethers';
import * as constants from './constants';
import { log } from './utils';

const hre: HardhatRuntimeEnvironment = require('hardhat');

// Stablecoin contract getters
const getUSDC = () => ethers.getContractAt('IERC20Metadata', constants.tokenConfig.USDC.address);
const getUSDT = () => ethers.getContractAt('IERC20Metadata', constants.tokenConfig.USDT.address);
const getDAI = () => ethers.getContractAt('IERC20Metadata', constants.tokenConfig.DAI.address);
const getUSDE = () => ethers.getContractAt('IERC20Metadata', constants.tokenConfig.USDE.address);
const getStables = async () => {
  return { USDC: await getUSDC(), USDT: await getUSDT(), DAI: await getDAI(), USDE: await getUSDE() };
};

async function fundAccountWithToken(
  recipient: string,
  tokenSymbol: string,
  amount: number | bigint
) {
  const token = constants.tokenConfig[tokenSymbol as keyof typeof constants.tokenConfig];

  // if we have a number, we assume it's dollars and need to add decimals
  // if we have a bigint, we assume it's already in the correct format
  const parsedAmount =
    typeof amount === 'number'
      ? ethers.parseUnits(amount.toString(), token.decimals)
      : BigInt(amount);

  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }

  const whaleBalance = await ethers.provider.getBalance(token.whale);
  // If the whale doesn't have ETH, lets send them some
  if (whaleBalance < ethers.parseEther('1')) {
    log(`Whale does not have enough ETH to do a transfer, forcing a 1 ETH balance`);
    await hre.network.provider.send('hardhat_setBalance', [token.whale, '0xDE0B6B3A7640000']);
  }
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [token.whale],
  });

  const whaleSigner = await ethers.getSigner(token.whale);
  const tokenContract = await ethers.getContractAt('IERC20', token.address, whaleSigner);

  // Check the whale has enough tokens to do a transfer
  const whaleTokenBalance = await tokenContract.balanceOf(token.whale);
  if (whaleTokenBalance < parsedAmount) {
    throw new Error(
      `Whale ${token.whale} does not have ${parsedAmount} ${tokenSymbol} to do a transfer`
    );
  }

  await tokenContract.transfer(recipient, parsedAmount.toString());

  await hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [token.whale],
  });

  log(
    `Funded ${recipient} with ${formatUnits(
      parsedAmount.toString(),
      token.decimals
    )} ${tokenSymbol}`
  );
}

export { fundAccountWithToken, getStables, getUSDC, getUSDT, getDAI, getUSDE };
