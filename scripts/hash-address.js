#!/usr/bin/env node

const { ethers } = require('ethers');

// Get the address from command line arguments
const address = process.argv[2];

if (!address) {
  console.error('Please provide an address as an argument');
  console.log('Usage: node hash-address.js <address>');
  process.exit(1);
}

try {
  // Validate the address
  const normAddress = ethers.getAddress(address); // Normalize the address
  
  // Calculate and display the keccak256 hash
  // This matches the getBytes4 function in utils.ts
  const hash = ethers.keccak256(normAddress);
  const shortHash = hash.slice(0, 10); // First 10 characters (including 0x)
  
  console.log('Address:     ', normAddress);
  console.log('Keccak256:   ', hash);
  console.log('Short hash:  ', shortHash);
  
  // Also output how it's used in getBytes4 function
  console.log('Used as poolId:', shortHash);
  
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
} 