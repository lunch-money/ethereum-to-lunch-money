#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

DIR=$(dirname "$0")

curl https://tokens.1inch.eth.link/ -o $(realpath $DIR/../fixtures/1inch.json)
