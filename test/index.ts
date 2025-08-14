// Third-party imports
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

// Import chai matchers for Hardhat
import '@nomicfoundation/hardhat-chai-matchers';

// Local imports
import * as utils from './utils';
import * as constants from './constants';
import * as stable from './utils-stable';
import { log } from './shared-utils';

// Re-exports
export { utils, ethers, expect, Contract, constants, stable, log, HardhatEthersSigner };

// For backward compatibility, alias HardhatEthersSigner as Signer
export { HardhatEthersSigner as Signer };
