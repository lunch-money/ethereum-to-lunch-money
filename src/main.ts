import type {
  LunchMoneyCryptoConnection,
  LunchMoneyCryptoConnectionContext,
  LunchMoneyCryptoConnectionConfig,
} from './types.js';

import { EthereumWalletClient } from './client.js';
import EthereumInitializationService, { EthereumIntegrationType } from './ethereum_init.js';

export { createEthereumWalletClient } from './client.js';
export { EthereumInitializationService, EthereumIntegrationType };

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
    return client.getBalances(walletAddress, negligibleBalanceThreshold);
  },
};
