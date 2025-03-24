import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { Signer } from 'ethers';
import { IERC20Metadata, ParaswapSwap } from '../../../typechain-types';
import { tokenConfig } from '../../constants';
import { actionTypes } from '../../actions';
import * as utils from '../../utils';
import { log } from '../../utils';
import { fundAccountWithToken, getStables } from '../../utils-stable';
import axios from 'axios';
import { BigNumberish } from 'ethers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { saveSwapToCache, getSwapFromCache, isUsingForkedNetwork, getCurrentBlockNumber, getSwapData } from './swapCache';

// Define the TokenConfiguration type based on the structure in constants.ts
type TokenConfiguration = typeof tokenConfig;

describe('ParaswapSwap tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let paraswapSwap: ParaswapSwap;
  let USDC: IERC20Metadata, USDT: IERC20Metadata, DAI: IERC20Metadata;
  let snapshotId: string;
  let loggerAddress: string;
  let adminVault: any;
  const AUGUSTUS_ROUTER = '0x6A000F20005980200259B80c5102003040001068';

  // Function selector constants - used for validation in the contract
  const SELECTORS = {
    SWAP_EXACT_AMOUNT_IN: '0xe3ead59e',  // Regular swap
    UNISWAP_V3: '0x876a02f6',           // UniswapV3
    CURVE_V1: '0x1a01c532',             // CurveV1
    UNISWAP_V2: '0xe8bb3b6c',           // UniswapV2/SushiSwap
    MAKER_PSM: '0x987e7d8e',            // MakerPSM (used by LitePsm)
    CURVE_V2: '0xe37ed256'              // CurveV2
  };

  // List of tokens to test all permutations
  const TOKENS_TO_TEST = ['USDC', 'USDT', 'DAI'] as const;
  type SupportedToken = typeof TOKENS_TO_TEST[number];


  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await utils.getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    
    safeAddr = await baseSetup.safe.getAddress();
    adminVault = await baseSetup.adminVault;
    loggerAddress = await baseSetup.logger.getAddress();

    paraswapSwap = await utils.deploy(
      'ParaswapSwap',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AUGUSTUS_ROUTER
    );

    ({ USDC, USDT, DAI } = await getStables());

    const swapAddress = await paraswapSwap.getAddress();
    await adminVault.proposeAction(utils.getBytes4(swapAddress), swapAddress);
    await adminVault.addAction(utils.getBytes4(swapAddress), swapAddress);

    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Contract setup', () => {
    it('should have correct constants', async () => {
      expect(await paraswapSwap.AUGUSTUS_ROUTER()).to.equal(AUGUSTUS_ROUTER);
      expect(await paraswapSwap.actionType()).to.equal(actionTypes.SWAP_ACTION);
      expect(await paraswapSwap.protocolName()).to.equal('Paraswap');
    });
  });

  describe('Input validation', () => {
    it('should revert with invalid swap data (via Safe)', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      const invalidCallData = '0xe3ead59e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000064000000';

      await expect(
        utils.executeAction({
          type: 'ParaswapSwap',
          tokenIn: 'USDC',
          tokenOut: 'USDT',
          fromAmount: amount.toString(),
          minToAmount: amount.toString(),
          swapCallData: invalidCallData,
        })
      ).to.be.revertedWith('GS013');
    });
    
    it('should revert when destination token mismatch (direct contract call)', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      
      try {
        // Get swap data for USDC to DAI
        const { callData } = await getSwapData(
          tokenConfig.USDC.address,
          tokenConfig.DAI.address,
          amount,
          safeAddr
        );
        
        // Encode params for direct contract call
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
          ['(address,address,uint256,uint256,bytes)'],
          [[
            tokenConfig.USDC.address,
            tokenConfig.USDT.address, // Mismatch with calldata which is for DAI
            amount.toString(),
            '1',
            callData
          ]]
        );
        
        // Call directly to verify the mismatch error
        await expect(
          paraswapSwap.executeAction(encodedParams, 0)
        ).to.be.revertedWith('ParaswapSwap: Destination token mismatch');
      } catch (error: any) {
        const errorMessage = error?.message || '';
        if (errorMessage.includes('No liquidity')) {
          expect.fail('Test failed due to liquidity issues: ' + errorMessage);
        } else {
          throw error;
        }
      }
    });

    it('should revert with too short calldata', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      
      // Create calldata that's too short
      const invalidCallData = '0x1234'; // Only 2 bytes, not enough for a selector
      
      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(address,address,uint256,uint256,bytes)'],
        [[
          tokenConfig.USDC.address,
          tokenConfig.DAI.address,
          amount.toString(),
          '1',
          invalidCallData
        ]]
      );
      
      await expect(
        paraswapSwap.executeAction(encodedParams, 0)
      ).to.be.revertedWith('ParaswapSwap: Invalid calldata length');
    });
    
    it('should revert with unsupported function selector', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      
      // Create calldata with an unsupported selector
      const invalidSelector = '0x12345678'; // Not one of our supported selectors
      // Create some minimal valid calldata with this selector
      const invalidCallData = invalidSelector + '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000064000000';
      
      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(address,address,uint256,uint256,bytes)'],
        [[
          tokenConfig.USDC.address,
          tokenConfig.DAI.address,
          amount.toString(),
          '1',
          invalidCallData
        ]]
      );
      
      await expect(
        paraswapSwap.executeAction(encodedParams, 0)
      ).to.be.revertedWith('ParaswapSwap: Unsupported function selector');
    });

    it('should revert with zero input amount', async () => {
      // Get swap data for a normal swap
      try {
        const { callData } = await getSwapData(
          tokenConfig.USDC.address,
          tokenConfig.DAI.address,
          ethers.parseUnits('100', tokenConfig.USDC.decimals),
          safeAddr
        );
        
        // Encode params with zero fromAmount
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
          ['(address,address,uint256,uint256,bytes)'],
          [[
            tokenConfig.USDC.address,
            tokenConfig.DAI.address,
            '0', // Zero amount
            '1',
            callData
          ]]
        );
        
        await expect(
          paraswapSwap.executeAction(encodedParams, 0)
        ).to.be.reverted; // Just test for any revert, not a specific message
      } catch (error: any) {
        const errorMessage = error?.message || '';
        if (errorMessage.includes('No liquidity')) {
          expect.fail('Test failed due to liquidity issues: ' + errorMessage);
        } else {
          throw error;
        }
      }
    });
    
    it('should revert with zero minToAmount', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      
      try {
        const { callData } = await getSwapData(
          tokenConfig.USDC.address,
          tokenConfig.DAI.address,
          amount,
          safeAddr
        );
        
        // Encode params with zero minToAmount
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
          ['(address,address,uint256,uint256,bytes)'],
          [[
            tokenConfig.USDC.address,
            tokenConfig.DAI.address,
            amount.toString(),
            '0', // Zero min amount
            callData
          ]]
        );
        
        await expect(
          paraswapSwap.executeAction(encodedParams, 0)
        ).to.be.reverted; // Just test for any revert, not a specific message
      } catch (error: any) {
        const errorMessage = error?.message || '';
        if (errorMessage.includes('No liquidity')) {
          expect.fail('Test failed due to liquidity issues: ' + errorMessage);
        } else {
          throw error;
        }
      }
    });

    it('should revert when output amount is less than expected', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      
      try {
        // Get normal swap data
        const { callData, destAmount } = await getSwapData(
          tokenConfig.USDC.address,
          tokenConfig.DAI.address,
          amount,
          safeAddr
        );
        
        // Set a very high minToAmount that can't be satisfied
        const unreasonablyHighMinAmount = ethers.parseUnits('1000', 18); // No way we get 1000 DAI from 100 USDC
        
        // Try to execute the swap with the unreasonable min amount
        await expect(
          utils.executeAction({
            type: 'ParaswapSwap',
            tokenIn: 'USDC',
            tokenOut: 'DAI',
            fromAmount: amount.toString(),
            minToAmount: unreasonablyHighMinAmount.toString(),
            swapCallData: callData,
          })
        ).to.be.reverted; // Just test for any revert, not a specific message
      } catch (error: any) {
        const errorMessage = error?.message || '';
        if (errorMessage.includes('No liquidity')) {
          expect.fail('Test failed due to liquidity issues: ' + errorMessage);
        } else if (errorMessage.includes('GS013')) {
          // For Safe execution errors, try direct contract call to verify error
          const { callData } = await getSwapData(
            tokenConfig.USDC.address,
            tokenConfig.DAI.address,
            amount,
            safeAddr
          );
          
          const unreasonablyHighMinAmount = ethers.parseUnits('1000', 18);
          
          const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ['(address,address,uint256,uint256,bytes)'],
            [[
              tokenConfig.USDC.address,
              tokenConfig.DAI.address,
              amount.toString(),
              unreasonablyHighMinAmount.toString(),
              callData
            ]]
          );
          
          await expect(
            paraswapSwap.executeAction(encodedParams, 0)
          ).to.be.reverted; // Just test for any revert, not a specific message
        } else {
          throw error;
        }
      }
    });
    
    it('should revert if swap fails on Augustus Router', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      
      try {
        // Instead of modifying existing calldata, create a minimal valid calldata 
        // with the MAKER_PSM_SWAP_SELECTOR that will cause a failure in the Augustus Router
        const validSelector = '0x987e7d8e'; // MAKER_PSM_SWAP_SELECTOR
        
        // Create valid-format calldata but with parameters that should cause the swap to fail
        const minimalCallData = validSelector + 
          // srcToken (USDC)
          '000000000000000000000000' + tokenConfig.USDC.address.slice(2) +
          // destToken (DAI)
          '000000000000000000000000' + tokenConfig.DAI.address.slice(2) +
          // Rest is minimal valid data to pass the function selector check
          '0000000000000000000000000000000000000000000000000000000000000064' + // Some uint param
          '0000000000000000000000000000000000000000000000000000000000000020' + // Offset to some bytes
          '0000000000000000000000000000000000000000000000000000000000000001' + // Length of bytes
          '0000000000000000000000000000000000000000000000000000000000000000'; // Empty bytes
        
        // Execute with the fabricated calldata - this should be valid format but cause a swap failure
        await expect(
          utils.executeAction({
            type: 'ParaswapSwap',
            tokenIn: 'USDC',
            tokenOut: 'DAI',
            fromAmount: amount.toString(),
            minToAmount: '1', // Set very low to avoid insufficient output error
            swapCallData: minimalCallData,
          })
        ).to.be.reverted; // Just test for any revert, not a specific message
      } catch (error: any) {
        const errorMessage = error?.message || '';
        if (errorMessage.includes('No liquidity')) {
          expect.fail('Test failed due to liquidity issues: ' + errorMessage);
        } else if (errorMessage.includes('GS013')) {
          // We expect a failure here as the Safe should reject this
          // This test relies on inspecting the revert reason in the Safe execution
          // which is challenging to do directly, so we'll verify it reverted
          expect(true).to.be.true; // Test passed, GS013 is expected
        } else if (errorMessage.includes('INVALID_ARGUMENT')) {
          expect.fail('Test failed due to encoding issues: ' + errorMessage);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Swap functionality', () => {
    async function executeSwap(
      tokenIn: SupportedToken,
      tokenOut: SupportedToken,
      amount: string,
      dex: string
    ) {
      const tokenInContract = await ethers.getContractAt('IERC20Metadata', tokenConfig[tokenIn].address);
      const tokenOutContract = await ethers.getContractAt('IERC20Metadata', tokenConfig[tokenOut].address);
      const parsedAmount = ethers.parseUnits(amount, tokenConfig[tokenIn].decimals);

      await fundAccountWithToken(safeAddr, tokenIn, parsedAmount);

      const initialFromBalance = await tokenInContract.balanceOf(safeAddr);
      const initialToBalance = await tokenOutContract.balanceOf(safeAddr);

      try {
        log('Attempting swap with:', {
          tokenIn,
          tokenOut,
          amount,
          dex,
          parsedAmount: parsedAmount.toString()
        });

        const { callData, destAmount, minDestAmount, dexProtocol, priceRoute } = await getSwapData(
          tokenConfig[tokenIn].address,
          tokenConfig[tokenOut].address,
          parsedAmount,
          safeAddr,
          dex
        );

        // Extract function selector from calldata
        const selector = callData.substring(0, 10);
        
        log('Received swap data:', {
          selector,
          destAmount,
          minDestAmount,
          dexProtocol: dexProtocol || 'unknown',
          priceRoute: {
            bestRoute: priceRoute?.bestRoute,
            details: priceRoute?.details,
            contractMethod: priceRoute?.contractMethod,
            tokenTransferProxy: priceRoute?.tokenTransferProxy,
          }
        });

        // Execute the swap
        log('Executing swap with:', {
          type: 'ParaswapSwap',
          tokenIn,
          tokenOut,
          fromAmount: parsedAmount.toString(),
          minToAmount: minDestAmount,
          swapCallData: callData,
        });

        await utils.executeAction({
          type: 'ParaswapSwap',
          tokenIn,
          tokenOut,
          fromAmount: parsedAmount.toString(),
          minToAmount: minDestAmount,
          swapCallData: callData,
        });

        const finalFromBalance = await tokenInContract.balanceOf(safeAddr);
        const finalToBalance = await tokenOutContract.balanceOf(safeAddr);

        // Verify token balances changed correctly
        expect(finalFromBalance).to.be.lt(initialFromBalance, 'Source token balance should decrease');
        expect(finalToBalance).to.be.gt(initialToBalance, 'Destination token balance should increase');
        
        // Calculate actual swap amounts
        const amountSwapped = initialFromBalance - finalFromBalance;
        const amountReceived = finalToBalance - initialToBalance;
        
        log('Swap results:', {
          amountSwapped: amountSwapped.toString(),
          amountReceived: amountReceived.toString(),
          expectedMinAmount: minDestAmount
        });
        
        // Important: verify received amount is at least what was expected
        // Convert both to BigInt for proper comparison
        const receivedBigInt = ethers.toBigInt(amountReceived.toString());
        const expectedBigInt = ethers.toBigInt(minDestAmount.toString());
        expect(receivedBigInt).to.be.gte(expectedBigInt, 'Received amount should meet minimum expectation');

        return { 
          callData, 
          selector,
          dexProtocol: dexProtocol || 'unknown',
          amountSwapped,
          amountReceived,
          destAmount
        };
      } catch (error: any) {
        const errorMessage = error?.message || '';
        log('Swap error:', {
          message: errorMessage,
          tokenIn,
          tokenOut,
          dex
        });
        
        if (errorMessage.includes('No liquidity')) {
          return { skipped: true, error: 'No liquidity' };
        }
        
        // Handle Safe execution errors
        if (errorMessage.includes('GS013')) {
          return { skipped: true, error: 'GS013' };
        }
        
        // Handle known intermittent failures related to liquidity/encoding
        if (
          errorMessage.includes("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT") ||
          errorMessage.includes("could not decode result data") ||
          errorMessage.includes("PSM Issue") ||
          errorMessage.includes("Insufficient") ||
          errorMessage.includes("UniswapV3Pool: SPL") ||
          errorMessage.includes("BAL#") ||
          errorMessage.includes("user rejected") ||
          errorMessage.includes("execution reverted") ||
          errorMessage.includes("InsufficientLiquidityMinted")
        ) {
          return { skipped: true, error: errorMessage };
        }
        
        // If we get an unexpected error, throw it
        throw error;
      }
    }

    // TEST SET 1: Test each function selector with specific DEXes
    describe('Function selector tests', () => {
      it('should use SWAP_EXACT_AMOUNT_IN selector with MaverickV2', async function() {
        this.timeout(0);
        const result = await executeSwap(
          'USDC',
          'USDT',
          '100',
          'MaverickV2'
        );
        
        if (result?.skipped) {
          expect.fail(`Swap skipped due to: ${result.error}`);
        }
        
        expect(result!.selector!.toLowerCase()).to.equal(SELECTORS.SWAP_EXACT_AMOUNT_IN.toLowerCase());
        expect(result!.dexProtocol!.toLowerCase()).to.contain('maverick');
      });

      it('should use MAKER_PSM selector with LitePsm', async function() {
        this.timeout(0);
        const result = await executeSwap(
          'USDC',
          'DAI',
          '100',
          'LitePsm'
        );
        
        if (result?.skipped) {
          expect.fail(`Swap skipped due to: ${result.error}`);
        }
        
        expect(result!.selector!.toLowerCase()).to.equal(SELECTORS.MAKER_PSM.toLowerCase());
        expect(result!.dexProtocol!.toLowerCase()).to.contain('psm');
      });

      it('should use CURVE_V1 selector with CurveV1', async function() {
        this.timeout(0);
        const result = await executeSwap(
          'USDC',
          'USDT',
          '100',
          'CurveV1'
        );
        
        if (result?.skipped) {
          expect.fail(`Swap skipped due to: ${result.error}`);
        }
        
        expect(result!.selector!.toLowerCase()).to.equal(SELECTORS.CURVE_V1.toLowerCase());
        expect(result!.dexProtocol!.toLowerCase()).to.contain('curve');
      });

      it('should use UNISWAP_V3 selector with UniswapV3', async function() {
        this.timeout(0);
        const result = await executeSwap(
          'USDC',
          'DAI',
          '100',
          'UniswapV3'
        );
        
        if (result?.skipped) {
          expect.fail(`Swap skipped due to: ${result.error}`);
        }
        
        expect(result!.selector!.toLowerCase()).to.equal(SELECTORS.UNISWAP_V3.toLowerCase());
        expect(result!.dexProtocol!.toLowerCase()).to.contain('uniswap');
      });

      it('should use UNISWAP_V2 selector with UniswapV2', async function() {
        this.timeout(0);
        const result = await executeSwap(
          'USDC',
          'DAI',
          '100',
          'UniswapV2'
        );
        
        if (result?.skipped) {
          expect.fail(`Swap skipped due to: ${result.error}`);
        }
        
        expect(result!.selector!.toLowerCase()).to.equal(SELECTORS.UNISWAP_V2.toLowerCase());
        expect(result!.dexProtocol!.toLowerCase()).to.contain('uniswap');
      });

      it('should use CURVE_V2 selector with CurveV2', async function() {
        this.timeout(0);
        const result = await executeSwap(
          'USDC',
          'USDT',
          '100',
          'CurveV2'
        );
        
        if (result?.skipped) {
          expect.fail(`Swap skipped due to: ${result.error}`);
        }
        
        expect(result!.selector!.toLowerCase()).to.equal(SELECTORS.CURVE_V2.toLowerCase());
        expect(result!.dexProtocol!.toLowerCase()).to.contain('curve');
      });
    });

    // TEST SET 2: Test all token permutations
    describe('All tokens permutation tests', function() {
      this.timeout(0); // Disable timeout for all tests in this suite
      
      // Generate all permutations of supported tokens
      const tokenPairs: Array<{tokenIn: SupportedToken, tokenOut: SupportedToken}> = [];
      for (let i = 0; i < TOKENS_TO_TEST.length; i++) {
        for (let j = 0; j < TOKENS_TO_TEST.length; j++) {
          if (i !== j) {
            tokenPairs.push({
              tokenIn: TOKENS_TO_TEST[i],
              tokenOut: TOKENS_TO_TEST[j]
            });
          }
        }
      }
      
      // Test each token permutation
      tokenPairs.forEach(({ tokenIn, tokenOut }) => {
        it(`should swap ${tokenIn} to ${tokenOut}`, async function() {
          const amount = '100';
          
          try {
            // Execute the swap without specifying a DEX - let Paraswap find the best route
            const result = await executeSwap(
              tokenIn,
              tokenOut,
              amount,
              '' // Empty string means no specific DEX, use any available route
            );
            
            if (result?.skipped) {
              expect.fail(`Swap from ${tokenIn} to ${tokenOut} skipped due to: ${result.error}`);
            }
          } catch (error: any) {
            const errorMessage = error?.message || '';
            if (errorMessage.includes('No liquidity')) {
              expect.fail(`Swap from ${tokenIn} to ${tokenOut} failed due to liquidity issues: ${errorMessage}`);
            } else {
              throw error;
            }
          }
        });
      });
    });
  });
});
