#!/usr/bin/env node --loader ts-node/esm --experimental-import-meta-resolve

import assert from 'node:assert';
import fs from 'node:fs/promises';
import url from 'node:url';

import ethers from 'ethers';

assert(import.meta.resolve);

const tokenListPath = url.fileURLToPath(await import.meta.resolve('../fixtures/1inch.json'));
const tokenList = JSON.parse((await fs.readFile(tokenListPath)).toString('utf-8'));
// import tokenList from '../fixtures/1inch.json';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  assert(value, `No value provided for required environment variable ${key}.`);
  return value;
};

const apiKey = requireEnv('LM_ETHERSCAN_API_KEY');
const walletAddress = requireEnv('LM_ETHEREUM_WALLET_ADDRESS');

const provider = ethers.providers.getDefaultProvider('homestead', {
  etherscan: apiKey,
  // TODO: Get these other keys for redundancy and performance
  // infura: YOUR_INFURA_PROJECT_ID,
  // Or if using a project secret:
  // infura: {
  //   projectId: YOUR_INFURA_PROJECT_ID,
  //   projectSecret: YOUR_INFURA_PROJECT_SECRET,
  // },
  // alchemy: YOUR_ALCHEMY_API_KEY,
  // pocket: YOUR_POCKET_APPLICATION_KEY
  // Or if using an application secret key:
  // pocket: {
  //   applicationId: ,
  //   applicationSecretKey:
  // }
});
const weiBalance = await provider.getBalance(walletAddress);
const ethBalance = ethers.utils.formatEther(weiBalance);

console.log(`ETH: ${ethBalance}`);

const abi = [
  // Stub the ERC-20 token ABI with the only method we care about here,
  // 'balanceOf'.
  'function balanceOf(address owner) view returns (uint256)',
];

for (const token of tokenList.tokens) {
  const tokenContract = new ethers.Contract(token.address, abi, provider);
  const tokenBalance = await tokenContract.balanceOf(walletAddress);
  if (tokenBalance > 1e-4) {
    console.log(`${token.symbol}: ${ethers.utils.formatEther(tokenBalance)}`);
  }
}
