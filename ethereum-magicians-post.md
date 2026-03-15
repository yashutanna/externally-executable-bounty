# ERC: Externally Executable Bounty — A Standard Interface for Permissionless Task Automation

## Abstract

This proposal defines a standard interface (`IExternallyExecutableBounty`) for smart contracts that expose tasks which need to be executed by external parties. Implementing contracts advertise executable tasks, and any caller who successfully executes a task receives a bounty (ETH or ERC-20) as compensation. This creates a permissionless, incentive-driven automation layer with no centralized operator network, no staking requirements, and no subscriptions.

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

What's missing is a **standard interface** that lets any contract say: *"I have work that needs doing, and I'll pay you for it."*

This is what ERC-20 did for tokens — before it, every token had its own transfer mechanism. After ERC-20, wallets, DEXs, and tools could interact with any token using the same interface. We want to do the same for task execution.

## Specification

The interface is intentionally minimal — 4 functions, 3 events:

```solidity
interface IExternallyExecutableBounty {
    event TaskCreated(uint256 indexed taskId, uint256 executeAfterBlock, address bountyToken, uint256 bountyAmount);
    event TaskExecuted(uint256 indexed taskId, address indexed executor, address bountyToken, uint256 bountyAmount);
    event TaskCancelled(uint256 indexed taskId);

    /// @notice Returns all task IDs that are currently executable
    function getExecutableTasks() external view returns (uint256[] memory taskIds);

    /// @notice Execute a task and receive the bounty. Reverts if not ready.
    function executeTask(uint256 taskId) external;

    /// @notice Get bounty details (address(0) = native ETH)
    function taskBounty(uint256 taskId) external view returns (address token, uint256 amount);

    /// @notice Total tasks ever created (valid IDs: 0 to taskCount()-1)
    function taskCount() external view returns (uint256);
}
```

### How It Works

1. **Contract developers** implement `IExternallyExecutableBounty` and fund their contract with ETH/ERC-20 for bounties
2. **Executors** (anyone running a bot) call `getExecutableTasks()` (view, free) to discover ready tasks
3. When a task is ready, executors call `executeTask(taskId)` — the contract's logic runs and the executor receives the bounty via `msg.sender`

### Key Design Decisions

**Fair race execution**: No commit-reveal, no lottery. First valid transaction wins. This mirrors how MEV operates and ensures tasks get executed promptly.

**Contract-set bounties**: The deploying contract decides the bounty amount. Executors decide if it's worth the gas. Market pricing, not subscription pricing.

**Gas is the executor's problem**: Executors calculate whether `bounty > gas cost` before executing. This is simple and avoids oracle dependencies.

**One-shot and recurring**: Both supported. Recurring tasks re-arm after execution (advance the `executeAfterBlock`). One-shot tasks are marked as executed.

**No cancel function in the interface**: Cancellation logic varies by implementation. The `TaskCancelled` event is standardized for executor tracking, but the cancel mechanism is left to implementors.

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
| On-chain incentive | No | No | Yes (bounty) |

The key insight is that this is an **interface standard**, not a protocol. There's no middleware, no token, no network to join. Contracts implement the interface, executors call the functions, bounties flow.

## Reference Implementation

We've built and deployed a complete reference implementation on Base Sepolia:

- **Abstract base contract** (`ScheduledTaskBase`) — handles task lifecycle, bounty payments, reentrancy protection, one-shot + recurring
- **TaskRegistry** — optional on-chain discovery registry
- **DeadMansSwitch** — example implementation
- **ScheduledPayment** — example: one-time and recurring payments
- **Executor bot** — TypeScript reference bot that scans the registry and executes profitable tasks

**Deployed contracts (Base Sepolia):**
- TaskRegistry: [`0x784CA49F7c1518BabE18880984d7131a0A8A632D`](https://sepolia.basescan.org/address/0x784CA49F7c1518BabE18880984d7131a0A8A632D#code)
- DeadMansSwitch: [`0x576ed8DA8d01C0b4e8a89CC3EeB18Bb75630e62f`](https://sepolia.basescan.org/address/0x576ed8DA8d01C0b4e8a89CC3EeB18Bb75630e62f#code)

Both contracts are verified and readable on Basescan. The executor bot successfully discovered and executed the dead man's switch task, collecting a 0.0001 ETH bounty for ~0.0000005 ETH in gas.

**Source code**: [TODO: Add GitHub repo link once published]

## Open Questions

1. **Should `getExecutableTasks()` support pagination?** For contracts with thousands of tasks, returning all IDs in a single call could hit gas limits. An alternative is `getExecutableTasksPaginated(uint256 offset, uint256 limit)`.

2. **Should there be a `taskInfo()` function?** Currently the interface only exposes `taskBounty()`. A richer view function could return execution conditions, status, and metadata — but this adds complexity.

3. **Should the interface mandate ERC-165?** Currently required. Could be made optional to reduce implementation burden.

4. **Event indexing**: Are the current indexed parameters sufficient for executor tooling?

## Feedback Welcome

Looking for feedback on:
- Interface design — is it minimal enough? Too minimal?
- Security considerations we may have missed
- Edge cases in the bounty payment model
- Interest from existing automation projects in adopting the standard
