#!/usr/bin/env node --loader ts-node/esm --experimental-import-meta-resolve

import assert from 'node:assert';

import ethers from 'ethers';

import { loadTokenBalances, loadTokenList } from '../src/client.js';

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

const tokenList = await loadTokenList();
const resp = await loadTokenBalances(walletAddress, tokenList, provider);

for (const { asset, amount } of resp.balances) {
  console.log(`${asset}: ${amount}`);
}
