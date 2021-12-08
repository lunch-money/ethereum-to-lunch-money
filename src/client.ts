import ethscan from '@mycrypto/eth-scan';
import * as ethers from 'ethers';
import EventSource from 'eventsource';
import mem from 'mem';
import { encode } from 'querystring';

// import eventsource from "eventsource";

import tokenList1inch from '../fixtures/1inch.json';

console.log(ethscan);

const ZAPPER_FI_API_URL = 'https://api.zapper.fi/v1/balances';
const ZAPPER_FI_API_KEY = '96e0cc51-a62e-42ca-acee-910ea7d2a241';
const ETH_ADDRESS = '0x8E29007951cE79c151dd070b51e30168E9663c13';

export interface EthereumWalletClient {
  getWeiBalance(walletAddress: string): Promise<bigint>;
  getTokensBalance(walletAddress: string, tokenContractAddresses: string[]): Promise<ethscan.BalanceMap<bigint>>;
}

export const createEthereumWalletClient = (provider: ethers.providers.BaseProvider): EthereumWalletClient => ({
  async getWeiBalance(walletAddress) {
    return (await provider.getBalance(walletAddress)).toBigInt();
  },
  async getTokensBalance(walletAddress, tokenContractAddresses) {
    const es = new EventSource(
      ZAPPER_FI_API_URL +
        '?' +
        encode({
          'addresses[]': ETH_ADDRESS,
          api_key: ZAPPER_FI_API_KEY,
        }),
    );
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
