import * as ethscan from '@mycrypto/eth-scan';
import * as ethers from 'ethers';

import tokenList1inch from '../fixtures/1inch.json';
import { EthersProviderLike } from '@mycrypto/eth-scan/typings/src/providers/ethers.js';

export interface EthereumWalletClient {
  getChainId(): Promise<bigint>;
  getWeiBalance(walletAddress: string): Promise<bigint>;
  getTokensBalance(walletAddress: string, tokenContractAddresses: string[]): Promise<ethscan.BalanceMap<bigint>>;
}

export const createEthereumWalletClient = (provider: ethers.AbstractProvider): EthereumWalletClient => {

  // A custom ethscan provider implementation is needed to map `call` to `send` for ethscan to use the ethers client correctly.
  // This is a temporary solution until the ethscan library is updated to support ethers v6.
  const customProvider: EthersProviderLike  = {
    send<Result>(method: string, params: unknown[] | unknown): Promise<Result> {

      // Type pulled from: https://github.com/MyCryptoHQ/eth-scan/blob/master/src/providers/provider.ts#L32
      const typedParams = params as [{to: string, data: string}, string];

      return provider.call({to: typedParams[0].to, data: typedParams[0].data}) as Promise<Result>
    }
  }

  return {
    async getChainId() {
      return (await provider.getNetwork()).chainId;
    },
    async getWeiBalance(walletAddress) {
      return (await provider.getBalance(walletAddress));
    },
    async getTokensBalance(walletAddress, tokenContractAddresses) {
      return ethscan.getTokensBalance(customProvider, walletAddress, tokenContractAddresses);
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
