import {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
  CryptoBalance,
} from './types.js';

import { encode } from 'node:querystring';
import EventSource from 'eventsource';

export { LunchMoneyCryptoConnection } from './types.js';
// export { createEthereumWalletClient, EthereumWalletClient } from './client.js';

const ZAPPER_FI_API_URL = 'https://api.zapper.fi/v1/balances';
// This API key is public and shared with all users. This API is publicly
// available, free of charge. See here for details:
// https://docs.zapper.fi/zapper-api/endpoints
const ZAPPER_FI_API_KEY = '96e0cc51-a62e-42ca-acee-910ea7d2a241';

/** The minimum balance (in wei) that a token should have in order to be
 * considered for returning as a balance. */
const NEGLIGIBLE_BALANCE_THRESHOLD = 1000;

interface LunchMoneyEthereumWalletConnectionConfig extends LunchMoneyCryptoConnectionConfig {
  /** The unique ID of the user's wallet address on the blockchain. */
  walletAddress: string;
  negligibleBalanceThreshold?: number;
}

type LunchMoneyEthereumWalletConnectionContext = LunchMoneyCryptoConnectionContext;

export const LunchMoneyEthereumWalletConnection: LunchMoneyCryptoConnection<
  LunchMoneyEthereumWalletConnectionConfig,
  LunchMoneyEthereumWalletConnectionContext
> = {
  async initiate(config, context) {
    return this.getBalances(config, context);
  },
  async getBalances({ walletAddress, negligibleBalanceThreshold = NEGLIGIBLE_BALANCE_THRESHOLD }, {}) {
    // For some reason the address that is returned in the response is
    // lowercased.
    const walletAddressIndex = walletAddress.toLowerCase();

    const qs = encode({
      'addresses[]': walletAddress,
      api_key: ZAPPER_FI_API_KEY,
    });

    const es = new EventSource(ZAPPER_FI_API_URL + '?' + qs);

    const hasAnyNonZeroBalances = (balanceData: any) => balanceData.balances[walletAddressIndex].products.length > 0;

    let balances: CryptoBalance[] = [];

    es.addEventListener('balance', (ev) => {
      const data = JSON.parse(ev.data);
      if (hasAnyNonZeroBalances(data)) {
        const p = data.balances[walletAddressIndex].products;

        const appBalances: CryptoBalance[] = p.flatMap((p: any) =>
          p.assets.flatMap((a: any) =>
            a.tokens.map((t: any) => ({
              asset: t.symbol,
              amount: t.balance.toString(),
              amountInUSD: t.balanceUSD.toString(),
            })),
          ),
        );

        balances = balances.concat(appBalances);
      }
    });

    return new Promise((resolve, reject) => {
      es.addEventListener('end', () => {
        es.close();
        resolve({
          providerName: 'wallet_ethereum',
          balances,
        });
      });

      es.addEventListener('error', (ev) => {
        es.close();
        reject(ev);
      });
    });
  },
};
