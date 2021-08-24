import assert from 'node:assert';

import {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
} from './types.js';

import ethscan from '@mycrypto/eth-scan';
import type ethers from 'ethers';

import { loadTokenList, weiToEth } from './client.js';

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
  provider: ethers.providers.BaseProvider;
}

export const LunchMoneyEthereumWalletConnection: LunchMoneyCryptoConnection<
  LunchMoneyEthereumWalletConnectionConfig,
  LunchMoneyEthereumWalletConnectionContext
> = {
  async initiate(config, context) {
    return this.getBalances(config, context);
  },
  async getBalances(config, context) {
    const tokenList = await loadTokenList();
    const weiBalance = await context.provider.getBalance(config.walletAddress);

    const map = await ethscan.getTokensBalance(
      context.provider,
      config.walletAddress,
      tokenList.map((t) => t.address),
    );

    const balances = Object.entries(map).flatMap(([tokenAddress, amount]) => {
      const token = tokenList.find((t) => t.address === tokenAddress);
      assert(token);

      if (amount > (config.negligibleBalanceThreshold ?? NEGLIGIBLE_BALANCE_THRESHOLD)) {
        return [{ asset: token.symbol, amount }];
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
