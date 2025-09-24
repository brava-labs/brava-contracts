// SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import * as utils from '../utils';
import * as eip712Utils from '../utils-eip712';
import { tokenConfig } from '../constants';
import { fundAccountWithToken } from '../utils-stable';
import { getBytes4 } from '../shared-utils';

if (process.env.RUN_GAS_ADAPTOR_TESTS === 'true') {
  const gasUsed = 100_000n;

  const eip1559Overrides = async () => {
    const latest = await ethers.provider.getBlock('latest');
    const base = latest?.baseFeePerGas ?? 0n;
    const maxPriorityFeePerGas = ethers.parseUnits('1', 9);
    const maxFeePerGas = base + maxPriorityFeePerGas;
    return { maxFeePerGas, maxPriorityFeePerGas } as const;
  };

  if (process.env.FORK_NETWORK === 'optimism') {
    describe('Gas Price Adaptor - Optimism', function () {
      it('matches GasPriceOracle L1 fee plus per-gas from block.basefee', async function () {
        const oracleAddr = '0x420000000000000000000000000000000000000F';
        const adaptorFactory = await ethers.getContractFactory('OpStackGasPriceAdaptor');
        const adaptor = await adaptorFactory.deploy(oracleAddr, (await utils.getBaseSetup()).mockChainlinkOracle);
        await adaptor.waitForDeployment();

        const oracle = await ethers.getContractAt([
          'function getL1Fee(bytes) view returns (uint256)',
          'function baseFee() view returns (uint256)'
        ], oracleAddr);
          const shortData = '0x12345678';
          const longData = '0x' + '11'.repeat(1024);
        const feeShort: bigint = await oracle.getL1Fee(shortData);
        const feeLong: bigint = await oracle.getL1Fee(longData);

        const totalShort = await adaptor.totalWeiCost(gasUsed, shortData);
        const totalLong = await adaptor.totalWeiCost(gasUsed, longData);

        const perGas: bigint = await oracle.baseFee();
        const expectedShort = gasUsed * perGas + feeShort;
        const expectedLong = gasUsed * perGas + feeLong;
        expect(totalShort).to.equal(expectedShort);
        expect(totalLong).to.equal(expectedLong);
        expect(totalLong).to.be.gte(totalShort);
      });
    });
  }

  if (process.env.FORK_NETWORK === 'arbitrum') {
    describe('Gas Price Adaptor - Arbitrum', function () {
      it('matches ArbGasInfo.getPricesInWei() using receipt gasUsed', async function () {
        const arbGasInfo = '0x000000000000000000000000000000000000006C';
        const adaptorFactory = await ethers.getContractFactory('ArbitrumGasPriceAdaptor');
        const adaptor = await adaptorFactory.deploy(arbGasInfo, (await utils.getBaseSetup()).mockChainlinkOracle);
        await adaptor.waitForDeployment();

        // Create a self-transaction to measure actual gas used
        const [signer] = await ethers.getSigners();
        const txOverrides = await eip1559Overrides();
        const tx = await signer.sendTransaction({ to: await signer.getAddress(), data: '0x', ...txOverrides });
        const receipt = await tx.wait();
        const used = receipt!.gasUsed as unknown as bigint;

        const gasInfo = await ethers.getContractAt([
          'function getPricesInWei() view returns (uint256,uint256,uint256,uint256,uint256,uint256)'
        ], arbGasInfo);
        const res = await gasInfo.getPricesInWei();
        const perL2TxWei = res[0] as unknown as bigint;
        const perArbGasWei = res[1] as unknown as bigint;
        const expected = perL2TxWei + used * perArbGasWei;

        const total = await adaptor.totalWeiCost(used, '0x');
        expect(total).to.equal(expected);
        expect(total).to.be.gt(0n);
      });
    });
  }

  if (process.env.FORK_NETWORK === 'base') {
    describe('Gas Price Adaptor - Base (OP Stack)', function () {
      it('matches GasPriceOracle L1 fee plus per-gas from baseFee()', async function () {
        const oracleAddr = '0x420000000000000000000000000000000000000F';
        const adaptorFactory = await ethers.getContractFactory('OpStackGasPriceAdaptor');
        const adaptor = await adaptorFactory.deploy(oracleAddr, (await utils.getBaseSetup()).mockChainlinkOracle);
        await adaptor.waitForDeployment();

        const oracle = await ethers.getContractAt([
          'function getL1Fee(bytes) view returns (uint256)',
          'function baseFee() view returns (uint256)'
        ], oracleAddr);
        const shortData = '0x12345678';
        const longData = '0x' + '11'.repeat(1024);
        const feeShort: bigint = await oracle.getL1Fee(shortData);
        const feeLong: bigint = await oracle.getL1Fee(longData);
        const perGas: bigint = await oracle.baseFee();

        const totalShort = await adaptor.totalWeiCost(gasUsed, shortData);
        const totalLong = await adaptor.totalWeiCost(gasUsed, longData);

        const expectedShort = gasUsed * perGas + feeShort;
        const expectedLong = gasUsed * perGas + feeLong;
        expect(totalShort).to.equal(expectedShort);
        expect(totalLong).to.equal(expectedLong);
        expect(totalLong).to.be.gte(totalShort);
      });
    });
  }

  if (process.env.FORK_NETWORK === 'mainnet' || !process.env.FORK_NETWORK) {
    describe('Gas Price Adaptor - EIP1559 (Mainnet)', function () {
      it('totalWeiCost scales linearly with gasUsed at a fixed basefee', async function () {
        const setup = await utils.getBaseSetup();
        const signer = setup.signer;
        const tip = ethers.parseUnits('1', 9);
        const adaptorFactory = await ethers.getContractFactory('Eip1559GasPriceAdaptor', signer);
        const adaptor = await adaptorFactory.deploy(tip, await setup.mockChainlinkOracle.getAddress());
        await adaptor.waitForDeployment();

        const usedA = 100000n;
        const usedB = 300000n;
        const totalA = await adaptor.totalWeiCost(usedA, '0x');
        const totalB = await adaptor.totalWeiCost(usedB, '0x');
        expect(totalB).to.equal(totalA * (usedB / usedA));
      });

      it('refundAmountInToken equals totalWeiCost * price / 10^exp', async function () {
        const setup = await utils.getBaseSetup();
        const signer = setup.signer;
        const tip = ethers.parseUnits('1', 9);
        const adaptorFactory = await ethers.getContractFactory('Eip1559GasPriceAdaptor', signer);
        const adaptor = await adaptorFactory.deploy(tip, await setup.mockChainlinkOracle.getAddress());
        await adaptor.waitForDeployment();

        const used = 200000n;
        const weiCost = await adaptor.totalWeiCost(used, '0x');
        const rd = await setup.mockChainlinkOracle.latestRoundData();
        const answer = rd[1] as unknown as bigint;
        const oracleDecimals: bigint = BigInt(await setup.mockChainlinkOracle.decimals());
        const denomExp = 18n + oracleDecimals - BigInt(tokenConfig.USDC.decimals);
        const expectedAmount = (weiCost * answer) / (10n ** denomExp);
        const actual = await adaptor.refundAmountInToken(used, tokenConfig.USDC.address, '0x');
        expect(actual).to.equal(expectedAmount);
      });
    });

    describe('Gas Price Adaptor - EIP1559 (via Safe GasRefundAction)', function () {
      it('module refund is positive, <= receipt-derived upper bound, and grows with basefee', async function () {
        const setup = await utils.getBaseSetup();
        const signer = setup.signer;
        const safeAddress = await setup.safe.getAddress();

        // Fund the Safe with USDC (no registry dependency)
        await fundAccountWithToken(safeAddress, 'USDC', 1000);

        // Deploy GasRefundAction
        const tip = ethers.parseUnits('1', 9); // still used for tx overrides
        const gasRefundFactory = await ethers.getContractFactory('GasRefundAction', signer);
        const gasRefund = await (gasRefundFactory as any).deploy(
            await setup.adminVault.getAddress(),
            (await utils.getGlobalSetup()).logger.getAddress(),
            await setup.eip712Module.getAddress(),
            tokenConfig.USDC.address
          );
        await gasRefund.waitForDeployment();

        // Register action in AdminVault
        const actionId = getBytes4(await gasRefund.getAddress());
        await setup.adminVault.proposeAction(actionId, await gasRefund.getAddress());
        await setup.adminVault.addAction(actionId, await gasRefund.getAddress());

        // Helper to execute a refund bundle at a forced basefee and return refunded USDC
        async function refundAt(base: bigint): Promise<{ refund: bigint; expectedTokensUpper: bigint; usedGas: bigint; baseFeeUsed: bigint; oracleAnswer: bigint; oracleDecimals: bigint; denomExp: bigint; perGasWei: bigint }> {
          await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + base.toString(16)]);
          const currentNonce = await setup.eip712Module.getSequenceNonce(safeAddress);
          const paramsTuple = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(uint256)'],
            [[ethers.parseUnits('1000', 6)]]
          );
          const actionIface = new ethers.Interface(['function executeAction(bytes,uint16)']);
          const callData = actionIface.encodeFunctionData('executeAction', [paramsTuple, 0]);
          const actionDefinition: eip712Utils.ActionDefinition = { protocolName: 'Brava', actionType: 4 };
          const bundle = eip712Utils.createBundle({
            actions: [actionDefinition],
            actionIds: [actionId],
            callData: [callData],
            chainId: BigInt(31337),
            sequenceNonce: currentNonce,
            sequenceName: 'Gas Refund',
            enableGasRefund: true,
            maxRefundAmount: ethers.parseUnits('1000', 6),
            refundRecipient: 0,
          });
          const signature = await eip712Utils.signBundle(signer, bundle, safeAddress);
          const usdc = await ethers.getContractAt('IERC20', tokenConfig.USDC.address);
          const before = await usdc.balanceOf(await signer.getAddress());
          const txOverrides = { maxPriorityFeePerGas: tip, maxFeePerGas: base + tip } as const;
          const tx = await setup.eip712Module
            .connect(signer)
            .executeBundle(safeAddress, bundle, signature, txOverrides);
          const receipt = await tx.wait();
          const after = await usdc.balanceOf(await signer.getAddress());
          const refund = (after - before) as unknown as bigint;
          // Upper bound computed from actual block basefee of the refund tx
          const block = await ethers.provider.getBlock(receipt!.blockNumber!);
          const actualBase = (block?.baseFeePerGas ?? 0n) as bigint;
          const perGasWei = actualBase + tip;
          const expectedGas = (receipt!.gasUsed as unknown as bigint);
          const expectedWei = expectedGas * perGasWei;
          const rd = await setup.mockChainlinkOracle.latestRoundData();
          const answer = rd[1] as unknown as bigint;
          const updatedAt = rd[3] as unknown as bigint;
          const od: bigint = BigInt(await setup.mockChainlinkOracle.decimals());
          const usdcDecimals = tokenConfig.USDC.decimals;
          const denomExp = BigInt(18) + od - BigInt(usdcDecimals);
          const expectedTokensUpper = (expectedWei * answer) / (10n ** denomExp);
          return { refund, expectedTokensUpper, usedGas: expectedGas, baseFeeUsed: actualBase, oracleAnswer: answer, oracleDecimals: od, denomExp, perGasWei };
        }

        // Validate single basefee range using receipt upper bound and log discrepancy
        const forcedBase = ethers.parseUnits('10', 9);
        const snap = await network.provider.send('evm_snapshot');
        const { refund: actualRefund, expectedTokensUpper, usedGas, baseFeeUsed, oracleAnswer, oracleDecimals, denomExp, perGasWei } = await refundAt(forcedBase);
        await network.provider.send('evm_revert', [snap]);
        // Print diagnostic info
        console.log('Refund stats:', {
          refundUSDC: actualRefund.toString(),
          receiptGasUsed: usedGas.toString(),
          baseFeePerGasWei: baseFeeUsed.toString(),
          expectedUpperUSDC: expectedTokensUpper.toString(),
          forkBlock: process.env.FORK_BLOCK || 'latest',
          oracleAnswer: oracleAnswer.toString(),
          oracleDecimals: oracleDecimals.toString(),
          denomExp: denomExp.toString(),
          perGasWei: perGasWei.toString(),
        });
        expect(actualRefund).to.be.gt(0n);
        expect(actualRefund).to.be.lte(expectedTokensUpper);

        // Repeat at a higher base fee to ensure sensitivity and print diagnostics
        const forcedHigh = ethers.parseUnits('20', 9);
        const snapHigh = await network.provider.send('evm_snapshot');
        const { refund: highRefund, expectedTokensUpper: highUpper, usedGas: usedHigh, baseFeeUsed: baseHigh, oracleAnswer: oracleAnswerHigh, oracleDecimals: oracleDecimalsHigh, denomExp: denomExpHigh, perGasWei: perGasWeiHigh } = await refundAt(forcedHigh);
        await network.provider.send('evm_revert', [snapHigh]);
        console.log('Refund stats (high):', {
          refundUSDC: highRefund.toString(),
          receiptGasUsed: usedHigh.toString(),
          baseFeePerGasWei: baseHigh.toString(),
          expectedUpperUSDC: highUpper.toString(),
          forkBlock: process.env.FORK_BLOCK || 'latest',
          oracleAnswer: oracleAnswerHigh.toString(),
          oracleDecimals: oracleDecimalsHigh.toString(),
          denomExp: denomExpHigh.toString(),
          perGasWei: perGasWeiHigh.toString(),
        });
        expect(highRefund).to.be.gt(actualRefund);
        expect(highRefund).to.be.lte(highUpper);
      });
    });
  }
}


