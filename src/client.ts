import assert from 'node:assert';
import fs from 'node:fs/promises';
import url from 'node:url';

import ethscan from '@mycrypto/eth-scan';
import ethers, { BigNumberish } from 'ethers';
import mem from 'mem';

import { CryptoBalance, LunchMoneyCryptoConnectionBalances } from './types.js';

/** The minimum balance (in wei) that a token should have in order to be
 * considered for returning as a balance. */
const NEGLIGIBLE_BALANCE_THRESHOLD = 1000;

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

const weiToEth = ({ asset, amount }: { asset: string; amount: BigNumberish }): CryptoBalance => ({
  asset,
  amount: ethers.utils.formatEther(amount),
});

export const loadTokenBalances = async (
  walletAddress: string,
  tokenList: Token[],
  provider: ethers.providers.BaseProvider,
): Promise<LunchMoneyCryptoConnectionBalances> => {
  const weiBalance = await provider.getBalance(walletAddress);

  const map = await ethscan.getTokensBalance(
    provider,
    walletAddress,
    tokenList.map((t) => t.address),
  );

  const balances = Object.entries(map).flatMap(([tokenAddress, amount]) => {
    const token = tokenList.find((t) => t.address === tokenAddress);
    assert(token);

    if (amount > NEGLIGIBLE_BALANCE_THRESHOLD) {
      return [{ asset: token.symbol, amount }];
    } else {
      return [];
    }
  });

  return {
    providerName: 'wallet_ethereum',
    balances: [{ asset: 'ETH', amount: weiBalance }, ...balances].map(weiToEth),
  };
};
