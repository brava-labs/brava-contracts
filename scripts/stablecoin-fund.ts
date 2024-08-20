import { ethers } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { formatUnits } from 'ethers';
import { tokenConfig } from './constants';

const hre: HardhatRuntimeEnvironment = require('hardhat');

async function fundAccountWithStablecoin(recipient: string, tokenSymbol: string, amount: number) {
  const token = tokenConfig[tokenSymbol as keyof typeof tokenConfig];

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

  console.log(
    `Funded ${recipient} with ${formatUnits(
      amountToSend.toString(),
      token.decimals
    )} ${tokenSymbol}`
  );
}

export async function main(recipient?: string, tokenSymbol?: string, amountStr?: string) {
  if (!recipient || !tokenSymbol || !amountStr) {
    const args = process.argv.slice(2);
    if (args.length !== 3) {
      console.error(
        'Usage: npx hardhat run scripts/stablecoin-fund.ts <recipient> <tokenSymbol> <amount>'
      );
      process.exit(1);
    }
    [recipient, tokenSymbol, amountStr] = args;
  }

  const amount = BigNumber.from(amountStr);
  await fundAccountWithStablecoin(recipient, tokenSymbol, amount.toNumber());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { fundAccountWithStablecoin };
