import { ethers, AbstractProvider } from 'ethers';
import type { ProviderInfo, EthereumWalletClient } from './client.js';
import { createEthereumWalletClient } from './client';
import fetch, { Response } from 'node-fetch';

export interface EthereumIntegrationType {
  initialized: boolean;
  walletClient: EthereumWalletClient;
  serviceProviderInfo: ProviderInfo[];
  walletProviderInfo: ProviderInfo[];
  [key: string]: unknown; // Allow additional properties
}

export interface INTEGRATIONS {
  ethereum: EthereumIntegrationType;
  [key: string]: unknown; // Allow additional properties
}

interface ApiKeyTestInfo {
  url: string;
  headers?: Record<string, string>;
  responseHandler: (response: Response) => Promise<ProviderInfo>;
  provider: string;
}

// Helper function to wrap promises around provider tests
const wrapPromise = (promise: Promise<ProviderInfo>) =>
  promise.then(
    (result) => result,
    (error) => error,
  );

class EthereumInitializationService {
  private initialized: boolean = false;
  private ethereumIntegration: EthereumIntegrationType;

  constructor(
    private integrations: INTEGRATIONS,
    private logDebug: (message: string) => void,
  ) {
    this.logDebug = logDebug.bind(this);
    this.handleError = this.handleError.bind(this);
    // TODO: this could us a little more error handling
    integrations.ethereum.initialized = false;
    this.ethereumIntegration = integrations.ethereum;
  }

  async initialize(): Promise<EthereumIntegrationType> {
    if (this.initialized) {
      return this.ethereumIntegration;
    }

    try {
      await this.validateAPIKeys();
      if (this.ethereumIntegration.serviceProviderInfo.length > 0) {
        // Yay, we got a valid Service Provider Key!
        this.ethereumIntegration.walletClient = createEthereumWalletClient(
          this.ethereumIntegration.serviceProviderInfo,
          this.ethereumIntegration.walletProviderInfo,
        );
        this.logDebug('Ethereum initialized with supplied provider(s)');
      } else {
        this.ethereumIntegration.walletClient = createEthereumWalletClient();
        this.logDebug('Ethereum initialized with public provider(s)');
      }
      this.initialized = true;
      this.ethereumIntegration.initialized = true;
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`Unexpected error in Ethereum initialization: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    return this.ethereumIntegration;
  }

  private async validateAPIKeys(): Promise<void> {
    try {
      this.warnAboutLegacyKeys();

      this.logDebug('Starting background testing of private providers and API keys');
      // This is a well known test Ethereum wallet address
      const testAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      const missingKeyResults = [];
      let wrappedProviderPromises: Promise<ProviderInfo>[] = [];

      // Prepare private provider tests
      const privateProviders = this.getPrivateProviders();
      if (privateProviders.length === 0) {
        this.logDebug('No Ethereum service provider keys (ALCHEMY_API_KEY or INFURA_API_KEY) are set.');
        missingKeyResults.push({
          type: 'Service Provider',
          name: 'Ethereum Service Providers',
          status: 'FAILED',
          error: 'Missing required Ethereum service provider keys (ALCHEMY_API_KEY or INFURA_API_KEY)',
        });
      } else {
        wrappedProviderPromises = privateProviders.map((provider) =>
          wrapPromise(this.testProvider(provider, testAddress)),
        );
      }

      //Prepare API Key Tests
      let wrappedApiKeyPromises: Promise<ProviderInfo>[] = [];
      const apiKeys = this.getWalletTokenApiKeyTestInfo(testAddress);
      if (apiKeys.length === 0) {
        missingKeyResults.push({
          type: 'API Provider',
          name: 'API Keys',
          status: 'FAILED',
          error: 'Missing required wallet token API keys (ETHERSCAN_API_KEY or MORALIS_API_KEY)',
        });
      } else {
        wrappedApiKeyPromises = apiKeys.map((apiKeyTestInfo) => wrapPromise(this.testApiKey(apiKeyTestInfo)));
      }

      // Wrap any existing results in a promise
      const missingKeyResultsPromise = Promise.resolve(missingKeyResults);

      // Run all tests in parallel, including the results
      const allResults = await Promise.all([
        ...(await missingKeyResultsPromise),
        ...wrappedProviderPromises,
        ...wrappedApiKeyPromises,
      ]);

      this.processResults(allResults as ProviderInfo[]);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`Unexpected error in Ethereum initialization: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  private processResults(allResults: ProviderInfo[]) {
    // Process Provider results
    const successfulProviders = allResults.filter(
      (result) => result.status === 'SUCCESS' && result.type === 'Service Provider',
    );
    const failedProviders = allResults.filter((result) => result.status === 'FAILED');

    if (successfulProviders.length > 0) {
      this.ethereumIntegration.serviceProviderInfo = successfulProviders;
      if (failedProviders.length > 0) {
        this.logDebug(
          `Secondary provider validation failed: ${failedProviders.map((p) => `${p.name}: ${p.error}`).join(', ')}`,
        );
        if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
          this.logDebug('DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true. Exiting...');
          process.exit(1);
        } else {
          const primaryProvider = this.integrations.ethereum.serviceProviderInfo[0];
          this.logDebug(`Continuing with ${primaryProvider.name} as primary provider and no secondary provider.`);
        }
      }
      // }
    } else {
      if (failedProviders.length > 0) {
        this.logDebug(`Provider validation failed: ${failedProviders.map((p) => `${p.name}: ${p.error}`).join(', ')}`);
        if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
          this.logDebug('DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true. Exiting...');
          process.exit(1);
        } else {
          console.log('[DEBUG_ETHEREUM] Will continue with the public provider. THIS IS NOT RECOMMENDED!');
        }
      }
      // Return here since we won't bother with API key tests if the provider tests failed
      return;
    }

    // Process API Key test results
    const successfulApiKeys = allResults.filter(
      (result) => result.status === 'SUCCESS' && result.type === 'API Provider',
    );
    const failedApiKeys = allResults.filter((result) => result.status === 'FAILED' && result.type === 'API Provider');
    if (successfulApiKeys.length === 0) {
      if (failedApiKeys.length === 0) {
        this.logDebug('No ETHERSCAN or MORALIS wallet API keys were provided, or all API keys failed.');
      } else {
        this.logDebug(`API key validation failed: ${failedApiKeys.map((p) => `${p.name}: ${p.error}`).join(', ')}`);
      }
      if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
        this.logDebug('DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true. Exiting...');
        process.exit(1);
      } else {
        this.logDebug(
          '[DEBUG_ETHEREUM] Will continue without wallet API keys. THIS MAY LEAD TO ETHEREUM SERVICE PROVIDER RATE LIMITING!',
        );
      }
    } else {
      this.ethereumIntegration.walletProviderInfo = successfulApiKeys;
      if (failedApiKeys.length > 0) {
        this.logDebug(`API key validation failed: ${failedApiKeys.map((p) => `${p.name}: ${p.error}`).join(', ')}`);
        if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
          console.error('DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true. Exiting...');
          process.exit(1);
        } else {
          this.logDebug(
            `Will continue using the single ${successfulApiKeys[0].name} API key with no secondary API key.`,
          );
        }
      }
    }
  }

  // Add a utility function for error handling
  private handleError(providerName: string, error: Error, type: 'Service Provider' | 'API Provider'): ProviderInfo {
    const errorMessage = this.getCleanErrorMessage(error);
    this.logDebug(`${providerName} test: FAILED - ${errorMessage}`);
    return {
      type,
      name: providerName,
      status: 'FAILED',
      error: errorMessage,
    };
  }

  // Check if the provider is valid and create a wallet client if it is
  private async testProvider(
    providerInfo: {
      name: string;
      provider: AbstractProvider;
      apiKey?: string;
    },
    testAddress: string,
  ): Promise<ProviderInfo> {
    try {
      const balance = await providerInfo.provider.getBalance(testAddress);
      const network = await providerInfo.provider.getNetwork();

      this.logDebug(`${providerInfo.name} API key test: SUCCESS - Network: ${network.name}, Test Balance returned.`);

      return {
        type: 'Service Provider',
        provider: providerInfo.provider,
        name: providerInfo.name,
        status: 'SUCCESS',
        network: network.name,
        balance: balance.toString(),
        apiKey: providerInfo.apiKey,
      };
    } catch (error) {
      return this.handleError(providerInfo.name, error as Error, 'Service Provider');
    }
  }

  // Check if a wallet token API key is valid
  private async testApiKey(apiKeyTestInfo: ApiKeyTestInfo): Promise<ProviderInfo> {
    try {
      let response: Response;
      if (apiKeyTestInfo.headers) {
        response = await fetch(apiKeyTestInfo.url, {
          headers: apiKeyTestInfo.headers,
        });
      } else {
        response = await fetch(apiKeyTestInfo.url);
      }
      return await apiKeyTestInfo.responseHandler(response);
    } catch (error) {
      return this.handleError(apiKeyTestInfo.provider, error as Error, 'API Provider');
    }
  }

  // Helper function to extract clean error messages from API key tests
  private getCleanErrorMessage = (error: unknown): string => {
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

  // Helper to display masked API Keys in debug messages
  private maskKey(key: string): string {
    if (!key) return 'undefined';
    if (key.length <= 8) return '*'.repeat(key.length);
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  }

  private warnAboutLegacyKeys(): void {
    if (process.env.DEBUG_ETHEREUM) {
      if (process.env.INFURA_PROJECT_ID || process.env.INFURA_PROJECT_SECRET) {
        this.logDebug(
          '[DEBUG_ETHEREUM] Found an Infura API Project ID and/or Secret. Replace this with INFURA_API_KEY.',
        );
        if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
          this.logDebug('Remove unused INFURA_PROJECT_ID and INFURA_PROJECT_SECRET from your environment variables.');
          this.logDebug('DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true. Exiting...');
          process.exit(1);
        }
      }

      if (process.env.POCKET_API_KEY) {
        this.logDebug('[DEBUG_ETHEREUM] Found a Pocket API key. Pocket is no longer recommended as a service node.');
        if (process.env.DEBUG_ETHEREUM_FAIL_ON_ERROR === 'true') {
          this.logDebug('Remove unused POCKET_API_KEY from your environment variables.');
          this.logDebug('DEBUG_ETHEREUM_FAIL_ON_ERROR is set to true. Exiting...');
          process.exit(1);
        }
      }
    }
  }

  // Helper to get the private providers from the environment variables
  private getPrivateProviders(): Array<{
    name: string;
    provider: AbstractProvider;
  }> {
    const providers = [];

    if (process.env.ALCHEMY_API_KEY) {
      const alchemyProvider = new ethers.AlchemyProvider('mainnet', process.env.ALCHEMY_API_KEY);
      providers.push({ name: 'Alchemy', provider: alchemyProvider, apiKey: process.env.ALCHEMY_API_KEY });
      this.logDebug(`Found an Alchemy key (masked): ${this.maskKey(process.env.ALCHEMY_API_KEY)}`);
    }

    if (process.env.INFURA_API_KEY) {
      const infuraProvider = new ethers.InfuraProvider('mainnet', process.env.INFURA_API_KEY);
      providers.push({ name: 'Infura', provider: infuraProvider, apiKey: process.env.INFURA_API_KEY });
      this.logDebug(`Found an Infura key (masked): ${this.maskKey(process.env.INFURA_API_KEY)}`);
    }

    return providers;
  }

  // Helper to get the array of wallet token API key tests
  private getWalletTokenApiKeyTestInfo(testAddress: string): ApiKeyTestInfo[] {
    const apiKeyTestInfo: ApiKeyTestInfo[] = [];
    if (process.env.ETHERSCAN_API_KEY || process.env.MORALIS_API_KEY) {
      if (process.env.MORALIS_API_KEY && process.env.DEBUG_ETHEREUM) {
        this.logDebug(`Found a Moralis key (masked): ${this.maskKey(process.env.MORALIS_API_KEY)}`);
        apiKeyTestInfo.push({
          provider: 'Moralis',
          url: `https://deep-index.moralis.io/api/v2/${testAddress}/balance`,
          headers: { 'X-API-Key': process.env.MORALIS_API_KEY },
          responseHandler: this.handleMoralisResponse,
        });
      }
      if (process.env.ETHERSCAN_API_KEY && process.env.DEBUG_ETHEREUM) {
        this.logDebug(`Found an Etherscan key (masked): ${this.maskKey(process.env.ETHERSCAN_API_KEY)}`);
        apiKeyTestInfo.push({
          provider: 'Etherscan',
          url: `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${testAddress}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`,
          responseHandler: this.handleEtherscanResponse,
        });
      }
    }
    return apiKeyTestInfo;
  }

  // Define handlers to validate response from Wallet API requests
  // Use arrow functions to bind 'this' to the class instance
  private handleMoralisResponse = async (response: Response): Promise<ProviderInfo> => {
    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.status} ${response.statusText}`);
    }
    this.logDebug('Moralis API key test: SUCCESS');
    return { type: 'API Provider', name: 'Moralis', status: 'SUCCESS', apiKey: process.env.MORALIS_API_KEY };
  };

  private handleEtherscanResponse = async (response: Response): Promise<ProviderInfo> => {
    const data = await response.json();
    if (data.status === '0' && data.message === 'NOTOK') {
      throw new Error(`Etherscan V2 API error: ${data.result}`);
    }
    console.log('[DEBUG_ETHEREUM] Etherscan API key test: SUCCESS');
    return {
      type: 'API Provider',
      name: 'Etherscan',
      status: 'SUCCESS',
      apiKey: process.env.ETHERSCAN_API_KEY,
    };
  };

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

export default EthereumInitializationService;
