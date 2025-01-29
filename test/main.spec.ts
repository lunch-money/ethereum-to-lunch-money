import { assert } from 'chai';
import sinon from 'sinon';

import { LunchMoneyEthereumWalletConnection as underTest } from '../src/main.js';

describe('LunchMoneyEthereumWalletConnection', () => {
  const dummyConfig = {
    walletAddress: '0xfoo',
    negligibleBalanceThreshold: 100,
  };

  const mockClient = {
    getWeiBalance: sinon.stub(),
    getTokensBalance: sinon.stub(),
  };
  const dummyContext = {
    client: mockClient,
  };

  describe('getBalances', () => {
    describe('when the wallet has an ETH amount less than the neglible balance threshold', () => {
      it('does not output the ETH balance amount', async () => {
        mockClient.getWeiBalance.resolves(50);
        mockClient.getTokensBalance.resolves({});

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [],
        });
      });
    });

    describe('when the wallet has an ETH amount more than the neglible balance threshold', () => {
      it('outputs the ETH balance amount', async () => {
        mockClient.getWeiBalance.resolves(1000);
        mockClient.getTokensBalance.resolves({});

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [{ asset: 'ETH', amount: '0.000000000000001' }],
        });
      });
    });

    describe('when the wallet contains no tokens', () => {
      it('outputs nothing', async () => {
        mockClient.getWeiBalance.resolves(0);
        mockClient.getTokensBalance.resolves({});

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [],
        });
      });
    });

    describe('when the wallet contains tokens', () => {
      it('outputs the tokens which have balances above the negligible balance threshold', async () => {
        mockClient.getWeiBalance.resolves(50);
        mockClient.getTokensBalance.resolves({
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 100, // USDC which has 6 decimals
          '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': 100, // MKR which has 18 decimals
          '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 100, // WBTC which has 8 decimals
        });

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.strictEqual(response.providerName, 'wallet_ethereum');
        assert.sameDeepMembers(response.balances, [
          { asset: 'USDC', amount: '0.0001' },
          { asset: 'WBTC', amount: '0.000001' },
        ]);
      });
    });
  });
});
