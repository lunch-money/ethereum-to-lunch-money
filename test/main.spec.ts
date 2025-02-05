import { assert } from 'chai';
import sinon from 'sinon';

import { LunchMoneyEthereumWalletConnection as underTest } from '../src/main.js';

enum chainIds {
  'mainnet' = 1,
  'base' = 8453,
}

describe('LunchMoneyEthereumWalletConnection', () => {
  const dummyConfig = {
    walletAddress: '0xfoo',
    negligibleBalanceThreshold: 100,
  };

  const mockClient = {
    getChainId: sinon.stub(),
    getWeiBalance: sinon.stub(),
    getTokensBalance: sinon.stub(),
  };
  const dummyContext = {
    client: mockClient,
  };

  describe('getBalances', () => {
    describe('when the wallet has an ETH amount less than the negligible balance threshold', () => {
      it('does not output the ETH balance amount', async () => {
        mockClient.getChainId.resolves(chainIds.mainnet);
        mockClient.getWeiBalance.resolves(50);
        mockClient.getTokensBalance.resolves({});

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [],
        });
      });
    });

    describe('when the wallet has an ETH amount more than the negligible balance threshold', () => {
      it('outputs the ETH balance amount', async () => {
        mockClient.getChainId.resolves(chainIds.mainnet);
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
        mockClient.getChainId.resolves(chainIds.mainnet);
        mockClient.getWeiBalance.resolves(0);
        mockClient.getTokensBalance.resolves({});

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [],
        });
      });
    });

    describe('with respect to chains', () => {
      it('should support chains outside of mainnet', async () => {
        mockClient.getChainId.resolves(chainIds.base); // Base Chain
        mockClient.getWeiBalance.resolves(50);
        mockClient.getTokensBalance.resolves({
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 1000, // ETH on Base
        });

        const response = await underTest.getBalances(dummyConfig, dummyContext);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [{ asset: 'ETH', amount: '0.000000000000001' }],
        });
      });

      it('should throw an error if a returned token is not on the chain specified', async () => {
        mockClient.getChainId.resolves(chainIds.base);
        mockClient.getWeiBalance.resolves(50);
        mockClient.getTokensBalance.resolves({
          '0x3c3a81e81dc49a522a592e7622a7e711c06bf354': 1000, // MNT on mainnet
        });

        // Expect an error to be thrown
        const errorNotThownMessage = 'Expected error was not thrown';
        try {
          await underTest.getBalances(dummyConfig, dummyContext);
          assert.fail(errorNotThownMessage); // Fail the test if no error is thrown
        } catch (error) {
          assert.instanceOf(error, Error);
          if (errorNotThownMessage === error.message) {
            assert.fail(errorNotThownMessage);
          }
          assert.equal(
            error.message,
            'Token 0x3c3a81e81dc49a522a592e7622a7e711c06bf354 not found in filtered token list for chainId 8453',
          );
        }
      });
    });

    describe('when the wallet contains tokens', () => {
      it('outputs the tokens which have balances above the negligible balance threshold', async () => {
        mockClient.getChainId.resolves(chainIds.mainnet);
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
