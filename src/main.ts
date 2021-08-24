import assert from 'node:assert';

import {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
} from './types.js';

import { loadTokenList, weiToEth, EthereumWalletClient } from './client.js';

export { LunchMoneyCryptoConnection } from './types.js';

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
  async getBalances(config, context) {
    const weiBalance = await context.client.getWeiBalance(config.walletAddress);

    const tokenList = await loadTokenList();
    const map = await context.client.getTokensBalance(
      config.walletAddress,
      tokenList.map((t) => t.address),
    );

    const balances = tokenList.flatMap(({ address, symbol }) => {
      const amount = map[address] ?? 0;
      if (amount > (config.negligibleBalanceThreshold ?? NEGLIGIBLE_BALANCE_THRESHOLD)) {
        return [{ asset: symbol, amount }];
      } else {
        return [];
      }
    });

    return {
      providerName: 'wallet_ethereum',
      balances: [{ asset: 'ETH', amount: weiBalance }, ...balances].map(weiToEth),
    };
  },
};
