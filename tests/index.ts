// Third-party imports
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { Signer, Contract } from 'ethers';

// Local imports
import * as constants from '../scripts/constants';
import { deploySetup } from '../scripts/deploy-setup';
import { deploySafe, executeSafeTransaction } from '../scripts/safe';
import { fundAccountWithStablecoin } from '../scripts/stablecoin-fund';

// Type imports
import { IERC20 } from '../typechain-types/interfaces/IERC20';
import { Curve3PoolSwap } from '../typechain-types/actions/swap/Curve3PoolSwap';
import { ISafe } from '../typechain-types/interfaces/safe/ISafe';

// Re-exports
export { ethers, expect, Signer, Contract, constants };
export { deploySetup, deploySafe, executeSafeTransaction, fundAccountWithStablecoin };
export { IERC20, Curve3PoolSwap, ISafe };

// Stablecoin contract getters
export const getUSDC = () => ethers.getContractAt('IERC20', constants.tokenConfig.USDC.address);
export const getUSDT = () => ethers.getContractAt('IERC20', constants.tokenConfig.USDT.address);
export const getDAI = () => ethers.getContractAt('IERC20', constants.tokenConfig.DAI.address);
