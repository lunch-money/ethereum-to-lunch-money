#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();

import { LunchMoneyEthereumWalletConnection } from '../dist/cjs/src/main.js';
import { EthereumWalletClient } from '../src/client';
import EthereumInitializationService, { EthereumIntegrationType, INTEGRATIONS } from '../dist/cjs/src/ethereum_init.js';

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
    blockchainNetwork: 'mainnet',
    debugEnabled: process.env.DEBUG_ETHEREUM || false,
    // The remaining properties are updated by the EthereumInitializationService
    client: LunchMoneyEthereumWalletConnection,
    walletClient: null,
    initialized: false,
    serviceProviderInfo: [],
    walletProviderInfo: [],
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

    // Initialize Ethereum validating any providedAPI keys
    const ethereumInitService = new EthereumInitializationService(INTEGRATIONS, logDebug);
    await ethereumInitService.initialize();
    const client = INTEGRATIONS.ethereum.walletClient;
    const resp = await LunchMoneyEthereumWalletConnection.getBalances(
      {
        walletAddress,
      },
      { client: client as EthereumWalletClient },
    );

    const duration = Date.now() - startTime;

    logDebug(`Balance fetch completed in ${duration}ms`);

    if (resp.balances.length === 0) {
      console.log('No balances found');
    } else {
      for (const { asset, amount } of resp.balances) {
        console.log(`${asset}: ${amount}`);
      }
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
