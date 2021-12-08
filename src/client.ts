import EventSource from 'eventsource';
import { encode } from 'querystring';

const ZAPPER_FI_API_URL = 'https://api.zapper.fi/v1/balances';
// This API key is public and shared with all users. This API is publicly
// available, free of charge. See here for details:
// https://docs.zapper.fi/zapper-api/endpoints
const ZAPPER_FI_API_KEY = '96e0cc51-a62e-42ca-acee-910ea7d2a241';

export interface ZapperAPIClient {
  getTokenBalances(walletAddresses: string[]): Promise<ZapperTokenBalancesResponse[]>;
}

export const createZapperAPIClient = (): ZapperAPIClient => ({
  async getTokenBalances(walletAddresses) {
    const qs = encode({
      'addresses[]': walletAddresses.join(','),
      api_key: ZAPPER_FI_API_KEY,
    });

    const es = new EventSource(ZAPPER_FI_API_URL + '?' + qs);

    let balances: ZapperTokenBalancesResponse[] = [];

    es.addEventListener('balance', (ev) => {
      const data: ZapperTokenBalancesResponse = JSON.parse(ev.data);
      balances = balances.concat(data);
    });

    return new Promise((resolve, reject) => {
      es.addEventListener('end', () => {
        es.close();
        resolve(balances);
      });

      es.addEventListener('error', (ev) => {
        es.close();
        reject(ev);
      });
    });
  },
});

interface ZapperTokenBalancesResponse {
  network: string;
  appId: string;
  balances: Record<string, ZapperBalance>;
}

interface ZapperBalance {
  products: ZapperProduct[];
  meta: ZapperMeta;
}

interface ZapperMeta {
  label: string;
  value: number;
  type: string;
}

interface ZapperProduct {
  label: string;
  assets: ZapperAsset[];
}

interface ZapperAsset {
  type: string;
  balanceUSD: number;
  tokens: ZapperToken[];
}

interface ZapperToken {
  type: string;
  network: string;
  address: string;
  decimals: number;
  symbol: string;
  price: number;
  hide: boolean;
  balance: number;
  balanceRaw: string;
  balanceUSD: number;
}
