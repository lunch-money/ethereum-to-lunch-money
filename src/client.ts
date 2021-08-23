import assert from 'node:assert';
import fs from 'node:fs/promises';
import url from 'node:url';

import ethers from 'ethers';
import ethscan from '@mycrypto/eth-scan';

/** The minimum balance (in wei) that a token should have in order to be
 * considered for returning as a balance. */
const NEGLIGIBLE_BALANCE_THRESHOLD = 1000;

interface EthereumWalletApiConfig {
  etherscan: string;
}

interface EthereumWalletClientConfig {
  api: EthereumWalletApiConfig;
  negligibleBalanceThreshold?: string;
}

interface Token {
  address: string;
  chainId: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

interface WalletBalanceMap {
  [key: string]: string;
}

export const loadTokenList = async (): Promise<Token[]> => {
  assert(import.meta.resolve);

  const tokenListPath = url.fileURLToPath(await import.meta.resolve('../fixtures/1inch.json'));
  const tokenList = JSON.parse((await fs.readFile(tokenListPath)).toString('utf-8'));
  return tokenList.tokens;
};

export const loadTokenBalances = async (
  walletAddress: string,
  tokenList: Token[],
  provider: ethers.providers.BaseProvider,
): Promise<WalletBalanceMap> => {
  const weiBalance = await provider.getBalance(walletAddress);
  const ethBalance = ethers.utils.formatEther(weiBalance);

  const map = await ethscan.getTokensBalance(
    provider,
    walletAddress,
    tokenList.map((t: any) => t.address),
  );

  const toTokenBalance = (o: WalletBalanceMap, [tokenAddress, tokenBalance]: [string, bigint]) => {
    const token = tokenList.find((t: any) => t.address === tokenAddress);
    assert(token);

    if (tokenBalance > NEGLIGIBLE_BALANCE_THRESHOLD) {
      return {
        ...o,
        [token.symbol]: ethers.utils.formatEther(tokenBalance),
      };
    } else {
      return o;
    }
  };

  return Object.entries(map).reduce(toTokenBalance, {
    ETH: ethBalance,
  });
};
