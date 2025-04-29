import { CoverAsset } from '@nexusmutual/sdk';

// Contract Addresses
export const CURVE_3POOL_ADDRESS = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';
export const AAVE_V2_POOL = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
export const AAVE_V3_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
export const UWU_LEND_POOL = '0x2409aF0251DCB89EE3Dee572629291f9B087c668';
export const BEND_DAO_V1_POOL = '0x70b97A0da65C15dfb0FFA02aEE6FA36e507C2762';
export const ACROSS_HUB = '0xc186fA914353c44b2E33eBE05f21846F1048bEda';
export const SAFE_PROXY_FACTORY_ADDRESS = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
export const SAFE_SINGLETON_ADDRESS = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
export const YEARN_REGISTRY_ADDRESS = '0x50c1a2eA0a861A967D9d0FFE2AE4012c2E053804';
export const OWNER_ADDRESS = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
export const ADMIN_ADDRESS = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
export const CREATE_X_ADDRESS = '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed';

// Nexus Mutual
export const NEXUS_MUTUAL_BROKER_ADDRESS = '0x0000cbD7a26f72Ff222bf5f136901D224b08BE4E';
export const NEXUS_MUTUAL_NFT_ADDRESS = '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb';

// Token Indices for Curve 3Pool
export const CURVE_3POOL_INDICES = {
  DAI: 0,
  USDC: 1,
  USDT: 2,
};

// Roles
export const ROLES = {
  OWNER_ROLE: 'OWNER_ROLE',
  ROLE_MANAGER_ROLE: 'ROLE_MANAGER_ROLE',
  FEE_PROPOSER_ROLE: 'FEE_PROPOSER_ROLE',
  FEE_EXECUTOR_ROLE: 'FEE_EXECUTOR_ROLE',
  FEE_CANCELER_ROLE: 'FEE_CANCELER_ROLE',
  POOL_PROPOSER_ROLE: 'POOL_PROPOSER_ROLE',
  POOL_EXECUTOR_ROLE: 'POOL_EXECUTOR_ROLE',
  POOL_CANCELER_ROLE: 'POOL_CANCELER_ROLE',
  POOL_DISPOSER_ROLE: 'POOL_DISPOSER_ROLE',
  ACTION_PROPOSER_ROLE: 'ACTION_PROPOSER_ROLE',
  ACTION_EXECUTOR_ROLE: 'ACTION_EXECUTOR_ROLE',
  ACTION_CANCELER_ROLE: 'ACTION_CANCELER_ROLE',
  ACTION_DISPOSER_ROLE: 'ACTION_DISPOSER_ROLE',
  FEE_TAKER_ROLE: 'FEE_TAKER_ROLE',
  // Add more roles as needed
} as const;

// Other Constants
export const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Token Config
export const tokenConfig = {
  USDC: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 6,
    pools: {
      yearn: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
    },
  },
  USDT: {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 6,
  },
  USDE: {
    address: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
    whale: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
    decimals: 18,
  },
  DAI: {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  GHO: {
    address: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
    whale: '0x1a88Df1cFe15Af22B3c4c783D4e6F7F9e0C1885d',
    decimals: 18,
  },
  USDS: {
    address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F',
    whale: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD', 
    decimals: 18,
  },
  WETH: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  FLUID_V1_USDC: {
    address: '0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33',
    whale: '0x2fA6c95B69c10f9F52b8990b6C03171F13C46225',
    decimals: 6,
  },
  FLUID_V1_USDT: {
    address: '0x5c20b550819128074fd538edf79791733ccedd18',
    whale: '0x490681095ed277B45377d28cA15Ac41d64583048',
    decimals: 6,
  },
  FLUID_V1_GHO: {
    address: '0x6A29A46E21C730DcA1d8b23d637c101cec605C5B',
    whale: '0xd3DCe716f3eF535C5Ff8d041c1A41C3bd89b97aE',
    decimals: 18,
  },
  YEARN_V2_USDC: {
    address: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
    whale: '0xC4080c19DE69c2362d01B20F071D4046364A0226',
    decimals: 6,
  },
  YEARN_V2_USDT: {
    address: '0x3B27F92C0e212C671EA351827EDF93DB27cc0c65',
    whale: '0xB0eb24077563DB8b88384949011dc46410C0A31D',
    decimals: 6,
  },
  YEARN_V2_DAI: {
    address: '0xdA816459F1AB5631232FE5e97a05BBBb94970c95',
    whale: '0x5C6374a2ac4EBC38DeA0Fc1F8716e5Ea1AdD94dd',
    decimals: 18,
  },
  VESPER_V1_USDC: {
    address: '0xa8b607Aa09B6A2E306F93e74c282Fb13f6A80452',
    whale: '0x3691EF68Ba22a854c36bC92f6b5F30473eF5fb0A',
    decimals: 18,
  },
  AAVE_V2_aDAI: {
    address: '0x028171bCA77440897B824Ca71D1c56caC55b68A3',
    whale: '0x07edE94cF6316F4809f2B725f5d79AD303fB4Dc8',
    decimals: 18,
  },
  AAVE_V2_aUSDC: {
    address: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
    whale: '0x464C71f6c2F760DdA6093dCB91C24c39e5d6e18c',
    decimals: 6,
  },
  AAVE_V2_aUSDT: {
    address: '0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811',
    whale: '0x295E5eE985246cfD09B615f8706854600084c529',
    decimals: 6,
  },
  AAVE_V3_aDAI: {
    address: '0x018008bfb33d285247A21d44E50697654f754e63',
    whale: '0x07edE94cF6316F4809f2B725f5d79AD303fB4Dc8',
    decimals: 18,
  },
  AAVE_V3_aUSDC: {
    address: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
    whale: '0x2aAF355c820676C104bd00Ee6c506FA05998dDa2',
    decimals: 6,
  },
  AAVE_V3_aUSDT: {
    address: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
    whale: '0x18709E89BD403F470088aBDAcEbE86CC60dda12e',
    decimals: 6,
  },
  STRIKE_V1_USDC: {
    address: '0x3774E825d567125988Fb293e926064B6FAa71DAB',
    whale: '0xee2826453A4Fd5AfeB7ceffeEF3fFA2320081268',
    decimals: 8,
  },
  STRIKE_V1_USDT: {
    address: '0x69702cfd7DAd8bCcAA24D6B440159404AAA140F5',
    whale: '0xee2826453A4Fd5AfeB7ceffeEF3fFA2320081268',
    decimals: 8,
  },
  CLEARPOOL_V1_ALP_USDC: {
    address: '0x68F311351e7196D71f8E6372e4A1D2e725669BF2',
    whale: '0x804cc33C14d804a96d9f5D0e27489e64920eD775',
    decimals: 6,
  },
  CLEARPOOL_V1_AUR_USDC: {
    address: '0x3aeB3a8F0851249682A6a836525CDEeE5aA2A153',
    whale: '0xB0E6faDc3e16f0f1440d254E095F7b1019ec03DB',
    decimals: 6,
  },
  UWU_V1_DAI: {
    address: '0xb95BD0793bCC5524AF358ffaae3e38c3903C7626',
    whale: '0x31d3243CfB54B34Fc9C73e1CB1137124bD6B13E1',
    decimals: 18,
  },
  UWU_V1_USDT: {
    address: '0x24959F75d7BDA1884f1Ec9861f644821Ce233c7D',
    whale: '0x31d3243CfB54B34Fc9C73e1CB1137124bD6B13E1',
    decimals: 6,
  },
  BEND_V1_USDT: {
    address: '0x9631C79BfD6123A5B53307B6cdfb35F97606F954',
    whale: '0xdd02Bd6e347DE7107d864abD4Ad6437cd3ae99b4',
    decimals: 6,
  },
  SPARK_V1_DAI: {
    address: '0x83f20f44975d03b1b09e64809b757c47f942beea',
    whale: '0x4aa42145Aa6Ebf72e164C9bBC74fbD3788045016',
    decimals: 18,
  },
  SPARK_V1_USDS: {
    address: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
    whale: '0x2d4d2A025b10C09BDbd794B4FCe4F7ea8C7d7bB4',
    decimals: 18,
  },
  ACROSS_V3_lpUSDC: {
    address: '0xC9b09405959f63F72725828b5d449488b02be1cA',
    whale: '0x9040e41eF5E8b281535a96D9a48aCb8cfaBD9a48',
    decimals: 6,
  },
  ACROSS_V3_lpUSDT: {
    address: '0xC2faB88f215f62244d2E32c8a65E8F58DA8415a5',
    whale: '0x9040e41eF5E8b281535a96D9a48aCb8cfaBD9a48',
    decimals: 6,
  },
  ACROSS_V3_lpDAI: {
    address: '0x4FaBacAC8C41466117D6A38F46d08ddD4948A0cB',
    whale: '0x9040e41eF5E8b281535a96D9a48aCb8cfaBD9a48',
    decimals: 18,
  },
  MORPHO_V1_fxUSDC: {
    address: '0x4F460bb11cf958606C69A963B4A17f9DaEEea8b6',
    whale: '0xd3c082cDC4a31ABe9Ce02A785b89947800D0898C',
    decimals: 18,
  },
  MORPHO_V1_USUALUSDC: {
    address: '0xd63070114470f685b75b74d60eec7c1113d33a3d',
    whale: '0xeABD4A433D9BD08DDbB086503b18BBe2dD51a414',
    decimals: 18,
  },
  MORPHO_V1_gtUSDCcore: {
    address: '0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458',
    whale: '0x8a95a711A56bD837D678ab299dE7B1Ec9863051C',
    decimals: 18,
  },
  NOTIONAL_V3_USDC: {
    address: '0xaEeAfB1259f01f363d09D7027ad80a9d442de762',
    whale: '0x2920F9Fc667E780C0CB5a78a104d21413377f97E',
    decimals: 8,
  },
  YEARN_V3_DAI: {
    address: '0x92545bCE636E6eE91D88D2D017182cD0bd2fC22e',
    whale: '0x38E3d865e34f7367a69f096C80A4fc329DB38BF4',
    decimals: 18,
  },
  YEARN_V3_AJNA_DAI: {
    address: '0xe24BA27551aBE96Ca401D39761cA2319Ea14e3CB',
    whale: '0x54C6b2b293297e65b1d163C3E8dbc45338bfE443',
    decimals: 18,
  },
  YEARN_V3_USDS: {
    address: '0x182863131F9a4630fF9E27830d945B1413e347E8',
    whale: '0xd57aEa3686d623dA2dCEbc87010a4F2F38Ac7B15',
    decimals: 18,
  },
  YEARN_V3_SKY_USDS: {
    address: '0x4cE9c93513DfF543Bc392870d57dF8C04e89Ba0a',
    whale: '0x182863131F9a4630fF9E27830d945B1413e347E8',
    decimals: 18,
  },
  MORPHO_V1_re7USDT: {
    address: '0x95EeF579155cd2C5510F312c8fA39208c3Be01a8',
    whale: '0xFc2a0F6fD177c8BF40d0FaB7e6027d6f290ef11D',
    decimals: 18,
  },
  MORPHO_V1_reUSDC: {
    address: '0x0F359FD18BDa75e9c49bC027E7da59a4b01BF32a',
    whale: '0x6f78d13a8A7c5965cAcAA9b116A35CE315F52566',
    decimals: 18,
  },
  MORPHO_V1_steakUSDT: {
    address: '0xbEef047a543E45807105E51A8BBEFCc5950fcfBa',
    whale: '0x649fe0BBa5098e9ec1cCA4aA416c0551e309A568',
    decimals: 18,
  },
  MORPHO_V1_steakUSDC: {
    address: '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB',
    whale: '0xb99a2c4C1C4F1fc27150681B740396F6CE1cBcF5',
    decimals: 18,
  },
  MORPHO_V1_gtUSDC: {
    address: '0xdd0f28e19C1780eb6396170735D45153D261490d',
    whale: '0xC977d218Fde6A39c7aCE71C8243545c276B48931',
    decimals: 18,
  },
  MORPHO_V1_gtUSDT: {
    address: '0x8CB3649114051cA5119141a34C200D65dc0Faa73',
    whale: '0xdb02Da0A36c7b19461fD00DA62D4fF3be884668e',
    decimals: 18,
  },
  MORPHO_V1_smokehouseUSDC: {
    address: '0xBEeFFF209270748ddd194831b3fa287a5386f5bC',
    whale: '0xd3ca6324A976f689711424572f8A505bE9969055',
    decimals: 18,
  },
  MORPHO_V1_gtDAIcore: {
    address: '0x500331c9fF24D9d11aee6B07734Aa72343EA74a5',
    whale: '0xE3F605af7FBBb0831C98614fA9C27f970bB3d5ab',
    decimals: 18,
  },
  GEARBOX_PASSIVE_V3_USDC: {
    address: '0xda00000035fef4082f78def6a8903bee419fbf8e',
    whale: '0x9ef444a6d7F4A5adcd68FD5329aA5240C90E14d2',
    decimals: 6,
  },
  GEARBOX_PASSIVE_V3_DAI: {
    address: '0xe7146f53dbcae9d6fa3555fe502648deb0b2f823',
    whale: '0xC853E4DA38d9Bd1d01675355b8c8f3BBC1451973',
    decimals: 18,
  },
  GEARBOX_PASSIVE_V3_K3_USDT: {
    address: '0x05A811275fE9b4DE503B3311F51edF6A856D936e',
    whale: '0x16adAb68bDEcE3089D4f1626Bb5AEDD0d02471aD',
    decimals: 6,
  },
  GEARBOX_PASSIVE_V3_CHAOS_GHO: {
    address: '0x4d56c9cBa373AD39dF69Eb18F076b7348000AE09',
    whale: '0xE2037090f896A858E3168B978668F22026AC52e7',
    decimals: 18,
  },
  MORPHO_V1_coinshiftUSDC: {
    address: '0x7204B7Dbf9412567835633B6F00C3Edc3a8D6330',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  MORPHO_V1_steakhouseUSDC_RWA: {
    address: '0x6D4e530B8431a52FFDA4516BA4Aadc0951897F8C',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  MORPHO_V1_9S_MountDenali_USDC: {
    address: '0x1E2aAaDcF528b9cC08F43d4fd7db488cE89F5741',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  MORPHO_V1_9Summits_USDC: {
    address: '0xD5Ac156319f2491d4ad1Ec4aA5ed0ED48C0fa173',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  MORPHO_V1_smokehouseUSDT: {
    address: '0xA0804346780b4c2e3bE118ac957D1DB82F9d7484',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  MORPHO_V1_flagshipUSDT: {
    address: '0x2C25f6C25770fFEC5959D34B94Bf898865e5D6b1',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 18,
  },
  EULER_V2_PRIME_USDC: {
    address: '0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9',
    whale: '0xCCBd61b6c2fB58Da5bbD8937Ca25164eF29c1cc4',
    decimals: 6,
  },
  EULER_V2_YIELD_USDC: {
    address: '0xe0a80d35bB6618CBA260120b279d357978c42BCE',
    whale: '0xD3985b3F8103b67016333A2052f6b6396D60701e',
    decimals: 6,
  },
  EULER_V2_YIELD_USDT: {
    address: '0x7c280DBDEf569e96c7919251bD2B0edF0734C5A8',
    whale: '0x1597E4B7Cf6D2877A1D690b6088668Afdb045766',
    decimals: 6,
  },
  EULER_V2_YIELD_USDE: {
    address: '0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6',
    whale: '0xa408f237587D2cBc461058974Ed214F8888806A5',
    decimals: 18,
  },
  EULER_V2_MAXI_USDC: {
    address: '0xce45EF0414dE3516cAF1BCf937bF7F2Cf67873De',
    whale: '0x2574d2367c58a037604D79A5a6ddd5E13603Cf13',
    decimals: 6,
  },
  EULER_V2_RESOLV_USDC: {
    address: '0xcBC9B61177444A793B85442D3a953B90f6170b7D',
    whale: '0x64C4DC144119c794bb92fdE8C04eA6BD095b7Ba8',
    decimals: 6,
  },
  rUSD: {
    address: '0x09D4214C03D01F49544C0448DBE3A27f768F2b34',
    whale: '0xf0e9f6D9Ba5D1B3f76e0f82F9DCDb9eBEef4b4dA',
    decimals: 18,
  },
  PYUSD: {
    address: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    whale: '0x688e72142674041f8f6Af4c808a4045cA1D6aC82',
    decimals: 6,
  },
  MORPHO_V1_steakhouserUSD: {
    address: '0xBeEf11eCb698f4B5378685C05A210bdF71093521',
    whale: '0x31Eae643b679A84b37E3d0B4Bd4f5dA90fB04a61',
    decimals: 18,
  },
  MORPHO_V1_steakhousePYUSD: {
    address: '0xbEEF02e5E13584ab96848af90261f0C8Ee04722a',
    whale: '0x7E4B4DC22111B84594d9b7707A8DCFFd793D477A',
    decimals: 18,
  },
  wUSDL: {
    address: '0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559',
    whale: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    decimals: 18,
  },
  MORPHO_V1_coinshiftUSDL: {
    address: '0xbEeFc011e94f43b8B7b455eBaB290C7Ab4E216f1',
    whale: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    decimals: 18,
  },
  crvUSD: {
    address: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E',
    whale: '0xA920De414eA4Ab66b97dA1bFE9e6EcA7d4219635',
    decimals: 18,
  },
  CURVE_SAVINGS_scrvUSD: {
    address: '0x0655977FEb2f289A4aB78af67BAB0d17aAb84367',
    whale: '0xc522A6606BBA746d7960404F22a3DB936B6F4F50',
    decimals: 18,
  },
};

export const NEXUS_QUOTES = {
  [CoverAsset.ETH]: {
    result: {
      displayInfo: {
        premiumInAsset: '3162504478449954',
        coverAmount: '1000000000000000000',
        yearlyCostPerc: 0.041,
        maxCapacity: '209468398709503985923',
      },
      buyCoverInput: {
        buyCoverParams: {
          coverId: 0,
          owner: '0x2370eAB2C0B8cd9f949aD324C2e9D56473242a86',
          productId: 156,
          coverAsset: 0,
          amount: '1000000000000000000',
          period: 2419200,
          maxPremiumInAsset: '3162502120188520',
          paymentAsset: 0,
          commissionRatio: 1500,
          commissionDestination: '0x586b9b2F8010b284A0197f392156f1A7Eb5e86e9',
          ipfsData: '',
        },
        poolAllocationRequests: [
          {
            poolId: '24',
            coverAmountInAsset: '1000189894583466386',
            skip: false,
          },
        ],
      },
    },
    error: undefined,
  },
  [CoverAsset.DAI]: {
    result: {
      displayInfo: {
        premiumInAsset: '6239592777087466',
        coverAmount: '1000000000000000000',
        yearlyCostPerc: 0.0675,
        maxCapacity: '892726566666876078802946',
      },
      buyCoverInput: {
        buyCoverParams: {
          coverId: 0,
          owner: '0xBA2fB2266a5fC1CB817E353219d1FC1D35d29C65',
          productId: 231,
          coverAsset: 1,
          amount: '1000000000000000000',
          period: 2419200,
          maxPremiumInAsset: '6239592777087466',
          paymentAsset: 1,
          commissionRatio: 1500,
          commissionDestination: '0x586b9b2F8010b284A0197f392156f1A7Eb5e86e9',
          ipfsData: '',
        },
        poolAllocationRequests: [
          {
            poolId: '22',
            coverAmountInAsset: '1201179974740417324',
            skip: false,
          },
        ],
      },
    },
    error: undefined,
  },
};
