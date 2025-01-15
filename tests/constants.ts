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
  DAI: {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
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
  yUSDC: {
    address: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
    whale: '0xC4080c19DE69c2362d01B20F071D4046364A0226',
    decimals: 6,
  },
  yUSDT: {
    address: '0x3B27F92C0e212C671EA351827EDF93DB27cc0c65',
    whale: '0xB0eb24077563DB8b88384949011dc46410C0A31D',
    decimals: 6,
  },
  yDAI: {
    address: '0xdA816459F1AB5631232FE5e97a05BBBb94970c95',
    whale: '0x5C6374a2ac4EBC38DeA0Fc1F8716e5Ea1AdD94dd',
    decimals: 18,
  },
  yvDAI: {
    address: '0xe24BA27551aBE96Ca401D39761cA2319Ea14e3CB',
    whale: '0x54C6b2b293297e65b1d163C3E8dbc45338bfE443',
    decimals: 18,
  },
  AAVE_V2_aDAI: {
    address: '0x028171bCA77440897B824Ca71D1c56caC55b68A3',
    whale: '0x07edE94cF6316F4809f2B725f5d79AD303fB4Dc8',
    decimals: 18,
  },
  AAVE_V2_aUSDC: {
    address: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
    whale: '0xc9E6E51C7dA9FF1198fdC5b3369EfeDA9b19C34c',
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
    whale: '0xA91661efEe567b353D55948C0f051C1A16E503A5',
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
  uDAI: {
    address: '0xb95BD0793bCC5524AF358ffaae3e38c3903C7626',
    whale: '0x31d3243CfB54B34Fc9C73e1CB1137124bD6B13E1',
    decimals: 18,
  },
  uUSDT: {
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
  yearnV3_DAI: {
    address: '0x92545bCE636E6eE91D88D2D017182cD0bd2fC22e',
    whale: '0x38E3d865e34f7367a69f096C80A4fc329DB38BF4',
    decimals: 18,
  },
  yearnV3_ajnaDAI: {
    address: '0xe24BA27551aBE96Ca401D39761cA2319Ea14e3CB',
    whale: '0x54C6b2b293297e65b1d163C3E8dbc45338bfE443',
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
  vaUSDC: {
    address: '0xa8b607Aa09B6A2E306F93e74c282Fb13f6A80452',
    whale: '0x3691EF68Ba22a854c36bC92f6b5F30473eF5fb0A',
    decimals: 18,
  },
  GEARBOX_PASSIVE_V3_USDC: {
    address: '0xda00000035fef4082f78def6a8903bee419fbf8e',
    whale: '0x9ef444a6d7F4A5adcd68FD5329aA5240C90E14d2',
    decimals: 6,
  },
  GEARBOX_PASSIVE_V3_USDT: {
    address: '0x05a811275fe9b4de503b3311f51edf6a856d936e',
    whale: '0x16adAb68bDEcE3089D4f1626Bb5AEDD0d02471aD',
    decimals: 6,
  },
  GEARBOX_PASSIVE_V3_DAI: {
    address: '0xe7146f53dbcae9d6fa3555fe502648deb0b2f823',
    whale: '0xC853E4DA38d9Bd1d01675355b8c8f3BBC1451973',
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
