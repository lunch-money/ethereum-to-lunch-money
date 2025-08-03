# ethereum-to-lunch-money

This repo exposes an interface for extracting balances for all ERC-20 tokens
from an Ethereum wallet.

## Installation

```
yarn
```

## Testing

```
yarn test
```

## Ethereum Network Service Provider and aggregator usage and configuration
The connector provides an interface to create an Ethereum walletClient which provides an interface to check the wallet's balances. Ethereum supports multiple networks (or "chains"), but each walletClient is created for a single network. It is suggested to use the ethereum mainnet when creating the clients. A future optimization may be to support other networks.

Once created the walletClient uses the ethers library to query balances in an ethereum wallet.  By default this returns only the wallet's ethereum balance unless it is given a list of other tokens to look for.  Each token lookup uses gas which counts against rate limits by the Ethereum service providers.

To minimize gas usage, but to support other tokens, the Moralis and Etherscan APIs are used to query the wallet for a list of tokens they maintain.  While these API requests also cost some gas, reducing the list of tokens to just those required generally optimizes the cost of the balance lookup. Moralis provides better results but has a less generous free tier. Etherscan (if set) is used as a secondary service when the Moralis API request fails. In order to leverage these APIs the following environment variables must be set:

- **MORALIS_API_KEY**: [set up a key here](https://moralis.io/). Used for token discovery as the primary method. Moralis provides comprehensive ERC20 token discovery.
- **ETHERSCAN_API_KEY**: [set up a key here](https://etherscan.io/apis). Used as a fallback for token discovery if Moralis fails. Etherscan provides token transfer event discovery.

These lookups will return a list of all tokens the wallets have ever encountered, including test tokens and possibly tokens associated with scams. To further reduce the cost of balance lookups the list of discovered tokens is filtered against the list provided by 1inch, a decentralized exchange aggregator, that maintains a list of tokens with good reputations and liquidity. Filtering the list of all tokens ever used by the wallet against 1inch further reduces cost by eliminating tokens not on the provisioned network, or those that don't meet reputation standards

Once the list of tokens contained in a wallet is obtained, the ethers library is used to obtain the balances for these tokens.  Ethers uses one or more Ethereum Service Providers.  It is recommended to provision API Key for both of the following service providers which are used in a primary/secondary fashion:
- **ALCHEMY_API_KEY**: [set up a key here](https://dashboard.alchemy.com/). This is the recommended service to use.
- **INFURA_API_KEY**: [set up a key here](https://developer.metamask.io/). If set with Alchemy, it will be used as a secondary.

While it is possible to perform initialization and balance lookups without setting any of these API keys it is strongly recommended to set all of them.

Net/Net when properly provisioned, this service will provide Lunch Money users with ethereum wallet balances for tokens on the network specified by Lunch Money (the default mainnet) and that have a well established reputation with 1inch.

## Debugging

The following optional environment variables can be run with the test script or when using the plugin with Lunch Money

- DEBUG_ETHEREUM - set to enable detailed debug messages and enable API Key validation
  
- ETHEREUM_BALANCE_TIMEOUT_MSECS - the number of msecs to wait for a response before timing out
The timeout was added to avoid a false CORS message when the API never returns.

Tweaking this to about 1000-2000, and watching the debug messages can be useful for validating that failover is working as expected.

- DEBUG_ETHEREUM_FAIL_ON_ERROR - set to true to have the test script (or lunch money server) fail if any of the ethereum service provider keys are invalid.

Whenever the values of the Ethereum Service Provider keys are updated in an environment it is suggested to temporarily set DEBUG_ETHEREUM_FAIL_ON_ERROR to true and to watch the console messages on startup. If the app reports that all keys are valid and does not exit, then remove the environment variable prior to a final deploy.

## Live Testing

There is a script, `get-balances.ts`, that can be invoked to invoke the client against a real or test wallet. This mimics the behavior of the Lunch Money server when a user attempts to connect an Ethereum wallet. 

Copy [env.example](./env.example) to .env and set some or all of the environment variables that the script and connector use.


###  Wallet Configuration
- LM_ETHEREUM_WALLET_ADDRESS

If no wallet is set, the test script will use a well know test wallet

The Blockchain network is no longer configurable in the test script and defaults to "mainnet".

To run the script
```
yarn test-live
```A .vscode/launch.json configuration is include to facilitate running the script in the debugger with VSCode.

## Refreshing the Token List

This package uses a fixed token list fetched as the token list that the 1inch
exchange uses. Run the included script
`./bin/refresh-token-list.sh` to refresh the token list. Refreshing the token
list will require a new version of this package to be released.

## Automated Testing of Ethereum Provider Keys

This project includes an automated test script to validate the configuration and functionality of Ethereum service provider keys. The script tests various scenarios to ensure that the keys are correctly set and that the system behaves as expected under different conditions.

### Purpose

The automated test script is designed to:
- Validate the presence and correctness of Ethereum service provider keys (e.g., Alchemy, Infura, Etherscan, Moralis).
- Check for deprecated or unsupported keys and generate warnings.
- Ensure that the system can fall back to appropriate methods when keys are missing or invalid.

### How to Run the Tests

1. **Ensure Node.js is installed**: The script requires Node.js to execute.
2. **Set Environment Variables**: Configure the necessary environment variables for the test scenarios. You can set these directly in your terminal or use a `.env` file.
3. **Run the Test Script**:
   ```
   node run-tests.js
   ```
   This command will execute the test script, which will run through the predefined scenarios and log the results to the console.

### Scenarios Tested

- **Valid Alchemy and Infura Keys**: Tests with valid keys to ensure successful validation.
- **Old Pocket API Key**: Tests with deprecated keys to generate warnings.
- **Valid Etherscan and Moralis Keys**: Tests with valid keys to ensure successful validation.

The results of each test scenario will be displayed in the console, indicating success or failure and any relevant warnings or errors.

