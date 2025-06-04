import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

// EIP-712 Domain definition - always uses chainId 1 for cross-chain compatibility
export function createEIP712Domain(verifyingContract: string) {
  return {
    name: 'BravaSafeModule',
    version: '1.0.0',
    chainId: 1, // Always use chainId 1 for cross-chain compatibility
    verifyingContract,
    salt: ethers.keccak256(ethers.toUtf8Bytes('BravaSafeModule'))
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
  verifyingContract: string
): Promise<string> {
  const domain = createEIP712Domain(verifyingContract);
  return await signer.signTypedData(domain, EIP712_TYPES, bundle);
}

/**
 * Creates a simple empty sequence bundle for testing
 * @param signer The signer address
 * @param chainId The chain ID to use
 * @param sequenceNonce The sequence nonce
 * @param expiryOffset How many seconds from now to expire (default 1 hour)
 * @returns A bundle with an empty sequence
 */
export function createEmptyBundle(
  chainId: bigint = BigInt(31337),
  sequenceNonce: bigint = BigInt(0),
  expiryOffset: number = 3600,
  sequenceName: string = 'EmptySequence'
): Bundle {
  return {
    expiry: BigInt(Math.floor(Date.now() / 1000) + expiryOffset),
    sequences: [
      {
        chainId,
        sequenceNonce,
        sequence: {
          name: sequenceName,
          actions: [],
          actionIds: [],
          callData: [],
        },
      },
    ],
  };
}

/**
 * Helper to create a bundle with specific actions
 * @param actions Array of action definitions
 * @param actionIds Array of action IDs (bytes4)
 * @param callData Array of call data
 * @param chainId The chain ID to use
 * @param sequenceNonce The sequence nonce
 * @param expiryOffset How many seconds from now to expire
 * @param sequenceName Name for the sequence
 * @returns A bundle with the specified actions
 */
export function createActionBundle(
  actions: ActionDefinition[],
  actionIds: string[],
  callData: string[],
  chainId: bigint = BigInt(31337),
  sequenceNonce: bigint = BigInt(0),
  expiryOffset: number = 3600,
  sequenceName: string = 'ActionSequence'
): Bundle {
  return {
    expiry: BigInt(Math.floor(Date.now() / 1000) + expiryOffset),
    sequences: [
      {
        chainId,
        sequenceNonce,
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
  verifyingContract: string
): Promise<boolean> {
  try {
    const domain = createEIP712Domain(verifyingContract);
    const recoveredAddress = ethers.verifyTypedData(domain, EIP712_TYPES, bundle, signature);
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error('Signature validation error:', error);
    return false;
  }
} 