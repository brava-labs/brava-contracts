import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

// EIP-712 Domain definition - uses chainID 1 for cross-chain compatibility
export function createEIP712Domain(verifyingContract: string, chainId?: number) {
  return {
    name: 'BravaSafeModule',
    version: '1.0.0',
    chainId: chainId || 1, // Default to chainID 1 for cross-chain compatibility
    verifyingContract,
    salt: ethers.keccak256(ethers.toUtf8Bytes('BravaSafe'))
  };
}

// EIP-712 Type definitions that match our contract's type hashes exactly
export const EIP712_TYPES = {
  Bundle: [
    { name: 'expiry', type: 'uint256' },
    { name: 'sequences', type: 'ChainSequence[]' }
  ],
  ChainSequence: [
    { name: 'chainId', type: 'uint256' },
    { name: 'sequenceNonce', type: 'uint256' },
    { name: 'deploySafe', type: 'bool' },
    { name: 'sequence', type: 'Sequence' }
  ],
  Sequence: [
    { name: 'name', type: 'string' },
    { name: 'actions', type: 'ActionDefinition[]' },
    { name: 'actionIds', type: 'bytes4[]' },
    { name: 'callData', type: 'bytes[]' }
  ],
  ActionDefinition: [
    { name: 'protocolName', type: 'string' },
    { name: 'actionType', type: 'uint8' }
  ]
};

// Type definitions for bundle structure
export interface ActionDefinition {
  protocolName: string;
  actionType: number;
}

export interface Sequence {
  name: string;
  actions: ActionDefinition[];
  actionIds: string[];
  callData: string[];
}

export interface ChainSequence {
  chainId: bigint;
  sequenceNonce: bigint;
  deploySafe: boolean;
  sequence: Sequence;
}

export interface Bundle {
  expiry: bigint;
  sequences: ChainSequence[];
}

/**
 * Signs a bundle using EIP-712 typed data signing
 * @param signer The signer to use
 * @param bundle The bundle to sign
 * @param verifyingContract The contract address for the domain
 * @returns The signature string
 */
export async function signBundle(
  signer: HardhatEthersSigner,
  bundle: Bundle,
  verifyingContract: string,
  chainId?: number
): Promise<string> {
  const domain = createEIP712Domain(verifyingContract, chainId);
  return await signer.signTypedData(domain, EIP712_TYPES, bundle);
}

/**
 * Creates a bundle with optional actions (empty bundle if no actions provided)
 * @param options Configuration options for the bundle
 * @param options.actions Array of action definitions (default: [])
 * @param options.actionIds Array of action IDs (bytes4) (default: [])
 * @param options.callData Array of call data (default: [])
 * @param options.chainId The chain ID to use (default: 31337 for local testing)
 * @param options.sequenceNonce The sequence nonce (default: 0)
 * @param options.expiryOffset How many seconds from now to expire (default: 1 hour)
 * @param options.sequenceName Name for the sequence (default: 'Sequence')
 * @param options.deploySafe Whether to deploy Safe for this sequence (default: false)
 * @returns A bundle with the specified or empty actions
 */
export function createBundle(options: {
  actions?: ActionDefinition[];
  actionIds?: string[];
  callData?: string[];
  chainId?: bigint;
  sequenceNonce?: bigint;
  expiryOffset?: number;
  sequenceName?: string;
  deploySafe?: boolean;
} = {}): Bundle {
  const {
    actions = [],
    actionIds = [],
    callData = [],
    chainId = BigInt(31337),
    sequenceNonce = BigInt(0),
    expiryOffset = 3600,
    sequenceName = 'Sequence',
    deploySafe = false
  } = options;

  return {
    expiry: BigInt(Math.floor(Date.now() / 1000) + expiryOffset),
    sequences: [
      {
        chainId,
        sequenceNonce,
        deploySafe,
        sequence: {
          name: sequenceName,
          actions,
          actionIds,
          callData,
        },
      },
    ],
  };
}

/**
 * Validates that a signature was created correctly by comparing recovered address
 * @param bundle The bundle that was signed
 * @param signature The signature to validate
 * @param expectedSigner The expected signer address
 * @param verifyingContract The contract address for the domain
 * @returns True if the signature is valid
 */
export async function validateBundleSignature(
  bundle: Bundle,
  signature: string,
  expectedSigner: string,
  verifyingContract: string,
  chainId?: number
): Promise<boolean> {
  try {
    const domain = createEIP712Domain(verifyingContract, chainId);
    const recoveredAddress = ethers.verifyTypedData(domain, EIP712_TYPES, bundle, signature);
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error('Signature validation error:', error);
    return false;
  }
} 