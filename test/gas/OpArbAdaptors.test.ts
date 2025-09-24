import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { tokenConfig } from '../constants';

describe('Gas Price Adaptors - OP & Arbitrum (crisp math with mocks, correct chains/oracles)', function () {

  if (process.env.FORK_NETWORK === 'arbitrum') {
    it('Arb: totalWeiCost = perL2TxWei + gasUsed * perArbGasWei; refund uses Arbitrum ETH/USD (mocked gas info)', async function () {
      const [signer] = await ethers.getSigners();

      const arbEthUsd = process.env.ARBITRUM_ETH_USD_ORACLE || '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6';
      const arbUsdc = process.env.ARBITRUM_USDC_ADDRESS || '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

      // Deploy mock ArbGasInfo and set deterministic prices
      const mock = await (await ethers.getContractFactory('MockArbGasInfo', signer)).deploy();
      await mock.waitForDeployment();
      const perL2TxWei = 1_000_000_000n; // 1 gwei
      const perArbGasWei = 1_500_000_000n; // 1.5 gwei
      await mock.setPrices(perL2TxWei, perArbGasWei, 0n, 0n, 0n, 0n);

      // Adaptor points to mock instead of precompile
      const adaptor = await (await ethers.getContractFactory('ArbitrumGasPriceAdaptor', signer)).deploy(
        await mock.getAddress(),
        arbEthUsd
      );
      await adaptor.waitForDeployment();

      const gasUsed = 321_000n;
      const expectedWei = perL2TxWei + gasUsed * perArbGasWei;
      const weiCost = await adaptor.totalWeiCost(gasUsed, '0x');
      expect(weiCost).to.equal(expectedWei);

      const chainlink = await ethers.getContractAt('IAggregatorV3', arbEthUsd, signer);
      const rd = await chainlink.latestRoundData();
      const answer = rd[1] as unknown as bigint;
      const oracleDecimals: bigint = BigInt(await chainlink.decimals());
      const denomExp = 18n + oracleDecimals - 6n; // USDC 6 decimals on Arbitrum
      const expectedRefund = (expectedWei * answer) / (10n ** denomExp);
      const actualRefund = await adaptor.refundAmountInToken(gasUsed, arbUsdc, '0x');
      expect(actualRefund).to.equal(expectedRefund);
    });
  }

  if (process.env.FORK_NETWORK === 'base') {
    it('Base live predeploy: gasPrice/getL1Fee work and adaptor matches', async function () {
      const [signer] = await ethers.getSigners();
      const BASE_GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F';
      const BASE_ETH_USD = process.env.BASE_ETH_USD_ORACLE || '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';
      const BASE_USDC = process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      // Call live predeploy
      const oracleIface = new ethers.Interface([
        'function gasPrice() view returns (uint256)',
        'function getL1Fee(bytes) view returns (uint256)'
      ]);
      const gasPriceData = await ethers.provider.call({
        to: BASE_GAS_PRICE_ORACLE,
        data: oracleIface.encodeFunctionData('gasPrice'),
      });
      if (!gasPriceData || gasPriceData === '0x') {
        this.skip();
      }
      const gp = oracleIface.decodeFunctionResult('gasPrice', gasPriceData)[0] as bigint;
      const small = '0x12';
      const large = '0x' + '11'.repeat(4096);
      const l1SmallData = await ethers.provider.call({
        to: BASE_GAS_PRICE_ORACLE,
        data: oracleIface.encodeFunctionData('getL1Fee', [small]),
      });
      const l1LargeData = await ethers.provider.call({
        to: BASE_GAS_PRICE_ORACLE,
        data: oracleIface.encodeFunctionData('getL1Fee', [large]),
      });
      const l1Small = oracleIface.decodeFunctionResult('getL1Fee', l1SmallData)[0] as bigint;
      const l1Large = oracleIface.decodeFunctionResult('getL1Fee', l1LargeData)[0] as bigint;
      expect(l1Large).to.be.gte(l1Small);

      // Adaptor must match the oracle math
      const feeData = await ethers.provider.getFeeData();
      const gasOverrides = {
        maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * 12n) / 10n : undefined,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * 12n) / 10n : undefined,
      } as const;

      const adaptor = await (await ethers.getContractFactory('OpStackGasPriceAdaptor', signer)).deploy(
        BASE_GAS_PRICE_ORACLE,
        BASE_ETH_USD,
        gasOverrides
      );
      await adaptor.waitForDeployment();
      const gasUsed = 200_000n;
      const weiSmall = await adaptor.totalWeiCost(gasUsed, small);
      const weiLarge = await adaptor.totalWeiCost(gasUsed, large);
      expect(weiSmall).to.equal(gasUsed * gp + l1Small);
      expect(weiLarge).to.equal(gasUsed * gp + l1Large);

      // Refund amount conversion should equal wei * price / 10^exp
      const chainlink = await ethers.getContractAt('IAggregatorV3', BASE_ETH_USD, signer);
      const rd = await chainlink.latestRoundData();
      const answer = rd[1] as unknown as bigint;
      const oracleDecimals: bigint = BigInt(await chainlink.decimals());
      const denomExp = 18n + oracleDecimals - 6n;
      const expectedRefund = (weiLarge * answer) / (10n ** denomExp);
      const actualRefund = await adaptor.refundAmountInToken(gasUsed, BASE_USDC, large);
      expect(actualRefund).to.equal(expectedRefund);
    });
  }
});


