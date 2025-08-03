import * as ethscan from '@mycrypto/eth-scan';
import * as ethers from 'ethers';

import tokenList1inch from '../fixtures/1inch.json';
import { EthersProviderLike } from '@mycrypto/eth-scan/typings/src/providers/ethers.js';

// Use node-fetch for Node.js compatibility
import fetch from 'node-fetch';

export interface EthereumWalletClient {
  getChainId(): Promise<bigint>;
  getWeiBalance(walletAddress: string): Promise<bigint>;
  getTokensBalance(walletAddress: string, tokenContractAddresses: string[]): Promise<ethscan.BalanceMap<bigint>>;
  discoverTokens(walletAddress: string): Promise<string[]>; // NEW
  discoverTokensHybrid(walletAddress: string): Promise<{ tokens: string[]; debug: string[] }>; // NEW HYBRID
}

export class EtherscanProvider {
  private apiKey: string;
  private baseUrl: string = 'https://api.etherscan.io/v2/api';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async discoverTokensForWallet(address: string, chainId?: bigint): Promise<string[]> {
    // Use chainId from provider, default to Ethereum mainnet (1)
    const targetChainId = chainId ? Number(chainId) : 1;

    const response = await fetch(
      `${this.baseUrl}?chainid=${targetChainId}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${this.apiKey}`,
    );

    const data = await response.json();

    // Handle valid "no transactions" response
    if (data.status === '0' && data.message === 'No transactions found') {
      return [];
    }

    // Handle API errors
    if (data.status === '0' && data.message === 'NOTOK') {
      throw new Error(`Etherscan V2 API error: ${data.result}`);
    }

    if (data.status !== '1') {
      throw new Error(`Etherscan V2 API error: ${data.message}`);
    }

    // Extract unique token contract addresses from transfer events
    const uniqueTokens = new Set<string>();
    for (const tx of data.result) {
      uniqueTokens.add(tx.contractAddress);
    }

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
  provider: ethers.AbstractProvider,
  etherscanApiKey?: string,
  moralisApiKey?: string,
): EthereumWalletClient => {
  // A custom ethscan provider implementation is needed to map `call` to `send` for ethscan to use the ethers client correctly.
  // This is a temporary solution until the ethscan library is updated to support ethers v6.
  const customProvider: EthersProviderLike = {
    send<Result>(method: string, params: unknown[] | unknown): Promise<Result> {
      // Type pulled from: https://github.com/MyCryptoHQ/eth-scan/blob/master/src/providers/provider.ts#L32
      const typedParams = params as [{ to: string; data: string }, string];

      return provider.call({ to: typedParams[0].to, data: typedParams[0].data }) as Promise<Result>;
    },
  };

  const etherscanProvider = etherscanApiKey ? new EtherscanProvider(etherscanApiKey) : null;
  const moralisProvider = moralisApiKey ? new MoralisProvider(moralisApiKey) : null;

  return {
    async getChainId() {
      return (await provider.getNetwork()).chainId;
    },
    async getWeiBalance(walletAddress) {
      return await provider.getBalance(walletAddress);
    },
    async getTokensBalance(walletAddress, tokenContractAddresses) {
      return ethscan.getTokensBalance(customProvider, walletAddress, tokenContractAddresses);
    },
    async discoverTokens(walletAddress) {
      if (!etherscanProvider) {
        throw new Error('Etherscan API key not provided for token discovery');
      }
      return await etherscanProvider.discoverTokensForWallet(walletAddress);
    },
    async discoverTokensHybrid(walletAddress) {
      const debug: string[] = [];
      const allTokens = new Set<string>();

      // Get the chain ID from the provider
      const chainId = await provider.getNetwork().then((network) => network.chainId);
      debug.push(`Network detected: Chain ID ${chainId}`);

      // 1. Moralis Discovery (PRIMARY)
      if (moralisProvider) {
        try {
          const moralisTokens = await moralisProvider.discoverTokensForWallet(walletAddress, chainId);
          debug.push(`Moralis: Discovered ${moralisTokens.length} tokens`);
          moralisTokens.forEach((t) => allTokens.add(t));
        } catch (error) {
          debug.push(`Moralis: Failed - ${error instanceof Error ? error.message : String(error)}`);

          // 2. Etherscan Discovery (FALLBACK ONLY)
          if (etherscanProvider) {
            try {
              const etherscanTokens = await etherscanProvider.discoverTokensForWallet(walletAddress, chainId);
              debug.push(`Etherscan (fallback): Discovered ${etherscanTokens.length} tokens`);
              etherscanTokens.forEach((t) => allTokens.add(t));
            } catch (fallbackError) {
              debug.push(
                `Etherscan (fallback): Failed - ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
              );
            }
          } else {
            debug.push('Etherscan: No API key provided for fallback');
          }
        }
      } else {
        debug.push('Moralis: No API key provided');

        // 3. Etherscan Discovery (PRIMARY if no Moralis)
        if (etherscanProvider) {
          try {
            const etherscanTokens = await etherscanProvider.discoverTokensForWallet(walletAddress, chainId);
            debug.push(`Etherscan: Discovered ${etherscanTokens.length} tokens`);
            etherscanTokens.forEach((t) => allTokens.add(t));
          } catch (error) {
            debug.push(`Etherscan: Failed - ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          debug.push('Etherscan: No API key provided');
        }
      }

      const finalTokens = Array.from(allTokens);
      debug.push(`Total unique tokens discovered: ${finalTokens.length}`);

      return { tokens: finalTokens, debug };
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
