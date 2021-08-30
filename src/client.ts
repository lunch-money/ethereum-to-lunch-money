import * as ethscan from '@mycrypto/eth-scan';
import * as ethers from 'ethers';
import mem from 'mem';

import tokenList1inch from '../fixtures/1inch.json';

export interface EthereumWalletClient {
  getWeiBalance(walletAddress: string): Promise<bigint>;
  getTokensBalance(walletAddress: string, tokenContractAddresses: string[]): Promise<ethscan.BalanceMap<bigint>>;
}

export const createEthereumWalletClient = (provider: ethers.providers.BaseProvider): EthereumWalletClient => ({
  async getWeiBalance(walletAddress) {
    return (await provider.getBalance(walletAddress)).toBigInt();
  },
  async getTokensBalance(walletAddress, tokenContractAddresses) {
    return ethscan.getTokensBalance(provider, walletAddress, tokenContractAddresses);
  },
});

interface Token {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

export const loadTokenList = mem(async (): Promise<Token[]> => {
  return tokenList1inch.tokens;
});
