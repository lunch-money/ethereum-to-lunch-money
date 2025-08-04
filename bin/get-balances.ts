#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { LunchMoneyEthereumWalletConnection, createEthereumWalletClient } from '../dist/cjs/src/main.js';
import { EthereumWalletClient } from '../dist/cjs/src/client.js';
import EthereumInitializationService, { EthereumIntegrationType, INTEGRATIONS } from '../dist/cjs/src/ethereum_init.js';
import { ethers } from 'ethers';

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

const INTEGRATIONS = {
  ethereum: {
    client: LunchMoneyEthereumWalletConnection,
    authKeys: ['walletAddress'],
    primaryProvider: null,
    primaryProviderName: null,
    secondaryProvider: null,
    secondaryProviderName: null,
    initialized: false,
    debugEnabled: false,
    blockchainNetwork: 'mainnet',
    primaryWalletClient: null,
    secondaryWalletClient: null,
    walletAPIKeys: {},
  } as unknown as EthereumIntegrationType,
} as INTEGRATIONS;

function logDebug(message: string) {
  if (process.env.DEBUG_ETHEREUM) {
    console.log('[DEBUG_ETHEREUM]', message);
  }
}

(async () => {
  try {
    const startTime = Date.now();
    const walletAddress = getWalletAddress();

    // Set the Ethereum public provider immediately
    const publicProvider = ethers.getDefaultProvider();
    INTEGRATIONS.ethereum.primaryProvider = publicProvider;
    INTEGRATIONS.ethereum.primaryProviderName = 'Public Provider';
    INTEGRATIONS.ethereum.primaryWalletClient = createEthereumWalletClient(publicProvider);
    logDebug('Ethereum initialized with public provider');

    // Initialize the Ethereum init service to see if any other providers are available
    const ethereumInitService = new EthereumInitializationService(INTEGRATIONS, logDebug);
    const ethereumIntegration = await ethereumInitService.initialize();
    INTEGRATIONS.ethereum = ethereumIntegration as EthereumIntegrationType;

    // if (process.env.DEBUG_ETHEREUM) {
    //   console.log('[DEBUG_ETHEREUM] Testing Ethereum provider keys...');
    //   const results = await testEthereumProviderKeys(walletAddress);
    //   console.log('[DEBUG_ETHEREUM] Provider test results:', results);

    //   // Check if any provider failed
    //   const failedProviders = results.filter((result) => result.status === 'FAILED');
    //   if (failedProviders.length > 0) {
    //     const errorMessage = `Provider validation failed: ${failedProviders.map((p) => `${p.provider}: ${p.error}`).join(', ')}`;
    //     console.error('[DEBUG_ETHEREUM]', errorMessage);
    //     if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
    //       console.error('[DEBUG_ETHEREUM] DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true.  Exiting...');
    //       process.exit(1);
    //     } else {
    //       console.log('[DEBUG_ETHEREUM] Will attempt to continue with the provided keys');
    //     }
    //   } else {
    //     console.log('[DEBUG_ETHEREUM] All provider keys validated successfully!');
    //   }
    // }

    // const provider = getEthereumProvider();
    // let client = createEthereumWalletClient(provider);

    let triedSecondaryProvider = false;
    let client = INTEGRATIONS.ethereum.primaryWalletClient;
    let resp: { balances?: Array<{ asset: string; amount: string }> } = {};
    while (!resp.balances) {
      try {
        resp = await LunchMoneyEthereumWalletConnection.getBalances(
          {
            walletAddress,
          },
          { client: client as EthereumWalletClient },
        );
      } catch (error) {
        if (INTEGRATIONS.ethereum.secondaryProvider && !triedSecondaryProvider) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(
            `[DEBUG_ETHEREUM] getBalances request using ${INTEGRATIONS.ethereum.primaryProviderName} failed: ${errorMessage}.`,
          );
          console.log(
            `[DEBUG_ETHEREUM] Will retry using ${INTEGRATIONS.ethereum.secondaryProviderName} as the secondary Ethereum Provider`,
          );
          client = INTEGRATIONS.ethereum.secondaryWalletClient as EthereumWalletClient;
          triedSecondaryProvider = true;
        } else {
          throw error;
        }
      }
    }

    const duration = Date.now() - startTime;

    logDebug(`Balance fetch completed in ${duration}ms`);

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

      logDebug(`Error details: ${errorMessage} ${errorName} ${errorStack}`);

      // Check for common Etherscan API issues
      if (errorMessage.includes('Invalid API Key') || errorMessage.includes('403')) {
        logDebug('This appears to be an API key issue (Alchemy or Etherscan)');
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        logDebug('This appears to be a rate limiting issue (Alchemy or Etherscan)');
      }
    }

    process.exit(1);
  }
})();
