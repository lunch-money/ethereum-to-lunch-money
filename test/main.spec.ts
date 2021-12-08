import { assert } from 'chai';
import sinon from 'sinon';

import { LunchMoneyEthereumWalletConnection as underTest } from '../src/main.js';
import { ZapperTokenBalancesResponse } from '../src/client.js';

describe('LunchMoneyEthereumWalletConnection', () => {
  const dummyConfig = {
    walletAddress: '0xfoo',
    negligibleBalanceThreshold: 100,
  };

  const mockClient = {
    getTokenBalances: sinon.stub<[], Promise<ZapperTokenBalancesResponse[]>>(),
  };
  const dummyContext = {
    client: mockClient,
  };

  const makeBalances = (balances: { asset: string; amountInUSD: number; amount: number }[]) => [
    {
      network: 'ethereum',
      appId: 'tokens',
      balances: {
        [dummyConfig.walletAddress]: {
          meta: [],
          products: [
            {
              label: 'Tokens',
              assets: [
                {
                  balanceUSD: 0,
                  type: 'tokens',
                  tokens: balances.map((t) => ({
                    address: '0xbar',
                    type: 'token',
                    balanceUSD: t.amountInUSD,
                    balance: t.amount,
                    balanceRaw: '',
                    decimals: 9,
                    hide: false,
                    network: 'ethereum',
                    price: 1337,
                    symbol: t.asset,
                  })),
                },
              ],
            },
          ],
        },
      },
    },
  ];

  describe('getBalances', () => {
    describe('when the wallet has an ETH amount less than the neglible balance threshold', () => {
      it('does not output the ETH balance amount', async () => {
        mockClient.getTokenBalances.resolves(makeBalances([{ asset: 'ETH', amount: 0, amountInUSD: 0 }]));

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [],
        });
      });
    });

    describe('when the wallet has an ETH amount more than the neglible balance threshold', () => {
      it('outputs the ETH balance amount', async () => {
        mockClient.getTokenBalances.resolves(makeBalances([{ asset: 'ETH', amount: 1, amountInUSD: 150 }]));

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [{ asset: 'ETH', amount: '1', amountInUSD: '150' }],
        });
      });
    });

    describe('when the wallet contains no tokens', () => {
      it('outputs nothing', async () => {
        mockClient.getTokenBalances.resolves([]);

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [],
        });
      });
    });

    describe('when the wallet contains tokens', () => {
      it('outputs the tokens which have balances above the negligible balance threshold', async () => {
        mockClient.getTokenBalances.resolves(
          makeBalances([
            { asset: 'ETH', amount: 0, amountInUSD: 200 },
            { asset: 'USDC', amount: 0, amountInUSD: 300 },
            { asset: 'WBTC', amount: 0, amountInUSD: 250 },
          ]),
        );

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.strictEqual(response.providerName, 'wallet_ethereum');
        assert.sameDeepMembers(response.balances, [
          { asset: 'ETH', amount: '0', amountInUSD: '200' },
          { asset: 'USDC', amount: '0', amountInUSD: '300' },
          { asset: 'WBTC', amount: '0', amountInUSD: '250' },
        ]);
      });
    });
  });
});
