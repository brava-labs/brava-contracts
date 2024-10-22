import { CoverAsset } from '@nexusmutual/sdk';

// Contract Addresses
export const CURVE_3POOL_ADDRESS = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';
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
  ADMIN_ROLE: 'ADMIN_ROLE',
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
      fluid: '0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33',
      yearn: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
    },
  },
  USDT: {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    whale: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    decimals: 6,
    pools: {
      fluid: '0x5c20b550819128074fd538edf79791733ccedd18',
    },
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
  fUSDC: {
    address: '0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33',
    whale: '0x2fA6c95B69c10f9F52b8990b6C03171F13C46225',
    decimals: 6,
  },
  fUSDT: {
    address: '0x5c20b550819128074fd538edf79791733ccedd18',
    whale: '0x490681095ed277B45377d28cA15Ac41d64583048',
    decimals: 6,
  },
  yUSDC: {
    address: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
    whale: '0xC4080c19DE69c2362d01B20F071D4046364A0226',
    decimals: 6,
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
