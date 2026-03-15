#!/bin/bash
# Deploy EXB contracts — reads key from macOS Keychain
set -euo pipefail

NETWORK="${1:-baseSepolia}"
KEYCHAIN_SERVICE="paymeback-deployer-key"
KEYCHAIN_ACCOUNT="deployer"

echo "🔑 Reading deployer key from Keychain..."
DEPLOYER_PRIVATE_KEY=$(/usr/bin/security find-generic-password \
  -s "$KEYCHAIN_SERVICE" \
  -a "$KEYCHAIN_ACCOUNT" \
  -w 2>/dev/null)

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "❌ Key not found in Keychain."
  exit 1
fi

export DEPLOYER_PRIVATE_KEY
echo "🚀 Deploying to $NETWORK..."
npx hardhat run scripts/deploy/deploy-sepolia.ts --network "$NETWORK"
unset DEPLOYER_PRIVATE_KEY
echo "✅ Key purged from memory."
