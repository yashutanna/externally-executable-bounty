# ERC: Externally Executable Bounty — A Standard Interface for Permissionless Task Automation

## Abstract

This proposal defines a standard interface (`IExternallyExecutableBounty`) for smart contracts that expose tasks which need to be executed by external parties. Implementing contracts advertise executable tasks, and any caller who successfully executes a task receives an ETH bounty as compensation. This creates a permissionless, incentive-driven automation layer with no centralized operator network, no staking requirements, and no subscriptions.

## Motivation

Smart contracts cannot call themselves. Any time-dependent logic — scheduled payments, vesting releases, liquidations, governance execution, dead man's switches — requires an external transaction to trigger it.

Today, projects solve this by either:

1. **Running their own infrastructure** — servers, private keys, monitoring, DevOps overhead
2. **Subscribing to centralized automation services** (Chainlink Automation, Gelato) — vendor lock-in, subscription costs, trust assumptions, approval processes

Neither approach is composable, permissionless, or standardized. There is no way for a generic executor to discover and service arbitrary contracts that need automation.

### The Gap

If you're building a contract today that needs "call this function after block X", your options are:

- Run a node yourself (infrastructure burden)
- Pay for Chainlink Automation (subscription, vendor dependency)
- Hope someone will call your function (no incentive)

What's missing is a **standard interface** that lets any contract say: *"I have work that needs doing, and I'll pay you ETH for it."*

This is what ERC-20 did for tokens — before it, every token had its own transfer mechanism. After ERC-20, wallets, DEXs, and tools could interact with any token using the same interface. We want to do the same for task execution.

## Specification

The interface is intentionally minimal — 4 functions, 3 events:

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

### How It Works

1. **Contract developers** implement `IExternallyExecutableBounty` and fund their contract with ETH for bounties
2. **Executors** (anyone running a bot) call `getExecutableTasks()` (view, free) to discover ready tasks
3. Executors **simulate** `executeTask(taskId)` via `eth_call` — if the implementation is broken, simulation fails and they skip it
4. When profitable, executors submit `executeTask(taskId)` — the contract's logic runs and the executor receives ETH via `msg.sender`

### Why ETH-Only Bounties?

This was a deliberate design choice:

- **Simulation-friendly**: Executors `eth_call` simulate the execution and check their ETH balance delta. Broken implementations fail immediately — executors never waste gas.
- **No token edge cases**: No fee-on-transfer tokens, no rebasing, no approval patterns, no non-standard return values.
- **Universal**: ETH exists on every EVM chain. No dependency on specific token deployments.
- **Gas-efficient**: Native ETH transfers are cheaper than ERC-20 transfers.

Contracts that want to offer ERC-20 bounties can wrap: hold ETH for the bounty, handle token distribution in task logic.

### Key Design Decisions

**Fair race execution**: No commit-reveal, no lottery. First valid transaction wins. This mirrors how MEV operates and ensures tasks get executed promptly.

**Contract-set bounties**: The deploying contract decides the bounty amount. Executors decide if it's worth the gas. Market pricing, not subscription pricing.

**Gas is the executor's problem**: Executors calculate whether `bounty > gas cost` before executing. Simple, no oracle dependencies.

**CEI pattern**: State updates before external calls throughout. Task status is updated before `_onTaskExecuted()` runs and before bounty payment.

**One-shot and recurring**: Both supported. Recurring tasks re-arm after execution. One-shot tasks are marked as executed.

**No cancel function in the interface**: Cancellation logic varies by implementation. The `TaskCancelled` event is standardized for executor tracking.

### ERC-165

Compliant contracts MUST implement ERC-165 and return `true` for the interface ID: `0x0dd141a0`

## Example Use Cases

**Dead Man's Switch**: Owner must check in periodically. If they don't, anyone can trigger the switch (transferring funds to a beneficiary) and collect a bounty.

**Scheduled Payments**: Payroll, subscriptions, recurring transfers that become executable after a block threshold.

**Governance Execution**: Execute passed proposals after a timelock expires.

**Vesting Release**: Token vesting schedules where anyone can trigger the release when a cliff is reached.

**Oracle Updates**: Periodic price feed updates incentivized by bounties.

## How This Differs From Existing Solutions

| | Chainlink Automation | Gelato | EXB (this proposal) |
|---|---|---|---|
| Permissionless | No (node approval) | No (staking) | Yes |
| Standard interface | Proprietary | Proprietary | ERC standard |
| Subscription | Yes | Yes | No |
| Executor network | Chainlink nodes | Gelato nodes | Anyone |
| Vendor lock-in | Yes | Yes | No |
| On-chain incentive | No | No | Yes (ETH bounty) |
| Simulation-safe | N/A | N/A | Yes (eth_call) |

The key insight is that this is an **interface standard**, not a protocol. There's no middleware, no token, no network to join. Contracts implement the interface, executors call the functions, ETH bounties flow.

## Reference Implementation

Complete reference implementation deployed on **Ethereum, Base, and Arbitrum** (same address via CREATE2):

**TaskRegistry**: [`0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B`](https://etherscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code)

- No owner, no fees — permissionless public good
- Source verified on all explorers
- [Etherscan](https://etherscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) · [Basescan](https://basescan.org/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code) · [Arbiscan](https://arbiscan.io/address/0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B#code)

The repo includes:
- **`ScheduledTaskBase.sol`** — Abstract base with task lifecycle, CEI pattern, ReentrancyGuard, ETH bounties
- **`TaskRegistry.sol`** — Permissionless on-chain discovery (no admin, reentrancy-safe registration)
- **`DeadMansSwitch.sol`** — Example: dead man's switch with beneficiary
- **`ScheduledPayment.sol`** — Example: one-shot and recurring ETH payments
- **`executor/bot.ts`** — Reference executor bot (TypeScript)

The executor bot successfully discovered and executed tasks on testnet, collecting bounties profitably.

**Source code**: [github.com/yashutanna/exb](https://github.com/yashutanna/exb)

## Security Considerations

- **ReentrancyGuard** on all execution paths
- **CEI pattern** — state updated before any external calls (task status, recurring re-arm)
- **Registry reentrancy protection** — registration slot reserved before `taskCount()` validation call
- **Simulation-friendly** — executors dry-run via `eth_call` to detect broken implementations before spending gas
- **Pagination** — `getExecutableTasksPaginated()` and `getActiveContractsPaginated()` for scale
- **Implementor footgun documented** — if `_onTaskExecuted()` drains all ETH, bounty payment fails and task is stuck

## Feedback Welcome

Looking for feedback on:
- Interface design — is it minimal enough? Too minimal?
- Security considerations we may have missed
- Edge cases in the ETH bounty payment model
- Interest from existing automation projects in adopting the standard
- Whether ERC-165 should be MUST or SHOULD
