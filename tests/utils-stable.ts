import { ethers } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { formatUnits } from 'ethers';
import * as constants from './constants';
import { log } from './utils';
import { IERC20, IERC20Metadata } from '../typechain-types';

const hre: HardhatRuntimeEnvironment = require('hardhat');

/**
 * Generic token contract getter for accessing any token from tokenConfig by symbol
 * 
 * @param tokenSymbol The symbol of the token to get (e.g., 'USDC', 'USDT', 'DAI', 'USDS')
 * @returns An IERC20Metadata interface for the token contract
 */
async function getTokenContract(tokenSymbol: string): Promise<IERC20Metadata>;
/**
 * Generic token contract getter for accessing multiple tokens from tokenConfig by symbols
 * 
 * @param tokenSymbols Array of token symbols to get (e.g., ['USDC', 'USDT', 'DAI', 'USDS'])
 * @returns An object with token symbols as keys and IERC20Metadata interfaces as values
 */
async function getTokenContract(tokenSymbols: string[]): Promise<Record<string, IERC20Metadata>>;
/**
 * Implementation of getTokenContract
 */
async function getTokenContract(tokenSymbol: string | string[]): Promise<IERC20Metadata | Record<string, IERC20Metadata>> {
  // Handle array of token symbols
  if (Array.isArray(tokenSymbol)) {
    const result: Record<string, IERC20Metadata> = {};
    await Promise.all(
      tokenSymbol.map(async (symbol) => {
        result[symbol] = await getTokenContractSingle(symbol);
      })
    );
    return result;
  }
  
  // Handle single token symbol
  return getTokenContractSingle(tokenSymbol);
}

/**
 * Internal helper for getting a single token contract
 */
const getTokenContractSingle = async (tokenSymbol: string): Promise<IERC20Metadata> => {
  const token = constants.tokenConfig[tokenSymbol as keyof typeof constants.tokenConfig];
  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }
  
  // Always return IERC20Metadata to fix type errors
  return ethers.getContractAt('IERC20Metadata', token.address) as unknown as IERC20Metadata;
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

export { fundAccountWithToken, getTokenContract };
