# Externally Executable Bounty (EXB)

Permissionless scheduled task execution for any EVM chain.

## The Problem

Smart contracts can't call themselves. Today, if you need a function executed at a future block, you need your own off-chain infrastructure — a server, a private key, monitoring. Chainlink Automation and Gelato exist but require subscriptions, staking, or vendor lock-in.

## The Solution

A standard interface (`IExternallyExecutableBounty`) that any contract can implement to expose scheduled tasks. Anyone running an executor bot can call these tasks when they're ready and earn a bounty. Pure economic incentives, no centralized network.

## How It Works

1. **Contract devs** implement `IExternallyExecutableBounty` and fund their contract with ETH/ERC20 for bounties
2. **Executors** scan the `TaskRegistry` for contracts with pending tasks
3. When a task's block threshold is reached, executors call `executeTask()` — the contract logic runs and the executor gets paid

Fair race — first tx to land wins the bounty.

## Architecture

```
contracts/
├── interfaces/
│   └── IExternallyExecutableBounty.sol    # The standard interface
├── base/
│   └── ScheduledTaskBase.sol # Abstract base with task management + bounty payments
├── registry/
│   └── TaskRegistry.sol      # On-chain discovery registry
└── examples/
    ├── DeadMansSwitch.sol    # Dead man's switch with beneficiary
    └── ScheduledPayment.sol  # One-shot and recurring payments
```

## Interface

```solidity
interface IExternallyExecutableBounty {
    function getExecutableTasks() external view returns (uint256[] memory taskIds);
    function executeTask(uint256 taskId) external;
    function taskBounty(uint256 taskId) external view returns (address token, uint256 amount);
    function taskCount() external view returns (uint256);
}
```

## Quick Start

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Deployment

Uses CREATE2 for deterministic addresses across all EVM chains (TODO: deploy scripts).

## Design Decisions

- **Fair race**: No commit-reveal, no lottery. First valid tx wins.
- **Contract-set bounty**: The deploying contract decides the bounty amount. Executors decide if it's worth the gas.
- **Gas is the executor's problem**: Bounty must exceed gas cost for execution to be economically rational.
- **One-shot + Recurring**: Both supported. Recurring tasks re-arm automatically after execution.
- **Permissionless**: No staking, no approval, no subscriptions. Deploy, register, done.

## TODO

- [ ] CREATE2 deployer for multi-chain same-address deployment
- [ ] Reference executor bot (TypeScript)
- [ ] Gas estimation helpers for bounty pricing
- [ ] EIP proposal for `IExternallyExecutableBounty` standardization
- [ ] npm SDK for contract developers
