import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { formatUnits } from "ethers";

const hre: HardhatRuntimeEnvironment = require("hardhat");

async function fundAccountWithStablecoin(
  recipient: string,
  tokenSymbol: string,
  amount: number
) {
  const tokenConfig = {
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      whale: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
      decimals: 6,
    },
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      whale: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
      decimals: 6,
    },
    DAI: {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      whale: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
      decimals: 18,
    },
  };

  const token = tokenConfig[tokenSymbol as keyof typeof tokenConfig];
  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [token.whale],
  });

  const whaleSigner = await ethers.getSigner(token.whale);
  const tokenContract = await ethers.getContractAt(
    "IERC20",
    token.address,
    whaleSigner
  );

  const amountBN = BigNumber.from(amount);
  const amountToSend = amountBN.mul(BigNumber.from(10).pow(token.decimals));
  await tokenContract.transfer(recipient, amountToSend.toString());

  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [token.whale],
  });

  console.log(
    `Funded ${recipient} with ${formatUnits(
      amountToSend.toString(),
      token.decimals
    )} ${tokenSymbol}`
  );
}

export async function main(
  recipient?: string,
  tokenSymbol?: string,
  amountStr?: string
) {
  if (!recipient || !tokenSymbol || !amountStr) {
    const args = process.argv.slice(2);
    if (args.length !== 3) {
      console.error(
        "Usage: npx hardhat run scripts/stablecoin-fund.ts <recipient> <tokenSymbol> <amount>"
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
