import * as ethscan from '@mycrypto/eth-scan';
import { ethers, type Provider, type AbstractProvider } from 'ethers';

import tokenList1inch from '../fixtures/1inch.json';
import { EthersProviderLike } from '@mycrypto/eth-scan/typings/src/providers/ethers.js';
import type { LunchMoneyCryptoConnectionBalances } from './types.js';

// Use node-fetch for Node.js compatibility
import fetch from 'node-fetch';

// Define ProviderInfo interface
export type ProviderInfo = {
  type: 'Service Provider' | 'API Provider';
  name: string;
  status: 'SUCCESS' | 'FAILED';
  apiKey?: string;
  provider?: Provider | AbstractProvider;
  customProvider?: EthersProviderLike;
  error?: string;
  network?: string;
  balance?: string;
};

/**
 * Debug function that logs to console.log if DEBUG_ETHEREUM environment variable is set
 */
export const debug = (...args: unknown[]): void => {
  if (process.env.DEBUG_ETHEREUM) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG_ETHEREUM] [${timestamp}]`, ...args);
  }
};

export interface EthereumWalletClient {
  getBalances(walletAddress: string, negligibleBalanceThreshold: number): Promise<LunchMoneyCryptoConnectionBalances>;
  getWeiBalance(walletAddress: string, provider: AbstractProvider): Promise<bigint>;
  getChainId(provider: AbstractProvider): Promise<bigint>;
  getTokensBalance(
    walletAddress: string,
    tokenContractAddresses: string[],
    providerInfo: ProviderInfo,
  ): Promise<ethscan.BalanceMap<bigint>>;
  discoverTokensHybrid(walletAddress: string, chainId: bigint): Promise<string[]>;
}
export class EtherscanProvider {
  private apiKey: string;
  private baseUrl: string = 'https://api.etherscan.io/v2/api';
  private fetchFn: typeof fetch;

  constructor(apiKey: string, fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  async discoverTokensForWallet(address: string, chainId?: bigint): Promise<string[]> {
    const targetChainId = chainId ? Number(chainId) : 1;
    const pageSize = process.env.ETHERSCAN_PAGE_SIZE ? parseInt(process.env.ETHERSCAN_PAGE_SIZE) : 1000;
    const uniqueTokens = new Set<string>();
    const obscuredAddress = `0x..${address.slice(-6)}`;
    let page = 1;
    let totalEvents = 0;

    while (true) {
      const url = `${this.baseUrl}?chainid=${targetChainId}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&page=${page}&offset=${pageSize}&apikey=${this.apiKey}`;

      let data: { status: string; message: string; result: { contractAddress: string }[] };
      try {
        const response = await this.fetchFn(url);
        data = (await response.json()) as typeof data;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message.replace(/apikey=[^&\s]+/gi, 'apikey=[redacted]') : String(error);
        throw new Error(`Etherscan API network error on page ${page} for ${obscuredAddress}: ${msg}`);
      }

      if (data.status === '0' && data.message === 'No transactions found') {
        break;
      }

      if (data.status === '0' && data.message === 'NOTOK') {
        throw new Error(`Etherscan V2 API error: ${data.result}`);
      }

      if (data.status !== '1') {
        throw new Error(`Etherscan V2 API error: ${data.message}`);
      }

      totalEvents += data.result.length;
      for (const tx of data.result) {
        uniqueTokens.add(tx.contractAddress);
      }

      if (data.result.length < pageSize) {
        break;
      }

      // Etherscan enforces a hard maximum of 10 pages: page 11 always returns
      // "Result window is too large" regardless of offset size. This is not
      // configurable — it applies even with ETHERSCAN_PAGE_SIZE=5 (50 records total).
      // Wallets with more than 10 * pageSize transfer events will have older
      // token history truncated here; Moralis (primary provider) does not have this limit.
      if (page >= 10) {
        debug(
          `Etherscan: reached 10-page hard limit for ${obscuredAddress} — token discovery may be incomplete for high-activity wallets`,
        );
        break;
      }

      // Stay under Etherscan's free tier limit of 3 calls/sec
      await new Promise((resolve) => setTimeout(resolve, 400));
      page++;
      debug(`Etherscan: fetching page ${page} for ${obscuredAddress}`);
    }

    debug(
      `Etherscan: fetched ${totalEvents} transfer events across ${page} page(s), discovered ${uniqueTokens.size} unique tokens for ${obscuredAddress}`,
    );
    return Array.from(uniqueTokens);
  }
}

export class MoralisProvider {
  private apiKey: string;
  private baseUrl: string = 'https://deep-index.moralis.io/api/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async discoverTokensForWallet(address: string, chainId?: bigint): Promise<string[]> {
    // Map chainId to Moralis chain format (only supports specific enum values)
    let chainFormat: string;
    if (chainId) {
      switch (Number(chainId)) {
        case 1:
          chainFormat = 'eth';
          break; // Ethereum mainnet
        case 137:
          chainFormat = 'polygon';
          break; // Polygon
        case 56:
          chainFormat = 'bsc';
          break; // BSC
        case 42161:
          chainFormat = 'arbitrum';
          break; // Arbitrum
        case 10:
          chainFormat = 'optimism';
          break; // Optimism
        case 43114:
          chainFormat = 'avalanche';
          break; // Avalanche
        case 250:
          chainFormat = 'fantom';
          break; // Fantom
        default:
          chainFormat = 'eth';
          break; // Default to Ethereum
      }
    } else {
      chainFormat = 'eth'; // Default to Ethereum mainnet
    }

    const response = await fetch(`${this.baseUrl}/${address}/erc20?chain=${chainFormat}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.message && errorData.message.includes('over 2000 tokens')) {
        throw new Error(`Moralis API error: Wallet has too many tokens (>2000) - ${errorData.message}`);
      }
      throw new Error(`Moralis API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract unique token contract addresses from balance data
    const uniqueTokens = new Set<string>();
    for (const item of data) {
      if (item.token_address && item.balance !== '0') {
        uniqueTokens.add(item.token_address);
      }
    }

    return Array.from(uniqueTokens);
  }
}

export const createEthereumWalletClient = (
  serviceProviderInfo: ProviderInfo[] = [],
  walletAPIProviderInfo: ProviderInfo[] = [],
  getTokensBalanceFn: typeof ethscan.getTokensBalance = ethscan.getTokensBalance,
): EthereumWalletClient => {
  let providers: ReadonlyArray<ProviderInfo> = [];
  let etherscanProvider: EtherscanProvider | null = null;
  let moralisProvider: MoralisProvider | null = null;

  try {
    // Initialize the custom provider(s) for ethscan to use the ethers client correctly.
    // A custom ethscan provider implementation is needed to map `call` to `send` for ethscan to use the ethers client correctly.
    // This is a temporary solution until the ethscan library is updated to support ethers v6.
    if (serviceProviderInfo.length) {
      providers = Object.freeze(
        serviceProviderInfo.map((providerInfo) => {
          if (providerInfo.type === 'Service Provider' && providerInfo.provider) {
            return {
              ...providerInfo,
              customProvider: {
                send<Result>(method: string, params: unknown[] | unknown): Promise<Result> {
                  // Type pulled from: https://github.com/MyCryptoHQ/eth-scan/blob/master/src/providers/provider.ts#L32
                  const typedParams = params as [{ to: string; data: string }, string];
                  return providerInfo.provider?.call({
                    to: typedParams[0].to,
                    data: typedParams[0].data,
                  }) as Promise<Result>;
                },
              },
            };
          } else {
            throw new Error(`Invalid service provider: ${providerInfo.name} passed to createEthereumWalletClient`);
          }
        }),
      );

      // Initialize any wallet API providers
      for (const walletKeyInfo of walletAPIProviderInfo) {
        if (walletKeyInfo.type === 'API Provider') {
          if (walletKeyInfo.name === 'Etherscan' && walletKeyInfo.apiKey) {
            etherscanProvider = new EtherscanProvider(walletKeyInfo.apiKey);
          } else if (walletKeyInfo.name === 'Moralis' && walletKeyInfo.apiKey) {
            moralisProvider = new MoralisProvider(walletKeyInfo.apiKey);
          }
        } else {
          throw new Error(`Invalid wallet API provider: ${walletKeyInfo.name} passed to createEthereumWalletClient`);
        }
      }
    } else {
      // Create a wallet using the quorum of free service providers
      const publicProvider = ethers.getDefaultProvider();
      providers = Object.freeze([
        ...providers,
        {
          type: 'Service Provider',
          name: 'Public Provider',
          provider: publicProvider as Provider,
          status: 'SUCCESS',
          customProvider: {
            send<Result>(method: string, params: unknown[] | unknown): Promise<Result> {
              const typedParams = params as [{ to: string; data: string }, string];
              return publicProvider?.call({ to: typedParams[0].to, data: typedParams[0].data }) as Promise<Result>;
            },
          },
        },
      ]);
    }
  } catch (error) {
    throw new Error(`Error creating Ethereum wallet client: ${error instanceof Error ? error.message : String(error)}`);
  }

  const internalGetBalances = async (
    client: EthereumWalletClient,
    walletAddress: string,
    negligibleBalanceThreshold: number,
    provider: AbstractProvider,
    customProvider: EthersProviderLike,
    obscuredWalletAddress: string,
  ): Promise<LunchMoneyCryptoConnectionBalances> => {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutDuration = process.env.ETHEREUM_BALANCE_TIMEOUT_MSECS
      ? parseInt(process.env.ETHEREUM_BALANCE_TIMEOUT_MSECS)
      : 60000;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Ethereum connector getBalances timed out after ${timeoutDuration} milliseconds.`));
      }, timeoutDuration);
    });

    const result = await Promise.race([
      (async () => {
        try {
          const weiBalance = await client.getWeiBalance(walletAddress, provider);
          const chainId = await client.getChainId(provider);

          let filteredTokens: Token[] = [];
          try {
            let discoveredTokens: string[] = [];
            if (moralisProvider || etherscanProvider) {
              discoveredTokens = await client.discoverTokensHybrid(walletAddress, chainId);
              if (discoveredTokens.length > 0) {
                filteredTokens = await loadTokenList().then((tokens) =>
                  tokens.filter((t) => discoveredTokens.includes(t.address) && BigInt(t.chainId) === BigInt(chainId)),
                );
                debug(
                  `Wallet ${obscuredWalletAddress}: Filtered to ${filteredTokens.length} tokens on chain ${chainId}`,
                );
              } else {
                debug(`Wallet ${obscuredWalletAddress}: No tokens discovered, using empty token list`);
              }
            } else {
              debug(`Wallet ${obscuredWalletAddress}: No discovery APIs available, using full token list`);
              filteredTokens = (await loadTokenList()).filter((t) => BigInt(t.chainId) === BigInt(chainId));
            }
          } catch (error) {
            debug(`Wallet ${obscuredWalletAddress}: Token discovery failed, falling back to full token list:`, error);
            filteredTokens = (await loadTokenList()).filter((t) => BigInt(t.chainId) === BigInt(chainId));
          }

          debug(`Wallet ${obscuredWalletAddress}: Checking balances for ETH and ${filteredTokens.length} other tokens`);

          const map = await getTokensBalanceFn(
            customProvider,
            walletAddress,
            filteredTokens.map((t) => t.address),
          );

          return { weiBalance, chainId, map, filteredTokens };
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      })(),
      timeout,
    ]);

    const { weiBalance, chainId, map, filteredTokens } = result;
    debug('ethers.getTokensBalance returned for wallet address:', obscuredWalletAddress);

    const balances = Object.entries(map)
      .map(([address, balance]) => {
        const token = filteredTokens.find((t) => t.address === address);

        if (!token) {
          throw new Error(`Token ${address} not found in discovered token list for chainId ${chainId}`);
        }

        return {
          asset: token.symbol,
          undivisedAmount: balance,
          decimals: token.decimals,
        };
      })
      .concat({ asset: 'ETH', undivisedAmount: weiBalance, decimals: 18 })
      .map(({ asset, undivisedAmount, decimals }) => ({ asset, amount: ethers.formatUnits(undivisedAmount, decimals) }))
      .filter((b) => ethers.parseUnits(b.amount, 18) > negligibleBalanceThreshold)
      .map((b) => ({ asset: b.asset, amount: String(b.amount) }))
      .sort((a, b) => a.asset.localeCompare(b.asset));

    debug(`Returning from getBalances for ${obscuredWalletAddress}:`, balances);

    const balanceResult: LunchMoneyCryptoConnectionBalances = {
      providerName: 'wallet_ethereum',
      balances,
    };

    return balanceResult;
  };

  return {
    async getChainId(provider: AbstractProvider) {
      return (await provider.getNetwork()).chainId;
    },
    async getWeiBalance(walletAddress: string, provider: AbstractProvider) {
      return await provider.getBalance(walletAddress);
    },
    async getBalances(walletAddress: string, negligibleBalanceThreshold: number) {
      const obscuredWalletAddress = `0x..${walletAddress.slice(-6)}`;
      debug('getBalances called for wallet address:', obscuredWalletAddress);
      let result: LunchMoneyCryptoConnectionBalances = {
        providerName: 'wallet_ethereum',
        balances: [],
      };
      if (providers.length === 0) {
        throw new Error('No Ethereum providers available');
      }
      let providerIndex = 0;
      let provider: AbstractProvider = providers[0].provider as AbstractProvider;
      let customProvider: EthersProviderLike = providers[0].customProvider as EthersProviderLike;
      let providerName = providers[0].name;
      debug(`Attempting lookup using primary provider: ${providerName}`);
      let balanceFound = false;
      while (!balanceFound) {
        try {
          result = await internalGetBalances(
            this,
            walletAddress,
            negligibleBalanceThreshold,
            provider,
            customProvider,
            obscuredWalletAddress,
          );
          balanceFound = true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          debug(`Error getting balances using provider ${providerName}: ${errorMessage}`);
          if (
            errorMessage.includes('unconfigured name') ||
            errorMessage.includes('bad address checksum') ||
            errorMessage.includes('invalid ENS name')
          ) {
            throw new Error(`Invalid wallet address. Account needs to be relinked.`);
          } else if (providerIndex === providers.length - 1) {
            throw error;
          }
          providerIndex = providerIndex + 1;
          providerName = providers[providerIndex].name;
          provider = providers[providerIndex].provider as AbstractProvider;
          customProvider = providers[providerIndex].customProvider as EthersProviderLike;
          debug(`Retrying lookup using provider: ${providerName}`);
        }
      }
      return result;
    },
    async getTokensBalance(walletAddress: string, tokenContractAddresses: string[], providerInfo: ProviderInfo) {
      if (providerInfo.customProvider) {
        return getTokensBalanceFn(providerInfo.customProvider, walletAddress, tokenContractAddresses);
      } else {
        throw new Error(`No ethscan compatible provider found for ${providerInfo.name}`);
      }
    },
    async discoverTokensHybrid(walletAddress: string, chainId: bigint): Promise<string[]> {
      const allTokens = new Set<string>();
      let discoverySucceeded = false;

      // 1. Moralis Discovery (PRIMARY)
      if (moralisProvider) {
        try {
          const moralisTokens = await moralisProvider.discoverTokensForWallet(walletAddress, chainId);
          debug(`Moralis: Discovered ${moralisTokens.length} tokens`);
          moralisTokens.forEach((t) => allTokens.add(t));
          discoverySucceeded = true;
        } catch (error) {
          debug(`Moralis: Failed - ${error instanceof Error ? error.message : String(error)}`);

          // 2. Etherscan Discovery (FALLBACK ONLY)
          if (etherscanProvider) {
            try {
              const etherscanTokens = await etherscanProvider.discoverTokensForWallet(walletAddress, chainId);
              debug(`Etherscan (fallback): Discovered ${etherscanTokens.length} tokens`);
              etherscanTokens.forEach((t) => allTokens.add(t));
              discoverySucceeded = true;
            } catch (fallbackError) {
              debug(
                `Etherscan (fallback): Failed - ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
              );
            }
          } else {
            debug('Etherscan: No API key provided for fallback');
          }
        }
      } else {
        debug('Moralis: No API key provided');

        // 3. Etherscan Discovery (PRIMARY if no Moralis)
        if (etherscanProvider) {
          try {
            const etherscanTokens = await etherscanProvider.discoverTokensForWallet(walletAddress, chainId);
            debug(`Etherscan: Discovered ${etherscanTokens.length} tokens`);
            etherscanTokens.forEach((t) => allTokens.add(t));
            discoverySucceeded = true;
          } catch (error) {
            debug(`Etherscan: Failed - ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          debug('Etherscan: No API key provided');
        }
      }

      if (!discoverySucceeded) {
        throw new Error('All token discovery providers failed');
      }

      return Array.from(allTokens);
    },
  };
};

interface Token {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string | null;
}

export const loadTokenList = async (): Promise<Token[]> => {
  return tokenList1inch.tokens;
};
