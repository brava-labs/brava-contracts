import { ethers, expect, HardhatEthersSigner } from '../..';
import { network } from 'hardhat';
import { IERC20Metadata, ZeroExSwap, TokenRegistry } from '../../../typechain-types';
import { tokenConfig } from '../../constants';
import { actionTypes } from '../../actions';
import {
  getBaseSetup,
  deploy,
  getBytes4,
  executeAction,
  registerDeployedContract,
  log,
} from '../../utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';
// Import cache functions - force TypeScript module
const zeroExCacheModule = require('./zeroExCache.ts');
const { getZeroExSwapData } = zeroExCacheModule;

// Define the TokenConfiguration type based on the structure in constants.ts
type TokenConfiguration = typeof tokenConfig;

describe('ZeroExSwap tests', () => {
  let signer: HardhatEthersSigner;
  let safeAddr: string;
  let zeroExSwap: ZeroExSwap;
  let USDC: IERC20Metadata, USDT: IERC20Metadata, DAI: IERC20Metadata;
  let snapshotId: string;
  let loggerAddress: string;
  let adminVault: any;
  let tokenRegistry: TokenRegistry;

  // 0x Allowance Holder (spender) address for mainnet (v2 allowance-holder route)
  const ALLOWANCE_HOLDER = '0x0000000000001ff3684f28c67538d4d072c22734';

  // List of tokens to test all permutations
  const TOKENS_TO_TEST = ['USDC', 'USDT', 'DAI'] as const;
  type SupportedToken = (typeof TOKENS_TO_TEST)[number];

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    safeAddr = await baseSetup.safe.getAddress();
    adminVault = await baseSetup.adminVault;
    loggerAddress = await baseSetup.logger.getAddress();

    // Use TokenRegistry from base setup
    tokenRegistry = baseSetup.tokenRegistry;

    // Deploy ZeroExSwap with TokenRegistry
    zeroExSwap = await deploy(
      'ZeroExSwap',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      ALLOWANCE_HOLDER,
      await tokenRegistry.getAddress()
    );

    // Register the contract for executeAction to work
    registerDeployedContract('ZeroExSwap', await zeroExSwap.getAddress(), zeroExSwap);

    // Add the action to admin vault
    const zeroExSwapAddress = await zeroExSwap.getAddress();
    await adminVault.proposeAction(getBytes4(zeroExSwapAddress), zeroExSwapAddress);
    await adminVault.addAction(getBytes4(zeroExSwapAddress), zeroExSwapAddress);

    // Grant roles for TokenRegistry
    const TRANSACTION_PROPOSER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_PROPOSER_ROLE')
    );
    const TRANSACTION_EXECUTOR_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes('TRANSACTION_EXECUTOR_ROLE')
    );
    await adminVault.grantRole(TRANSACTION_PROPOSER_ROLE, await signer.getAddress());
    await adminVault.grantRole(TRANSACTION_EXECUTOR_ROLE, await signer.getAddress());

    // Approve test tokens in registry
    const TOKENS_TO_TEST = ['USDC', 'DAI', 'USDT'];
    for (const token of TOKENS_TO_TEST) {
      await tokenRegistry.proposeToken(tokenConfig[token as keyof typeof tokenConfig].address);
      await tokenRegistry.approveToken(tokenConfig[token as keyof typeof tokenConfig].address);
    }

    log('ZeroExSwap action added to admin vault');

    // Get token instances
    USDC = await getTokenContract('USDC');
    USDT = await getTokenContract('USDT');
    DAI = await getTokenContract('DAI');

    log('ZeroExSwap deployed at:', await zeroExSwap.getAddress());
    log('Safe address:', safeAddr);
    log('Allowance Target:', ALLOWANCE_HOLDER);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Contract deployment and basic properties', () => {
    it('should deploy with correct properties', async () => {
      expect(await zeroExSwap.actionType()).to.equal(actionTypes.SWAP_ACTION);
      expect(await zeroExSwap.protocolName()).to.equal('0x');
    });

    it('should revert on invalid constructor parameters', async () => {
      await expect(
        deploy(
          'ZeroExSwap',
          signer,
          await adminVault.getAddress(),
          loggerAddress,
          ethers.ZeroAddress, // Invalid allowance holder
          await tokenRegistry.getAddress()
        )
      ).to.be.reverted;

      await expect(
        deploy(
          'ZeroExSwap',
          signer,
          await adminVault.getAddress(),
          loggerAddress,
          ALLOWANCE_HOLDER,
          ethers.ZeroAddress // Invalid token registry
        )
      ).to.be.reverted;
    });
  });

  describe('Swap functionality', () => {
    const swapTestCases = [
      { from: 'USDC', to: 'DAI', amount: '1000000000' }, // 1000 USDC
      { from: 'DAI', to: 'USDC', amount: '1000000000000000000000' }, // 1000 DAI
      { from: 'USDT', to: 'DAI', amount: '500000000' }, // 500 USDT
    ];

    swapTestCases.forEach(({ from, to, amount }) => {
      it(`should swap ${from} for ${to}`, async () => {
        const tokenFrom = from as SupportedToken;
        const tokenTo = to as SupportedToken;

        const fromTokenAddress = tokenConfig[tokenFrom].address;
        const toTokenAddress = tokenConfig[tokenTo].address;

        const fromToken = await getTokenContract(tokenFrom);
        const toToken = await getTokenContract(tokenTo);

        // Fund the account with the source token
        await fundAccountWithToken(safeAddr, tokenFrom, BigInt(amount));

        // Get swap data (automatically fetches and caches if needed)
        const swapData = await getZeroExSwapData(
          fromTokenAddress,
          toTokenAddress,
          amount,
          safeAddr,
          1 // chainId
        );

        // Calculate minimum amount with 1% slippage
        const expectedBuyAmount = BigInt(swapData.buyAmount);
        const minBuyAmount = (expectedBuyAmount * 99n) / 100n;

        // Check initial balances
        const initialFromBalance = await fromToken.balanceOf(safeAddr);
        const initialToBalance = await toToken.balanceOf(safeAddr);

        log(
          `Initial ${tokenFrom} balance:`,
          ethers.formatUnits(initialFromBalance, await fromToken.decimals())
        );
        log(
          `Initial ${tokenTo} balance:`,
          ethers.formatUnits(initialToBalance, await toToken.decimals())
        );

        // Execute the swap via Safe delegate call
        await executeAction({
          type: 'ZeroExSwap',
          tokenIn: fromTokenAddress,
          tokenOut: toTokenAddress,
          fromAmount: amount.toString(),
          minToAmount: minBuyAmount.toString(),
          swapTarget: swapData.swapTarget,
          swapCallData: swapData.swapCallData,
          safeAddress: safeAddr,
          signer,
        });

        // Check final balances
        const finalFromBalance = await fromToken.balanceOf(safeAddr);
        const finalToBalance = await toToken.balanceOf(safeAddr);

        log(
          `Final ${tokenFrom} balance:`,
          ethers.formatUnits(finalFromBalance, await fromToken.decimals())
        );
        log(
          `Final ${tokenTo} balance:`,
          ethers.formatUnits(finalToBalance, await toToken.decimals())
        );

        // Verify the swap happened
        const fromTokenSpent = initialFromBalance - finalFromBalance;
        const toTokenReceived = finalToBalance - initialToBalance;

        expect(fromTokenSpent).to.be.gte((BigInt(amount) * 95n) / 100n); // Allow for some variance
        expect(toTokenReceived).to.be.gte(minBuyAmount);

        log(`${tokenFrom} spent:`, ethers.formatUnits(fromTokenSpent, await fromToken.decimals()));
        log(`${tokenTo} received:`, ethers.formatUnits(toTokenReceived, await toToken.decimals()));
      });
    });

    it('should revert with invalid swap target', async () => {
      const fromTokenAddress = tokenConfig.USDC.address;
      const toTokenAddress = tokenConfig.DAI.address;
      const amount = '1000000000';

      const params = {
        tokenIn: fromTokenAddress,
        tokenOut: toTokenAddress,
        fromAmount: amount,
        minToAmount: '1',
        callValue: 0,
        swapTarget: ethers.ZeroAddress, // Invalid target
        swapCallData: '0x',
      };

      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'tuple(address tokenIn,address tokenOut,uint256 fromAmount,uint256 minToAmount,uint256 callValue,address swapTarget,bytes swapCallData)',
        ],
        [params]
      );

      await expect(
        zeroExSwap.connect(signer).executeAction(encodedParams, 0)
      ).to.be.revertedWithCustomError(zeroExSwap, 'ZeroEx__InvalidSwapTarget');
    });

    it('should revert with non-approved token', async () => {
      const fromTokenAddress = tokenConfig.USDC.address;
      // Use an arbitrary address that's not approved in TokenRegistry
      const toTokenAddress = '0x1234567890123456789012345678901234567890';
      const amount = '1000000000';

      const params = {
        tokenIn: fromTokenAddress,
        tokenOut: toTokenAddress,
        fromAmount: amount,
        minToAmount: '1',
        callValue: 0,
        swapTarget: ALLOWANCE_HOLDER,
        swapCallData: '0x',
      };

      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'tuple(address tokenIn,address tokenOut,uint256 fromAmount,uint256 minToAmount,uint256 callValue,address swapTarget,bytes swapCallData)',
        ],
        [params]
      );

      await expect(
        zeroExSwap.connect(signer).executeAction(encodedParams, 0)
      ).to.be.revertedWithCustomError(zeroExSwap, 'ZeroEx__TokenNotApproved');
    });

    it('should revert with zero amounts', async () => {
      const fromTokenAddress = tokenConfig.USDC.address;
      const toTokenAddress = tokenConfig.DAI.address;

      const params = {
        tokenIn: fromTokenAddress,
        tokenOut: toTokenAddress,
        fromAmount: '0', // Invalid amount
        minToAmount: '1',
        callValue: 0,
        swapTarget: ALLOWANCE_HOLDER,
        swapCallData: '0x',
      };

      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'tuple(address tokenIn,address tokenOut,uint256 fromAmount,uint256 minToAmount,uint256 callValue,address swapTarget,bytes swapCallData)',
        ],
        [params]
      );

      await expect(
        zeroExSwap.connect(signer).executeAction(encodedParams, 0)
      ).to.be.revertedWithCustomError(zeroExSwap, 'InvalidInput');
    });

    it('should revert if minimum amount not received', async () => {
      const fromTokenAddress = tokenConfig.USDC.address;
      const toTokenAddress = tokenConfig.DAI.address;
      const amount = '1000000000';

      // Fund the action contract directly for this error test
      await fundAccountWithToken(await zeroExSwap.getAddress(), 'USDC', BigInt(amount));

      // Get swap data (automatically fetches and caches if needed)
      const swapData = await getZeroExSwapData(
        fromTokenAddress,
        toTokenAddress,
        amount,
        safeAddr,
        1
      );

      // Set minimum amount way too high
      const unreasonableMinAmount = (BigInt(swapData.buyAmount) * 150n) / 100n;

      const params = {
        tokenIn: fromTokenAddress,
        tokenOut: toTokenAddress,
        fromAmount: amount,
        minToAmount: unreasonableMinAmount.toString(),
        callValue: Number(swapData.value || '0'),
        swapTarget: swapData.swapTarget,
        swapCallData: swapData.swapCallData,
      };

      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'tuple(address tokenIn,address tokenOut,uint256 fromAmount,uint256 minToAmount,uint256 callValue,address swapTarget,bytes swapCallData)',
        ],
        [params]
      );

      await expect(
        zeroExSwap
          .connect(signer)
          .executeAction(encodedParams, 0, { value: Number(swapData.value || '0') })
      ).to.be.revertedWithCustomError(zeroExSwap, 'ZeroEx__InsufficientOutput');
    });
  });

  describe('Parameter parsing', () => {
    it('should correctly parse input parameters', async () => {
      const params = {
        tokenIn: tokenConfig.USDC.address,
        tokenOut: tokenConfig.DAI.address,
        fromAmount: '1000000000',
        minToAmount: '900000000000000000000',
        callValue: 0,
        swapTarget: ALLOWANCE_HOLDER,
        swapCallData: '0x1234',
      };

      const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'tuple(address tokenIn,address tokenOut,uint256 fromAmount,uint256 minToAmount,uint256 callValue,address swapTarget,bytes swapCallData)',
        ],
        [params]
      );

      // This should not revert during parameter parsing
      // We expect it to revert at the swap execution stage
      await expect(zeroExSwap.connect(signer).executeAction(encodedParams, 0)).to.be.reverted; // Will revert during execution, not parsing
    });
  });
});

describe('ZeroExSwap integration', () => {
  // 0x Allowance Holder (spender) address for mainnet (v2 allowance-holder route)
  const ALLOWANCE_HOLDER = '0x0000000000001ff3684f28c67538d4d072c22734';

  it('should be compatible with the existing action system', async () => {
    const [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    const zeroExSwap = (await deploy(
      'ZeroExSwap',
      signer,
      await baseSetup.adminVault.getAddress(),
      await baseSetup.logger.getAddress(),
      ALLOWANCE_HOLDER,
      await baseSetup.tokenRegistry.getAddress()
    )) as ZeroExSwap;

    // Verify it follows the action interface
    expect(await zeroExSwap.actionType()).to.equal(actionTypes.SWAP_ACTION);
    expect(await zeroExSwap.protocolName()).to.equal('0x');
    const minimal = new ethers.Contract(
      await zeroExSwap.getAddress(),
      ['function ALLOWANCE_TARGET() view returns (address)'],
      signer
    );
    const allowanceTargetRead: string = await minimal.ALLOWANCE_TARGET();
    expect(allowanceTargetRead.toLowerCase()).to.equal(ALLOWANCE_HOLDER.toLowerCase());
  });
});
