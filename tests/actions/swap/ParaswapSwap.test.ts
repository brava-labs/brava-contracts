import { executeSafeTransaction, SafeOperation } from 'brava-ts-client';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { IERC20Metadata, ParaswapSwap } from '../../../typechain-types';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import { ACTION_LOG_IDS } from '../../logs';
import { ParaswapSwapParams } from '../../params';
import { decodeLoggerLog, deploy, getBaseSetup, getBytes4, log } from '../../utils';
import { fundAccountWithToken, getStables } from '../../utils-stable';

describe('ParaswapSwap tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let paraswapSwap: ParaswapSwap;
  let USDC: IERC20Metadata, USDT: IERC20Metadata, DAI: IERC20Metadata;
  let snapshotId: string;
  let loggerAddress: string;
  let adminVault: any;
  const AUGUSTUS_ROUTER = '0x6A000F20005980200259B80c5102003040001068'; // Paraswap AugustusSwapper

  async function testSwap(
    tokenIn: 'USDC' | 'USDT' | 'DAI',
    tokenOut: 'USDC' | 'USDT' | 'DAI',
    fromAmount: string,
    minToAmount: string,
    swapCallData: string = '0x' // Mock swap data, should be replaced with actual Paraswap API data
  ) {
    const FromToken = eval(tokenIn);
    const ToToken = eval(tokenOut);

    // Fund the account
    await fundAccountWithToken(safeAddr, tokenIn, BigInt(fromAmount));

    const initialFromBalance = await FromToken.balanceOf(safeAddr);
    const initialToBalance = await ToToken.balanceOf(safeAddr);

    const abiCoder = new ethers.AbiCoder();

    const encodedSwapCallData = abiCoder.encode(
      [ParaswapSwapParams],
      [
        {
          tokenIn: tokenConfig[tokenIn].address,
          tokenOut: tokenConfig[tokenOut].address,
          fromAmount,
          minToAmount,
          swapCallData,
        },
      ]
    );
    const encodedExecuteAction = paraswapSwap.interface.encodeFunctionData('executeAction', [
      encodedSwapCallData,
      0,
    ]);
    const tx = await executeSafeTransaction(
      safeAddr,
      await paraswapSwap.getAddress(),
      0,
      encodedExecuteAction,
      SafeOperation.DelegateCall,
      signer
    );

    // Check balances after swap
    const finalFromBalance = BigInt(await FromToken.balanceOf(safeAddr));
    const finalToBalance = BigInt(await ToToken.balanceOf(safeAddr));

    // Log balances
    log(`initial${tokenIn}Balance`, initialFromBalance);
    log(`final${tokenIn}Balance`, finalFromBalance);
    log(`initial${tokenOut}Balance`, initialToBalance);
    log(`final${tokenOut}Balance`, finalToBalance);

    expect(finalFromBalance).to.be.lt(initialFromBalance);
    expect(finalToBalance).to.be.gt(initialToBalance);
    expect(finalToBalance - initialToBalance).to.be.gte(minToAmount);

    // Check log
    const logs = await decodeLoggerLog(tx);
    expect(logs).to.deep.equal([
      {
        eventId: ACTION_LOG_IDS.PARASWAP_SWAP,
        safeAddress: safeAddr,
        tokenIn: tokenConfig[tokenIn].address,
        tokenOut: tokenConfig[tokenOut].address,
        fromAmount: fromAmount,
        minToAmount: minToAmount,
        amountReceived: finalToBalance - initialToBalance,
      },
    ]);
  }

  before(async () => {
    // Deploy base setup
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = await baseSetup.safe.getAddress();
    adminVault = await baseSetup.adminVault;
    loggerAddress = await baseSetup.logger.getAddress();

    // Deploy ParaswapSwap contract
    paraswapSwap = await deploy(
      'ParaswapSwap',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AUGUSTUS_ROUTER
    );

    // Get stable coins
    ({ USDC, USDT, DAI } = await getStables());

    const swapAddress = await paraswapSwap.getAddress();

    // Add action to admin vault
    await adminVault.proposeAction(getBytes4(swapAddress), swapAddress);
    await adminVault.addAction(getBytes4(swapAddress), swapAddress);

    // Take local snapshot before running tests
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {
    // IMPORTANT: take a new snapshot, they can't be reused!
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    // Revert local snapshot after each test
    log('Reverting to local snapshot', snapshotId);
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Basic functionality', () => {
    it('should have correct constants', async () => {
      expect(await paraswapSwap.AUGUSTUS_ROUTER()).to.equal(AUGUSTUS_ROUTER);
      expect(await paraswapSwap.actionType()).to.equal(actionTypes.SWAP_ACTION);
      expect(await paraswapSwap.protocolName()).to.equal('Paraswap');
    });

    it('should fail when swapping with zero amount', async () => {
      const abiCoder = new ethers.AbiCoder();
      const encodedSwapCallData = abiCoder.encode(
        [ParaswapSwapParams],
        [
          {
            tokenIn: tokenConfig.USDC.address,
            tokenOut: tokenConfig.USDT.address,
            fromAmount: 0,
            minToAmount: 0,
            swapCallData: '0x',
          },
        ]
      );
      await expect(
        paraswapSwap.executeAction(encodedSwapCallData, 0)
      ).to.be.revertedWithCustomError(paraswapSwap, 'InvalidInput');
    });
  });

  describe('Swap execution', () => {
    it('should swap USDC to USDT', async () => {
      const amount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      const minAmount = ethers.parseUnits('999', tokenConfig.USDT.decimals);
      // TODO: Get actual swap data from Paraswap API
      const swapData =
        '0xe3ead59e000000000000000000000000000010036c0190e009a000d0fc3541100a07380a000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000000000000000000000000000000000003b003c01000000000000000000000000000000000000000000000000000000003b98cd6be9a6d2f829de4cdba1c9b354bdc8478100000000000000000000000001455a5d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001006146be494fee4c73540cb1c5f87536abf1452500000000a000440000ff00000300000000000000000000000000000000000000000000000000000000c31b8d7a0000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000001000276a4';
      await testSwap('USDC', 'USDT', amount.toString(), minAmount.toString(), swapData);
    });

    it('should swap USDT to DAI', async () => {
      const amount = ethers.parseUnits('1090', tokenConfig.USDT.decimals);
      const minAmount = ethers.parseUnits('999', tokenConfig.DAI.decimals);
      const swapData =
        '0x876a02f60000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000000000000000000000000035b265725ad9624b860000000000000000000000000000000000000000000000363d3faefc170df45d86957693430e49f68891fc342d10ef070000000000000000000000000145735a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000600000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec700000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000';
      await testSwap('USDT', 'DAI', amount.toString(), minAmount.toString(), swapData);
    });
  });

  describe('Error handling', () => {
    it('should fail with invalid swap data', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      const abiCoder = new ethers.AbiCoder();
      const encodedSwapCallData = abiCoder.encode(
        [ParaswapSwapParams],
        [
          {
            tokenIn: tokenConfig.USDC.address,
            tokenOut: tokenConfig.USDT.address,
            fromAmount: amount,
            minToAmount: BigInt(amount),
            swapCallData: '0x1234',
          },
        ]
      );

      await expect(
        paraswapSwap.executeAction(encodedSwapCallData, 0)
      ).to.be.revertedWithCustomError(paraswapSwap, 'Paraswap__SwapFailed');
    });
  });
});

export {};
