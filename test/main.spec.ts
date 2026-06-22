import { assert } from 'chai';
import sinon from 'sinon';
import { AbstractProvider } from 'ethers';

import { createEthereumWalletClient, EtherscanProvider } from '../src/client.js';

enum chainIds {
  'mainnet' = 1,
  'base' = 8453,
}

const TEST_WALLET = '0x0000000000000000000000000000000000000001';
const NEGLIGIBLE_BALANCE_THRESHOLD = 100;

const makeProvider = (weiBalance: bigint, chainId: bigint) =>
  ({
    getBalance: sinon.stub().resolves(weiBalance),
    getNetwork: sinon.stub().resolves({ chainId }),
    call: sinon.stub().resolves('0x'),
  }) as unknown as AbstractProvider;

const makeServiceProviderInfo = (provider: AbstractProvider) => [
  {
    type: 'Service Provider' as const,
    name: 'Test',
    status: 'SUCCESS' as const,
    provider,
  },
];

describe('createEthereumWalletClient', () => {
  describe('getBalances', () => {
    describe('when the wallet has an ETH amount less than the negligible balance threshold', () => {
      it('does not output the ETH balance amount', async () => {
        const getTokensBalance = sinon.stub().resolves({});
        const client = createEthereumWalletClient(
          makeServiceProviderInfo(makeProvider(BigInt(50), BigInt(chainIds.mainnet))),
          [],
          getTokensBalance,
        );

        const response = await client.getBalances(TEST_WALLET, NEGLIGIBLE_BALANCE_THRESHOLD);

        assert.deepEqual(response, { providerName: 'wallet_ethereum', balances: [] });
      });
    });

    describe('when the wallet has an ETH amount more than the negligible balance threshold', () => {
      it('outputs the ETH balance amount', async () => {
        const getTokensBalance = sinon.stub().resolves({});
        const client = createEthereumWalletClient(
          makeServiceProviderInfo(makeProvider(BigInt(1000), BigInt(chainIds.mainnet))),
          [],
          getTokensBalance,
        );

        const response = await client.getBalances(TEST_WALLET, NEGLIGIBLE_BALANCE_THRESHOLD);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [{ asset: 'ETH', amount: '0.000000000000001' }],
        });
      });
    });

    describe('when the wallet contains no tokens', () => {
      it('outputs nothing', async () => {
        const getTokensBalance = sinon.stub().resolves({});
        const client = createEthereumWalletClient(
          makeServiceProviderInfo(makeProvider(BigInt(0), BigInt(chainIds.mainnet))),
          [],
          getTokensBalance,
        );

        const response = await client.getBalances(TEST_WALLET, NEGLIGIBLE_BALANCE_THRESHOLD);

        assert.deepEqual(response, { providerName: 'wallet_ethereum', balances: [] });
      });
    });

    describe('with respect to chains', () => {
      it('should support chains outside of mainnet', async () => {
        const getTokensBalance = sinon.stub().resolves({});
        const client = createEthereumWalletClient(
          makeServiceProviderInfo(makeProvider(BigInt(1000), BigInt(chainIds.base))),
          [],
          getTokensBalance,
        );

        const response = await client.getBalances(TEST_WALLET, NEGLIGIBLE_BALANCE_THRESHOLD);

        assert.deepEqual(response, {
          providerName: 'wallet_ethereum',
          balances: [{ asset: 'ETH', amount: '0.000000000000001' }],
        });
      });

      it('should throw an error if a returned token is not on the chain specified', async () => {
        const getTokensBalance = sinon.stub().resolves({
          '0x3c3a81e81dc49a522a592e7622a7e711c06bf354': BigInt(1000), // MNT — mainnet only, not on Base
        });
        const client = createEthereumWalletClient(
          makeServiceProviderInfo(makeProvider(BigInt(50), BigInt(chainIds.base))),
          [],
          getTokensBalance,
        );

        try {
          await client.getBalances(TEST_WALLET, NEGLIGIBLE_BALANCE_THRESHOLD);
          assert.fail('Expected error was not thrown');
        } catch (error) {
          assert.instanceOf(error, Error);
          assert.match((error as Error).message, /Token 0x3c3a81e81dc49a522a592e7622a7e711c06bf354 not found/);
        }
      });
    });

    describe('when the wallet contains tokens', () => {
      it('outputs the tokens which have balances above the negligible balance threshold', async () => {
        const getTokensBalance = sinon.stub().resolves({
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': BigInt(100), // USDC — 6 decimals
          '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': BigInt(100), // MKR — 18 decimals (below threshold)
          '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': BigInt(100), // WBTC — 8 decimals
        });
        const client = createEthereumWalletClient(
          makeServiceProviderInfo(makeProvider(BigInt(50), BigInt(chainIds.mainnet))),
          [],
          getTokensBalance,
        );

        const response = await client.getBalances(TEST_WALLET, NEGLIGIBLE_BALANCE_THRESHOLD);

        assert.strictEqual(response.providerName, 'wallet_ethereum');
        assert.sameDeepMembers(response.balances, [
          { asset: 'USDC', amount: '0.0001' },
          { asset: 'WBTC', amount: '0.000001' },
        ]);
      });
    });
  });
});

describe('EtherscanProvider', () => {
  const makePage = (count: number, prefix = '0xtoken') =>
    Array.from({ length: count }, (_, i) => ({ contractAddress: `${prefix}${i}` }));

  const makeResponse = (result: object[], status = '1', message = 'OK') =>
    Promise.resolve({ json: () => Promise.resolve({ status, message, result }) });

  afterEach(() => sinon.restore());

  describe('discoverTokensForWallet', () => {
    it('returns an empty array when there are no transactions', async () => {
      const mockFetch = sinon.stub().returns(makeResponse([], '0', 'No transactions found'));
      const provider = new EtherscanProvider('test-key', mockFetch);

      const tokens = await provider.discoverTokensForWallet('0xwallet');

      assert.equal(mockFetch.callCount, 1);
      assert.deepEqual(tokens, []);
    });

    it('returns unique token addresses from a single page', async () => {
      const result = [
        { contractAddress: '0xaaa' },
        { contractAddress: '0xbbb' },
        { contractAddress: '0xaaa' }, // duplicate
      ];
      const mockFetch = sinon.stub().returns(makeResponse(result));
      const provider = new EtherscanProvider('test-key', mockFetch);

      const tokens = await provider.discoverTokensForWallet('0xwallet');

      assert.equal(mockFetch.callCount, 1);
      assert.sameMembers(tokens, ['0xaaa', '0xbbb']);
    });

    it('paginates when a full page is returned', async () => {
      const mockFetch = sinon.stub();
      mockFetch.onFirstCall().returns(makeResponse(makePage(1000)));
      mockFetch.onSecondCall().returns(makeResponse(makePage(3, '0xpage2token')));
      const provider = new EtherscanProvider('test-key', mockFetch);

      const tokens = await provider.discoverTokensForWallet('0xwallet');

      assert.equal(mockFetch.callCount, 2);
      assert.equal(tokens.length, 1003);
      assert.include(tokens, '0xpage2token0');
    });

    it('stops paginating when a page returns fewer results than the page size', async () => {
      const mockFetch = sinon.stub();
      mockFetch.onFirstCall().returns(makeResponse(makePage(1000)));
      mockFetch.onSecondCall().returns(makeResponse(makePage(1000, '0xp2')));
      mockFetch.onThirdCall().returns(makeResponse(makePage(42, '0xp3')));
      const provider = new EtherscanProvider('test-key', mockFetch);

      const tokens = await provider.discoverTokensForWallet('0xwallet');

      assert.equal(mockFetch.callCount, 3);
      assert.equal(tokens.length, 2042);
    });

    it('throws on a NOTOK API error', async () => {
      const mockFetch = sinon.stub().returns(makeResponse([], '0', 'NOTOK'));
      const provider = new EtherscanProvider('test-key', mockFetch);

      try {
        await provider.discoverTokensForWallet('0xwallet');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert.instanceOf(error, Error);
        assert.match((error as Error).message, /Etherscan V2 API error/);
      }
    });
  });
});
