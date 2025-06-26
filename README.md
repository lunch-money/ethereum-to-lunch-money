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

## Debugging

The following environment variables can be run with the test script or when using the plugin with Lunch Money

- DEBUG_ETHEREUM - set to enable detailed debug messages and enable API Key validation
- ETHEREUM_BALANCE_TIMEOUT_MSECS - the number of msecs to wait for a response before timing out

The timeout was added to avoid a false CORS message when the API never returns.

Tweaking this to about 1000-2000, and watching the debug messages can be useful for validating that failover is working as expected.

## Live Testing

There is a script, `get-balances.ts`, that can be invoked to invoke the client against a real or test wallet.  This mimics the behavior of the Lunch Money server when a user attempts to connect an Ethereum wallet.

Copy [env.example](./env.example) to .env and set some or all of the environment variables that the script and connector use.

### Ethereum Service Provider API Keys

If no keys are set, the script will use the public APIs which may or may not work. One or both of the following are recommended:

- ALCHEMY_API_KEY - [set up a key here](https://dashboard.alchemy.com/). This is the recommended service to use
- INFURA_API_KEY - [set up a key here](https://developer.metamask.io/). If set with Alchemy will be used as a secondary

While the connector can run with other service node keys, such as Etherscan, the test script will not support it.

###  Wallet Configuration
- LM_ETHEREUM_WALLET_ADDRESS

If no wallet is set, the test script will use a well know test wallet

The Blockchain network is no longer configurable in the test script and defaults to "mainnet".

To run the script
```
yarn test-live
```
A .vscode/launch.json configuration is include to facilitate running the script in the debugger with VSCode.

## Refreshing the Token List

This package uses a fixed token list fetched as the token list that the 1inch
exchange uses. Run the included script
`./bin/refresh-token-list.sh` to refresh the token list. Refreshing the token
list will require a new version of this package to be released.
