import assert from 'node:assert';
import fs from 'node:fs/promises';
import url from 'node:url';

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

export const loadTokenList = async (): Promise<Token[]> => {
  assert(import.meta.resolve);

  const tokenListPath = url.fileURLToPath(await import.meta.resolve('../fixtures/1inch.json'));
  const tokenList = JSON.parse((await fs.readFile(tokenListPath)).toString('utf-8'));
  return tokenList.tokens;
};
