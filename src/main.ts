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

/**
 * Debug function that logs to console.log if DEBUG_ETHEREUM environment variable is set
 */
const debug = (...args: unknown[]): void => {
  if (process.env.DEBUG_ETHEREUM) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG_ETHEREUM] [${timestamp}]`, ...args);
  }
};

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
    const obscuredWalletAddress = `0x..${walletAddress.slice(-6)}`;
    debug('getBalances called for wallet address:', obscuredWalletAddress);

    // Create a timeout so we fail instead of generating a CORS errors
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutDuration = process.env.ETHEREUM_BALANCE_TIMEOUT_MSECS
      ? parseInt(process.env.ETHEREUM_BALANCE_TIMEOUT_MSECS)
      : 60000;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Ethereum connector getBalances timed out after ${timeoutDuration} milliseconds.`));
      }, timeoutDuration);
    });

    // Wrap all ethers calls in a single timeout
    const result = await Promise.race([
      (async () => {
        try {
          const weiBalance = await client.getWeiBalance(walletAddress);

          // Filter out tokens that are not on mainnet
          const chainId = await client.getChainId();

          const chainFilteredTokensList = (await loadTokenList()).filter((t) => BigInt(t.chainId) === BigInt(chainId));

          const map = await client.getTokensBalance(
            walletAddress,
            chainFilteredTokensList.map((t) => t.address),
          );

          return { weiBalance, chainId, map, chainFilteredTokensList };
        } finally {
          // Clear the timeout when the operation completes (success or failure)
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      })(),
      timeout,
    ]);

    const { weiBalance, chainId, map, chainFilteredTokensList } = result;
    debug('ethers.getTokensBalance returned for wallet address:', obscuredWalletAddress);

    const balances = Object.entries(map)
      .map(([address, balance]) => {
        const token = chainFilteredTokensList.find((t) => t.address === address);

        if (!token) {
          throw new Error(`Token ${address} not found in filtered token list for chainId ${chainId}`);
        }

        return {
          asset: token.symbol,
          undivisedAmount: balance,
          decimals: token.decimals,
        };
      })
      .concat({ asset: 'ETH', undivisedAmount: weiBalance, decimals: 18 })
      .map(({ asset, undivisedAmount, decimals }) => ({ asset, amount: ethers.formatUnits(undivisedAmount, decimals) }))
      // Normalize the amount to 18 decimal places (for the wei per eth standard) for filtering out negligible balances
      .filter((b) => ethers.parseUnits(b.amount, 18) > negligibleBalanceThreshold)
      .map((b) => ({ asset: b.asset, amount: String(b.amount) }))
      .sort((a, b) => a.asset.localeCompare(b.asset));

    debug(`Returning from getBalances for ${obscuredWalletAddress}:`, balances);

    return {
      providerName: 'wallet_ethereum',
      balances,
    };
  },
};
