import { deploySafe } from 'athenafi-ts-client';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';

export async function deploySafeForSigner(signer: Signer, safeProxyFactoryAddress: string): Promise<string> {
  const safe = await deploySafe(signer, safeProxyFactoryAddress);
  console.log(`Safe for signer ${await signer.getAddress()} deployed at: ${safe}`);
  return safe;
}

export async function approveTokenForSafe(signer: Signer, safeAddress: string, tokenAddress: string, amount: bigint) {
  const token = await ethers.getContractAt('IERC20Metadata', tokenAddress);
  await token.connect(signer).approve(safeAddress, amount);
  console.log(`Approved ${amount} ${await token.symbol()} for safe ${safeAddress} by ${await signer.getAddress()}`);
}
