# EXB Deployments

## TaskRegistry (CREATE2 — same address on all chains)

**Address: `0x8ab5A33c3Fdac8cB86301D925aB12C4565e91ce2`**

| Chain | Chain ID | Block | Explorer |
|-------|----------|-------|----------|
| Ethereum | 1 | 24664796 | [etherscan.io](https://etherscan.io/address/0x8ab5A33c3Fdac8cB86301D925aB12C4565e91ce2) |
| Base | 8453 | 43405445 | [basescan.org](https://basescan.org/address/0x8ab5A33c3Fdac8cB86301D925aB12C4565e91ce2) |
| Arbitrum | 42161 | 442138599 | [arbiscan.io](https://arbiscan.io/address/0x8ab5A33c3Fdac8cB86301D925aB12C4565e91ce2) |

**CREATE2 Salt:** `0x9323cf707f6717930e670124fa0fd6c7345bb954a7356a208c98ef0c01a8bd89` (`keccak256("exb-v1")`)

**Owner:** `0xF00CAAb8E02378384d133347F15698F2A704b3A5`

To deploy on additional EVM chains, run:
```bash
DEPLOYER_PRIVATE_KEY=<key> npx hardhat run scripts/deploy/deploy-create2.ts --network <network>
```

## Base Sepolia (Testnet)

- **TaskRegistry**: `0x784CA49F7c1518BabE18880984d7131a0A8A632D`
- **DeadMansSwitch (example)**: `0x576ed8DA8d01C0b4e8a89CC3EeB18Bb75630e62f` ([verified](https://sepolia.basescan.org/address/0x576ed8DA8d01C0b4e8a89CC3EeB18Bb75630e62f#code))
- **First execution tx**: `0x6c3df445f0935ea85995aa6da23fb4b157f1c83ded885762c4f1beeeda3c425f`
