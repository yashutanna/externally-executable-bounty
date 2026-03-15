# EXB Deployments

## TaskRegistry v2 (CREATE2 — same address on all chains)

**Address: `0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B`**

| Chain | Chain ID | Block | Explorer |
|-------|----------|-------|----------|
| Ethereum | 1 | 24664922 | [etherscan.io](https://etherscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) |
| Base | 8453 | 43406421 | [basescan.org](https://basescan.org/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) |
| Arbitrum | 42161 | 442144531 | [arbiscan.io](https://arbiscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) |

- **Source verified** on all explorers ✅
- **No owner** — fully permissionless public good
- **No fees** — free to register
- **ETH-only bounties** — simple, simulatable

**CREATE2 Salt:** `keccak256("exb-v2")` = `0xd350ccbe48c25741899322a9bbce95b84bfea911023507245a49d1f9ad698564`

To deploy on additional EVM chains:
```bash
DEPLOYER_PRIVATE_KEY=<key> npx hardhat run scripts/deploy/deploy-create2.ts --network <network>
```

## Previous Deployments (Deprecated)

### TaskRegistry v1 (had owner + fees — now renounced)
- **Address:** `0x8ab5A33c3Fdac8cB86301D925aB12C4565e91ce2`
- Deployed on Ethereum, Base, Arbitrum
- Owner renounced — still functional but outdated interface

### Base Sepolia (Testnet)
- **TaskRegistry:** `0x784CA49F7c1518BabE18880984d7131a0A8A632D`
- **DeadMansSwitch (example):** `0x576ed8DA8d01C0b4e8a89CC3EeB18Bb75630e62f`
- **First execution tx:** `0x6c3df445f0935ea85995aa6da23fb4b157f1c83ded885762c4f1beeeda3c425f`
