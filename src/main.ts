import type {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
} from './types.js';

import { loadTokenList, EthereumWalletClient } from './client.js';
import * as ethers from 'ethers';

export { createEthereumWalletClient } from './client.js';

/** The minimum balance (in wei) that a token should have in order to be
 * considered for returning as a balance. */
const NEGLIGIBLE_BALANCE_THRESHOLD = 1000;

interface LunchMoneyEthereumWalletConnectionConfig extends LunchMoneyCryptoConnectionConfig {
  /** The unique ID of the user's wallet address on the blockchain. */
  walletAddress: string;
  negligibleBalanceThreshold?: number;
}

interface LunchMoneyEthereumWalletConnectionContext extends LunchMoneyCryptoConnectionContext {
  client: EthereumWalletClient;
}

export const LunchMoneyEthereumWalletConnection: LunchMoneyCryptoConnection<
  LunchMoneyEthereumWalletConnectionConfig,
  LunchMoneyEthereumWalletConnectionContext
> = {
  async initiate(config, context) {
    return this.getBalances(config, context);
  },
  async getBalances({ walletAddress, negligibleBalanceThreshold = NEGLIGIBLE_BALANCE_THRESHOLD }, { client }) {
    const weiBalance = await client.getWeiBalance(walletAddress);

    // Filter out tokens that are not on mainnet
    const mainetTokensList = (await loadTokenList()).filter((t) => t.chainId === 1);

    const map = await client.getTokensBalance(
      walletAddress,
      mainetTokensList.map((t) => t.address),
    );

    const balances = Object.entries(map).map(([address, balance]) => {
      const token = mainetTokensList.find((t) => t.address === address);

      if (!token) {
        throw new Error(`Token ${address} not found in mainet token list`);
      }

      return {
        asset: token.symbol,
        undivisedAmount: balance,
        decimals: token.decimals,
      }
    }).concat({ asset: 'ETH', undivisedAmount: weiBalance, decimals: 18 })
      .map(({ asset, undivisedAmount, decimals }) => ({ asset, amount: ethers.formatUnits(undivisedAmount, decimals) }))
      // Normalize the amount to 18 decimal places (for the wei per eth standard) for filtering out negligible balances
      .filter((b) => ethers.parseUnits(b.amount, 18) > negligibleBalanceThreshold)
      .map((b) => ({ asset: b.asset, amount: String(b.amount) }))
      .sort((a, b) => a.asset.localeCompare(b.asset));

    return {
      providerName: 'wallet_ethereum',
      balances,
    };
  },
};
