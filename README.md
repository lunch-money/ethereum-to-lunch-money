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

There is also a script, `get-balances.ts`, that can be invoked to invoke the
client against a real wallet. It is invoked in the following way:

```
LM_ETHERSCAN_API_KEY=XXX LM_ETHEREUM_WALLET_ADDRESS=YYY ./bin/get-balances.ts
```

You can obtain a Etherscan API key by following the documentation [here](https://docs.etherscan.io/getting-started/viewing-api-usage-statistics).

## Refreshing the Token List

This package uses a fixed token list fetched as the token list that the 1inch
exchange uses, current as of 2021-08-15. Run the included script
`./bin/refresh-token-list.sh` to refresh the token list. Refreshing the token
list will require a new version of this package to be released.
