import {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
} from './types.js';

import { loadTokenList, EthereumWalletClient } from './client.js';
import * as ethers from 'ethers';

export { LunchMoneyCryptoConnection } from './types.js';
export { createEthereumWalletClient, EthereumWalletClient } from './client.js';

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

    const tokenList = await loadTokenList();
    const map = await client.getTokensBalance(
      walletAddress,
      tokenList.map((t) => t.address),
    );

    const balances = tokenList
      .map((t) => ({
        asset: t.symbol,
        amount: map[t.address] ?? 0,
      }))
      .concat({ asset: 'ETH', amount: weiBalance })
      .filter((b) => b.amount > negligibleBalanceThreshold)
      .map(({ asset, amount }) => ({ asset, amount: ethers.utils.formatEther(amount) }))
      .sort((a, b) => a.asset.localeCompare(b.asset));

    return {
      providerName: 'wallet_ethereum',
      balances,
    };
  },
};
