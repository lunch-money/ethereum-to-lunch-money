import { assert } from 'chai';
import sinon from 'sinon';

import { EthereumWalletClient, LunchMoneyEthereumWalletConnection as underTest } from '../src/main.js';

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
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 1000, // USDC
          '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2': 10, // MKR
          '0xa1d65E8fB6e87b60FECCBc582F7f97804B725521': 10000, // DXD
        });

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.strictEqual(response.providerName, 'wallet_ethereum');
        assert.sameDeepMembers(response.balances, [
          { asset: 'USDC', amount: '0.000000000000001' },
          { asset: 'DXD', amount: '0.00000000000001' },
        ]);
      });
    });
  });
});
