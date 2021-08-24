import assert from 'node:assert';
import fs from 'node:fs/promises';
import url from 'node:url';

import ethscan from '@mycrypto/eth-scan';
import ethers from 'ethers';
import mem from 'mem';

import { CryptoBalance } from './types.js';

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
  chainId: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

export const loadTokenList = mem(async (): Promise<Token[]> => {
  assert(import.meta.resolve);

  const tokenListPath = url.fileURLToPath(await import.meta.resolve('../fixtures/1inch.json'));
  const tokenList = JSON.parse((await fs.readFile(tokenListPath)).toString('utf-8'));
  return tokenList.tokens;
});

export const weiToEth = ({ asset, amount }: { asset: string; amount: bigint }): CryptoBalance => ({
  asset,
  amount: ethers.utils.formatEther(amount),
});
