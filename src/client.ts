import assert from 'node:assert';
import fs from 'node:fs/promises';
import url from 'node:url';

import ethers, { BigNumberish } from 'ethers';
import mem from 'mem';

import { CryptoBalance } from './types.js';

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

export const weiToEth = ({ asset, amount }: { asset: string; amount: BigNumberish }): CryptoBalance => ({
  asset,
  amount: ethers.utils.formatEther(amount),
});
