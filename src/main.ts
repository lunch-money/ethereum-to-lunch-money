import {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
} from './types.js';

import { createZapperAPIClient, ZapperAPIClient } from './client.js';

export { LunchMoneyCryptoConnection } from './types.js';
export { createZapperAPIClient, ZapperAPIClient } from './client.js';

/** The minimum balance (in USD) that a token should have in order to be
 * considered for returning as a balance. */
const NEGLIGIBLE_BALANCE_THRESHOLD = 0.01;

interface LunchMoneyEthereumWalletConnectionConfig extends LunchMoneyCryptoConnectionConfig {
  /** The unique ID of the user's wallet address on the blockchain. */
  walletAddress: string;
  negligibleBalanceThreshold?: number;
}

interface LunchMoneyEthereumWalletConnectionContext extends LunchMoneyCryptoConnectionContext {
  client: ZapperAPIClient;
}

export const LunchMoneyEthereumWalletConnection: LunchMoneyCryptoConnection<
  LunchMoneyEthereumWalletConnectionConfig,
  LunchMoneyEthereumWalletConnectionContext
> = {
  async initiate(config, context) {
    return this.getBalances(config, context);
  },
  async getBalances(
    { walletAddress, negligibleBalanceThreshold = NEGLIGIBLE_BALANCE_THRESHOLD },
    { client = createZapperAPIClient() },
  ) {
    // For some reason the address that is returned in the response is
    // lowercased.
    const walletAddressIndex = walletAddress.toLowerCase();

    const res = await client.getTokenBalances([walletAddress]);

    const balances = res
      .flatMap((x) =>
        x.balances[walletAddressIndex].products.flatMap((p) =>
          p.assets.flatMap((a) =>
            a.tokens.map((t) => ({
              asset: t.symbol,
              amount: t.balance,
              amountInUSD: t.balanceUSD,
            })),
          ),
        ),
      )
      .filter((t) => t.amountInUSD > negligibleBalanceThreshold)
      .map((t) => ({ ...t, amount: t.amount.toString(), amountInUSD: t.amountInUSD.toString() }));

    return {
      providerName: 'wallet_ethereum',
      balances,
    };
  },
};
