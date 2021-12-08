#!/usr/bin/env node --experimental-json-modules --loader ts-node/esm

import assert from 'node:assert';
import { encode } from 'node:querystring';
import EventSource from 'eventsource';

import { CryptoBalance } from '../src/types.js';

const ZAPPER_FI_API_URL = 'https://api.zapper.fi/v1/balances';
// This API key is public and shared with all users. This API is publicly
// available, free of charge. See here for details:
// https://docs.zapper.fi/zapper-api/endpoints
const ZAPPER_FI_API_KEY = '96e0cc51-a62e-42ca-acee-910ea7d2a241';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  assert(value, `No value provided for required environment variable ${key}.`);
  return value;
};

const ETH_ADDRESS = requireEnv('ETH_ADDRESS');
const ETH_ADDRESS_INDEX = ETH_ADDRESS.toLowerCase();

const qs = encode({
  'addresses[]': ETH_ADDRESS,
  api_key: ZAPPER_FI_API_KEY,
});

const url = ZAPPER_FI_API_URL + '?' + qs;

const es = new EventSource(url);

const hasAnyNonZeroBalances = (balanceData: any) => balanceData.balances[ETH_ADDRESS_INDEX].products.length > 0;

let allBalances: CryptoBalance[] = [];

es.addEventListener('balance', (ev) => {
  const data = JSON.parse(ev.data);
  if (hasAnyNonZeroBalances(data)) {
    const p = data.balances[ETH_ADDRESS_INDEX].products;

    const balances: CryptoBalance[] = p.flatMap((p: any) =>
      p.assets.flatMap((a: any) =>
        a.tokens.map((t: any) => ({
          asset: t.symbol,
          amount: t.balance.toString(),
          amountInUSD: t.balanceUSD.toString(),
        })),
      ),
    );

    allBalances = allBalances.concat(balances);
  }
});

es.addEventListener('end', () => {
  console.log('Finished stream. Closing connection.');
  console.log(allBalances.sort((a, b) => parseFloat(a.amountInUSD) - parseFloat(b.amountInUSD)));
  es.close();
});
