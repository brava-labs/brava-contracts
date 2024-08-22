import "@nomicfoundation/hardhat-ledger";
import "@nomicfoundation/hardhat-toolbox";
import * as tenderly from "@tenderly/hardhat-tenderly";
import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

tenderly.setup({
  automaticVerifications: !!process.env.TENDERLY_AUTOMATIC_VERIFICATION,
});

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    virtualMainnet: {
      url: process.env.TENDERLY_VIRTUAL_MAINNET_RPC!,
      chainId: 1,
    },
    hardhat: {
      forking: {
        url:
          "https://eth-mainnet.g.alchemy.com/v2/" +
          process.env.ALCHEMY_API_KEY!,
        enabled: true,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT!,
    username: process.env.TENDERLY_USERNAME!,
  },
};

export default config;
