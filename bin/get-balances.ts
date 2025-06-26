#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { LunchMoneyEthereumWalletConnection, createEthereumWalletClient } from '../dist/cjs/src/main.js';
import * as ethers from 'ethers';

function getWalletAddress() {
  // Use WETH contract address for testing - it's a well-known contract
  let walletAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  if (process.env.LM_ETHEREUM_WALLET_ADDRESS) {
    console.log(
      'Using wallet address from environment variable LM_ETHEREUM_WALLET_ADDRESS',
      process.env.LM_ETHEREUM_WALLET_ADDRESS,
    );
    walletAddress = process.env.LM_ETHEREUM_WALLET_ADDRESS;
  } else {
    console.log('Using a default, well known wallet address for testing');
    console.log('Set LM_ETHEREUM_WALLET_ADDRESS to use a different wallet address');
  }
  return walletAddress;
}

const BLOCKCHAIN_NETWORK = 'mainnet';

const INTEGRATIONS = {
  ethereum: {
    primaryProvider: null as ethers.AbstractProvider | null,
    secondaryProvider: null as ethers.AbstractProvider | null,
  },
};

function getEthereumProvider() {
  // Create Ethereum Wallet Client.
  // Setting a single private API key will generally speed up the requests
  // Setting multiple private API keys will generally slow down request but provide a quorum of responses.
  // See - https://docs.ethers.org/v5/api-keys/

  INTEGRATIONS.ethereum.primaryProvider = null;
  INTEGRATIONS.ethereum.secondaryProvider = null;

  // Alchemy is the recommended service node.
  // It is has the most generous free tier and is quick and reliable
  if (process.env.ALCHEMY_API_KEY) {
    if (process.env.DEBUG_ETHEREUM) {
      console.log('[DEBUG_ETHEREUM] Using Alchemy as the primary Ethereum provider');
    }
    INTEGRATIONS.ethereum.primaryProvider = new ethers.AlchemyProvider(BLOCKCHAIN_NETWORK, process.env.ALCHEMY_API_KEY);
  }
  // Infura was acquired by METAMASK who now provides an API key instead of a project ID and secret
  // https://developer.metamask.io/
  if (process.env.INFURA_API_KEY) {
    if (!INTEGRATIONS.ethereum.primaryProvider) {
      if (process.env.DEBUG_ETHEREUM) {
        console.log('[DEBUG_ETHEREUM] Using Infura as the primary Ethereum provider');
      }
      INTEGRATIONS.ethereum.primaryProvider = new ethers.InfuraProvider(BLOCKCHAIN_NETWORK, process.env.INFURA_API_KEY);
    } else {
      if (process.env.DEBUG_ETHEREUM) {
        console.log('[DEBUG_ETHEREUM] Using Infura as the secondary Ethereum provider');
      }
      INTEGRATIONS.ethereum.secondaryProvider = new ethers.InfuraProvider(
        BLOCKCHAIN_NETWORK,
        process.env.INFURA_API_KEY,
      );
    }
  }

  // Warn if attempting to use legacy service nodes
  if (process.env.ETHERSCAN_API_KEY) {
    console.error('ETHERSCAN_API_KEY is no longer recommended as a service node. This key will be ignored.');
  }
  if (process.env.INFURA_PROJECT_ID && process.env.INFURA_PROJECT_SECRET) {
    console.error(
      'INFURA_PROJECT_ID and INFURA_PROJECT_SECRET are no longer recommended as a service node. These keys will be ignored.',
    );
  }
  if (process.env.POCKET_API_KEY) {
    console.error('POCKET_API_KEY is no longer recommended as a service node. It is not advised to set this variable.');
  }

  if (!INTEGRATIONS.ethereum.primaryProvider) {
    if (process.env.DEBUG_ETHEREUM) {
      console.log('[DEBUG_ETHEREUM] No valid Ethereum providers found.  Using public network');
    }
    INTEGRATIONS.ethereum.primaryProvider = ethers.getDefaultProvider(BLOCKCHAIN_NETWORK, {});
  } else if (!INTEGRATIONS.ethereum.secondaryProvider) {
    INTEGRATIONS.ethereum.secondaryProvider = ethers.getDefaultProvider(BLOCKCHAIN_NETWORK, {});
  }

  return INTEGRATIONS.ethereum.primaryProvider;
}

async function testEthereumProviderKeys(walletAddress: string) {
  const results: {
    provider: string;
    status: string;
    network?: string;
    balance?: string;
    error?: string;
    apiStatus?: string;
  }[] = [];

  // Helper function to mask API keys for logging
  const maskKey = (key: string): string => {
    if (!key) return 'undefined';
    if (key.length <= 8) return '*'.repeat(key.length);
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  // Helper function to extract clean error messages
  const getCleanErrorMessage = (error: unknown): string => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Extract just the essential error information
    if (errorMessage.includes('401')) {
      return 'Authentication failed - invalid API key';
    } else if (errorMessage.includes('403')) {
      return 'Access forbidden - check API key permissions';
    } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return 'Rate limit exceeded - try again later';
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'Network connection error';
    } else if (errorMessage.includes('timeout')) {
      return 'Request timed out';
    } else {
      // For other errors, take just the first meaningful part
      const firstLine = errorMessage.split('\n')[0];
      // Remove verbose details and keep just the core message
      if (firstLine.includes('server response')) {
        const match = firstLine.match(/server response (\d+)/);
        if (match) {
          return `Server error ${match[1]}`;
        }
      }
      return firstLine;
    }
  };

  // Test Alchemy API Key
  if (process.env.ALCHEMY_API_KEY) {
    try {
      console.log('[DEBUG_ETHEREUM] Found an Alchemy API key.  Validating it');
      console.log('[DEBUG_ETHEREUM] Alchemy key (masked):', maskKey(process.env.ALCHEMY_API_KEY));
      console.log('[DEBUG_ETHEREUM] Alchemy key length:', process.env.ALCHEMY_API_KEY.length);

      // Validate API key format
      if (process.env.ALCHEMY_API_KEY.length < 20) {
        throw new Error(
          `API key seems too short (${process.env.ALCHEMY_API_KEY.length} chars). Alchemy keys are typically 32+ characters.`,
        );
      }

      // Test provider creation first
      let testProvider;
      try {
        testProvider = new ethers.AlchemyProvider(BLOCKCHAIN_NETWORK, process.env.ALCHEMY_API_KEY);
        console.log('[DEBUG_ETHEREUM] Alchemy provider created successfully');
      } catch (providerError) {
        const errorMessage = providerError instanceof Error ? providerError.message : String(providerError);
        console.error('[DEBUG_ETHEREUM] Failed to create Alchemy provider:', errorMessage);
        throw providerError;
      }

      // Test with getBalance which requires API key authentication
      const balance = await testProvider.getBalance(walletAddress);
      const network = await testProvider.getNetwork();

      // Also test with getCode to verify API key works
      const code = await testProvider.getCode(walletAddress);

      console.log(
        '[DEBUG_ETHEREUM] Alchemy API key test: SUCCESS - Network:',
        network.name,
        'Balance:',
        ethers.formatEther(balance),
        'ETH',
        'Code length:',
        code.length,
      );
      results.push({
        provider: 'Alchemy',
        status: 'SUCCESS',
        network: network.name,
        balance: ethers.formatEther(balance),
      });
    } catch (error) {
      const errorMessage = getCleanErrorMessage(error);
      console.error('[DEBUG_ETHEREUM] Alchemy API key test: FAILED -', errorMessage);
      if (errorMessage.includes('401')) {
        console.error('[DEBUG_ETHEREUM] 401 error suggests invalid API key or authentication issue');
      } else if (errorMessage.includes('rate limit')) {
        console.error('[DEBUG_ETHEREUM] Rate limit error - check your API key tier');
      } else if (errorMessage.includes('network')) {
        console.error('[DEBUG_ETHEREUM] Network error - check your internet connection');
      }
      results.push({
        provider: 'Alchemy',
        status: 'FAILED',
        error: errorMessage,
      });
    }
  }

  // Test Infura API Key
  if (process.env.INFURA_API_KEY) {
    try {
      console.log('[DEBUG_ETHEREUM] Found an Infura API Key.  Validating it');
      console.log('[DEBUG_ETHEREUM] Infura API Key (masked):', maskKey(process.env.INFURA_API_KEY));
      const testProvider = new ethers.InfuraProvider(BLOCKCHAIN_NETWORK, process.env.INFURA_API_KEY);
      // Test with getBalance which requires API key authentication
      const balance = await testProvider.getBalance(walletAddress);
      const network = await testProvider.getNetwork();
      console.log(
        '[DEBUG_ETHEREUM] Infura API Key test: SUCCESS - Network:',
        network.name,
        'Balance:',
        ethers.formatEther(balance),
        'ETH',
      );
      results.push({
        provider: 'Infura',
        status: 'SUCCESS',
        network: network.name,
        balance: ethers.formatEther(balance),
      });
    } catch (error) {
      const errorMessage = getCleanErrorMessage(error);
      console.error('[DEBUG_ETHEREUM] Infura API Key test: FAILED -', errorMessage);
      if (errorMessage.includes('401')) {
        console.error('[DEBUG_ETHEREUM] 401 error suggests invalid API Key or authentication issue');
      }
      results.push({
        provider: 'Infura',
        status: 'FAILED',
        error: errorMessage,
      });
    }
  }

  // Warn about Infura Project ID and Secret (legacy)
  if (process.env.INFURA_PROJECT_ID && process.env.INFURA_PROJECT_SECRET) {
    console.log('[DEBUG_ETHEREUM] Found an Infura API Project ID and Secret. Replace this with INFURA_API_KEY.');
    console.log(
      '[DEBUG_ETHEREUM] If DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true, this test will fail until this is fixed',
    );
    console.log('[DEBUG_ETHEREUM] Otherwise, these key will be ignored');
    results.push({
      provider: 'Infura',
      status: 'FAILED',
      error:
        'Infura Project ID and Secret are no longer recommended. Make sure to unset them and set INFURA_API_KEY instead.',
    });
  }

  // Test Etherscan API Key -- really just warn about it
  if (process.env.ETHERSCAN_API_KEY) {
    console.log('[DEBUG_ETHEREUM] Found an Etherscan API key. Etherscan is no longer recommended as a service node.');
    console.log('[DEBUG_ETHEREUM] This test will fail until this is fixed');
    console.log('[DEBUG_ETHEREUM] Etherscan key (masked):', maskKey(process.env.ETHERSCAN_API_KEY));
    results.push({
      provider: 'Etherscan',
      status: 'FAILED',
      error: 'Etherscan is no longer recommended. Make sure to unset ETHERSCAN_API_KEY environment variable.',
    });
  }

  // Test Pocket API Key -- really just warn about it
  if (process.env.POCKET_API_KEY) {
    console.log('[DEBUG_ETHEREUM] Found an Pocket API key. Pocket is no longer recommended as a service node.');
    console.log('[DEBUG_ETHEREUM] This test will fail until this is fixed');
    console.log('[DEBUG_ETHEREUM] Pocket key (masked):', maskKey(process.env.POCKET_API_KEY));
    results.push({
      provider: 'Pocket',
      status: 'FAILED',
      error: 'Pocket is no longer recommended. Make sure to unset POCKET_API_KEY environment variable.',
    });
  }

  // If no API keys are set, test public providers
  if (
    !process.env.ALCHEMY_API_KEY &&
    !process.env.INFURA_API_KEY &&
    !process.env.INFURA_PROJECT_ID &&
    !process.env.ETHERSCAN_API_KEY &&
    !process.env.POCKET_API_KEY
  ) {
    try {
      console.log('[DEBUG_ETHEREUM] No Provider API keys found.  Validating public providers');
      console.error('[DEBUG_ETHEREUM] This may work.  Sometimes. But its better to have at least one private API Key');
      const testProvider = ethers.getDefaultProvider('mainnet');
      // Test with getBalance which requires API key authentication
      const balance = await testProvider.getBalance(walletAddress);
      const network = await testProvider.getNetwork();
      console.log(
        '[DEBUG_ETHEREUM] Public providers test: SUCCESS - Network:',
        network.name,
        'Balance:',
        ethers.formatEther(balance),
        'ETH',
      );
      results.push({
        provider: 'Public Providers',
        status: 'SUCCESS',
        network: network.name,
        balance: ethers.formatEther(balance),
      });
    } catch (error) {
      const errorMessage = getCleanErrorMessage(error);
      console.error('[DEBUG_ETHEREUM] Public providers test: FAILED -', errorMessage);
      results.push({
        provider: 'Public Providers',
        status: 'FAILED',
        error: errorMessage,
      });
    }
  }

  return results;
}

(async () => {
  try {
    const startTime = Date.now();
    const walletAddress = getWalletAddress();

    if (process.env.DEBUG_ETHEREUM) {
      console.log('[DEBUG_ETHEREUM] Testing Ethereum provider keys...');
      const results = await testEthereumProviderKeys(walletAddress);
      console.log('[DEBUG_ETHEREUM] Provider test results:', results);

      // Check if any provider failed
      const failedProviders = results.filter((result) => result.status === 'FAILED');
      if (failedProviders.length > 0) {
        const errorMessage = `Provider validation failed: ${failedProviders.map((p) => `${p.provider}: ${p.error}`).join(', ')}`;
        console.error('[DEBUG_ETHEREUM]', errorMessage);
        process.exit(1);
      }

      console.log('[DEBUG_ETHEREUM] All provider keys validated successfully!');
    }

    const provider = getEthereumProvider();
    let client = createEthereumWalletClient(provider);
    let resp: { balances?: Array<{ asset: string; amount: string }> } = {};
    while (!resp.balances) {
      try {
        resp = await LunchMoneyEthereumWalletConnection.getBalances({ walletAddress }, { client });
      } catch (error) {
        if (INTEGRATIONS.ethereum.secondaryProvider) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`[DEBUG_ETHEREUM] getBalances request failed: ${errorMessage}.`);
          console.log('[DEBUG_ETHEREUM] Will retry using the secondary Ethereum Provider');
          client = createEthereumWalletClient(INTEGRATIONS.ethereum.secondaryProvider as ethers.AbstractProvider);
          // Don't retry if this also fails
          INTEGRATIONS.ethereum.secondaryProvider = null;
        } else {
          throw error;
        }
      }
    }

    const duration = Date.now() - startTime;

    if (process.env.DEBUG_ETHEREUM) {
      console.log(`[DEBUG_ETHEREUM] Balance fetch completed in ${duration}ms`);
    }

    for (const { asset, amount } of resp.balances) {
      console.log(`${asset}: ${amount}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error fetching balances:', error);

    // Add more detailed error information
    if (process.env.DEBUG_ETHEREUM) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';
      const errorStack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined;

      console.error('[DEBUG_ETHEREUM] Error details:', {
        message: errorMessage,
        name: errorName,
        stack: errorStack, // First 3 lines of stack
      });

      // Check for common Etherscan API issues
      if (errorMessage.includes('Invalid API Key') || errorMessage.includes('403')) {
        console.error('[DEBUG_ETHEREUM] This appears to be an API key issue (Alchemy or Etherscan)');
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        console.error('[DEBUG_ETHEREUM] This appears to be a rate limiting issue (Alchemy or Etherscan)');
      }
    }

    process.exit(1);
  }
})();
