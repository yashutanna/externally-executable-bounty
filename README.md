# Externally Executable Bounty (EXB)

Permissionless scheduled task execution for any EVM chain. A public good.

## The Problem

Smart contracts can't call themselves. Today, if you need a function executed at a future block, you need your own off-chain infrastructure — a server, a private key, monitoring. Chainlink Automation and Gelato exist but require subscriptions, staking, or vendor lock-in.

## The Solution

A standard interface (`IExternallyExecutableBounty`) that any contract can implement to expose scheduled tasks. Anyone running an executor bot can call these tasks when they're ready and earn an ETH bounty. Pure economic incentives, no centralized network.

## How It Works

1. **Contract devs** implement `IExternallyExecutableBounty` and fund their contract with ETH for bounties
2. **Executors** scan the `TaskRegistry` for contracts with pending tasks
3. When a task's block threshold is reached, executors call `executeTask()` — the contract logic runs and the executor gets paid
4. Executors can **simulate** `executeTask()` via `eth_call` before submitting — if the implementation is broken, the simulation fails and they skip it

Fair race — first tx to land wins the bounty.

## Deployments

**TaskRegistry** (same address on all chains via CREATE2):

`0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B`

| Chain | Explorer |
|-------|----------|
| Ethereum | [etherscan.io](https://etherscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) |
| Base | [basescan.org](https://basescan.org/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) |
| Arbitrum | [arbiscan.io](https://arbiscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) |

Source verified on all explorers. No owner, no fees — permissionless public good.

## Architecture

```
contracts/
├── interfaces/
│   └── IExternallyExecutableBounty.sol   # The standard interface (ERC-165: 0x0dd141a0)
├── base/
│   └── ScheduledTaskBase.sol             # Abstract base with task lifecycle + ETH bounties
├── registry/
│   └── TaskRegistry.sol                  # Permissionless on-chain discovery
└── examples/
    ├── DeadMansSwitch.sol                # Dead man's switch with beneficiary
    └── ScheduledPayment.sol              # One-shot and recurring ETH payments

executor/
└── bot.ts                                # Reference executor bot (TypeScript)
```

## Interface

```solidity
interface IExternallyExecutableBounty {
    event TaskCreated(uint256 indexed taskId, uint256 executeAfterBlock, uint256 bountyAmount);
    event TaskExecuted(uint256 indexed taskId, address indexed executor, uint256 bountyAmount);
    event TaskCancelled(uint256 indexed taskId);

    function getExecutableTasks() external view returns (uint256[] memory taskIds);
    function executeTask(uint256 taskId) external;
    function taskBounty(uint256 taskId) external view returns (uint256 amount);
    function taskCount() external view returns (uint256);
}
```

## Quick Start

```bash
npm install
npx hardhat compile
npx hardhat test
```

### Deploy to a new chain

```bash
DEPLOYER_PRIVATE_KEY=<key> npx hardhat run scripts/deploy/deploy-create2.ts --network <network>
```

### Run the executor bot

```bash
cd executor && npm install
RPC_URL=https://mainnet.base.org \
PRIVATE_KEY=<key> \
REGISTRY_ADDRESS=0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B \
npx ts-node bot.ts
```

## Design Decisions

- **ETH-only bounties**: Simple, simulatable. Executors can `eth_call` to verify profitability before committing gas.
- **Fair race**: No commit-reveal, no lottery. First valid tx wins.
- **Contract-set bounty**: The deploying contract decides the bounty amount. Executors decide if it's worth the gas.
- **Gas is the executor's problem**: Bounty must exceed gas cost for execution to be economically rational.
- **One-shot + Recurring**: Both supported. Recurring tasks re-arm automatically after execution.
- **Permissionless**: No staking, no approval, no subscriptions, no admin. Deploy, register, done.
- **CEI pattern**: State updates before external calls throughout. ReentrancyGuard on executeTask.
- **Public good registry**: No owner, no fees, no governance token. Immutable infrastructure.

## Security

- **ReentrancyGuard** on all execution paths
- **Checks-Effects-Interactions** pattern — state updated before any external calls
- **Registry reentrancy protection** — slot reserved before interface validation call
- **Simulation-friendly** — executors can dry-run tasks to detect broken implementations
- **Pagination** — `getExecutableTasksPaginated()` and `getActiveContractsPaginated()` for scale

## License

MIT
