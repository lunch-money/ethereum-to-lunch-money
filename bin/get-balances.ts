#!/usr/bin/env node --experimental-json-modules --loader ts-node/esm

import assert from 'node:assert';

import { LunchMoneyEthereumWalletConnection, createZapperAPIClient } from '../src/main.js';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  assert(value, `No value provided for required environment variable ${key}.`);
  return value;
};

const ETH_ADDRESS = requireEnv('ETH_ADDRESS');

(async function () {
  console.log(
    await LunchMoneyEthereumWalletConnection.getBalances(
      {
        walletAddress: ETH_ADDRESS,
      },
      { client: createZapperAPIClient() },
    ),
  );
})();
