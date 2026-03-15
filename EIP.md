---
eip: TBD
title: Externally Executable Bounty
description: A standard interface for contracts that expose executable tasks with ETH bounties, enabling permissionless decentralized automation.
author: Yash Tanna (@yashtanna)
discussions-to: TBD
status: Draft
type: Standards Track
category: ERC
created: 2026-03-15
requires: 165
---

## Abstract

This ERC defines a standard interface for smart contracts that contain tasks which need to be executed by external parties at a future point in time. Implementing contracts expose a set of functions that allow anyone to discover pending tasks, verify their executability, execute them, and receive an ETH bounty as compensation. This creates a permissionless, incentive-driven automation layer that requires no centralized operator network, no staking, and no subscriptions.

## Motivation

Smart contracts cannot invoke their own functions. Any time-dependent or condition-dependent logic — scheduled payments, liquidations, oracle updates, governance execution, vesting releases, dead man's switches — requires an external transaction to trigger it.

Today, projects solve this by either:

1. Running their own off-chain infrastructure (servers, private keys, monitoring)
2. Subscribing to centralized automation services (Chainlink Automation, Gelato) that introduce vendor lock-in, subscription costs, and trust assumptions

Neither approach is composable, permissionless, or standardized. There is no way for a generic executor to discover and service arbitrary contracts that need automation.

This ERC solves the problem by standardizing how contracts advertise executable tasks and compensate executors. Any contract implementing this interface can be serviced by any executor — no registration with a specific network required. The bounty mechanism creates a natural economic incentive: if execution is valuable to the contract owner, they set a bounty high enough to attract executors. Market forces handle the rest.

### Use Cases

- **Dead man's switches**: Transfer assets to a beneficiary if the owner doesn't check in
- **Scheduled payments**: Payroll, subscriptions, recurring transfers
- **Vesting releases**: Token vesting cliff and linear release schedules
- **Governance execution**: Execute passed proposals after a timelock
- **Liquidations**: Trigger liquidation when conditions are met
- **Oracle updates**: Periodic price feed updates with bounty incentives
- **Recurring DeFi operations**: Auto-compounding, rebalancing, harvesting

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### Interface

Every compliant contract MUST implement the `IERC_ExternallyExecutableBounty` interface:

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.0;

interface IERC_ExternallyExecutableBounty {
    /// @notice Emitted when a new task is created
    /// @param taskId The unique identifier of the task
    /// @param executeAfterBlock The block number after which the task becomes executable
    /// @param bountyAmount The ETH bounty amount paid to the executor (in wei)
    event TaskCreated(
        uint256 indexed taskId,
        uint256 executeAfterBlock,
        uint256 bountyAmount
    );

    /// @notice Emitted when a task is successfully executed
    /// @param taskId The unique identifier of the executed task
    /// @param executor The address that executed the task and received the bounty
    /// @param bountyAmount The ETH bounty amount paid (in wei)
    event TaskExecuted(
        uint256 indexed taskId,
        address indexed executor,
        uint256 bountyAmount
    );

    /// @notice Emitted when a task is cancelled
    /// @param taskId The unique identifier of the cancelled task
    event TaskCancelled(uint256 indexed taskId);

    /// @notice Returns all task IDs that are currently executable
    /// @dev This function MUST be callable as a view function (no state changes).
    ///      Executors use this to discover which tasks are ready.
    ///      SHOULD return an empty array if no tasks are executable.
    ///      MUST NOT revert under normal conditions.
    /// @return taskIds An array of task IDs that can be executed right now
    function getExecutableTasks() external view returns (uint256[] memory taskIds);

    /// @notice Execute a scheduled task and claim the bounty
    /// @dev MUST revert if the task is not currently executable.
    ///      MUST transfer the ETH bounty to msg.sender upon successful execution.
    ///      MUST emit TaskExecuted upon successful execution.
    ///      MUST NOT be re-enterable for the same taskId.
    ///      For recurring tasks, MUST update the task state so it is no longer
    ///      immediately executable (e.g., advance the executeAfterBlock).
    /// @param taskId The ID of the task to execute
    function executeTask(uint256 taskId) external;

    /// @notice Get the ETH bounty amount for a specific task
    /// @dev MUST return the bounty even for non-executable tasks.
    ///      Executors use this to determine if execution is economically viable.
    /// @param taskId The task ID to query
    /// @return amount The bounty amount in wei
    function taskBounty(uint256 taskId) external view returns (uint256 amount);

    /// @notice Get the total number of tasks ever created (including executed and cancelled)
    /// @dev Task IDs MUST be sequential starting from 0.
    ///      taskCount() defines the upper bound for valid task IDs: [0, taskCount()).
    /// @return The total number of tasks
    function taskCount() external view returns (uint256);
}
```

### Behavioral Requirements

1. **Task IDs**: Task IDs MUST be sequential unsigned integers starting from 0. The range of valid task IDs is `[0, taskCount())`.

2. **Executability**: A task is "executable" when the implementing contract's conditions for that task are met. The most common condition is a block number threshold, but implementations MAY use any condition (timestamp, oracle price, external state, etc.). The `getExecutableTasks()` function MUST accurately reflect which tasks are currently executable.

3. **Bounty Transfer**: When `executeTask()` succeeds, the ETH bounty MUST be transferred to `msg.sender` as part of the same transaction.

4. **Atomicity**: The task's business logic and the bounty payment MUST execute atomically. If either fails, the entire transaction MUST revert.

5. **Idempotency**: Calling `executeTask()` on an already-executed one-shot task MUST revert. Implementations SHOULD use a custom error for this case.

6. **Recurring Tasks**: For recurring tasks, `executeTask()` MUST update the task's state such that it is no longer immediately executable. Typically this means advancing the `executeAfterBlock` to `block.number + interval`. The task MUST emit a new `TaskCreated` event with the updated parameters.

7. **Reentrancy**: Implementations MUST protect against reentrancy in `executeTask()`. The bounty transfer to `msg.sender` occurs within the execution flow and could be exploited via a reentrant call.

8. **ERC-165**: Compliant contracts MUST implement ERC-165 and return `true` for the `IERC_ExternallyExecutableBounty` interface ID.

9. **Simulation-friendly**: `executeTask()` SHOULD be designed so that executors can verify profitability via `eth_call` simulation before submitting a transaction. Since bounties are ETH-only, executors can simply check their ETH balance delta in the simulation.

### Interface ID

The interface ID for `IERC_ExternallyExecutableBounty` is `0x0dd141a0`, computed as the XOR of the function selectors:

```
bytes4 interfaceId = type(IERC_ExternallyExecutableBounty).interfaceId;
// = bytes4(keccak256("getExecutableTasks()")) ^
//   bytes4(keccak256("executeTask(uint256)")) ^
//   bytes4(keccak256("taskBounty(uint256)")) ^
//   bytes4(keccak256("taskCount()"));
// = 0x0dd141a0
```

### Discovery

Contracts implementing this interface SHOULD register themselves in a well-known on-chain registry so executors can discover them. This ERC does not mandate a specific registry design — registries are implementation-specific and may vary by chain. However, a reference `TaskRegistry` contract is provided as a permissionless public good.

## Rationale

### Why ETH-only bounties?

ETH-only bounties keep the standard simple and maximally useful for executors:

1. **Simulation-friendly**: Executors can `eth_call` simulate `executeTask()` and check their ETH balance delta. If the contract implementation is broken (reverts, insufficient funds), the simulation fails — executors never waste gas on bad implementations.
2. **No token accounting**: No need to handle ERC-20 edge cases (fee-on-transfer, rebasing, approval patterns, non-standard return values).
3. **Universal**: ETH is the native currency on all EVM chains. No dependency on specific token deployments.
4. **Gas-efficient**: Native ETH transfers are cheaper than ERC-20 transfers.

Contracts that wish to offer ERC-20 bounties can do so by wrapping: hold ETH for the bounty, and handle token distribution in their task logic.

### Why block numbers instead of timestamps?

Block numbers are deterministic and monotonically increasing. Timestamps can be slightly manipulated by validators. However, this ERC does not mandate block numbers — `getExecutableTasks()` abstracts the condition check, allowing implementations to use timestamps, oracle prices, or any other condition.

### Why pay the bounty to `msg.sender`?

This is the simplest and most gas-efficient approach. The executor is always the transaction sender. More complex schemes (commit-reveal, auctions) add gas overhead and complexity without proportional benefit for most use cases.

### Why not use Chainlink Automation's `checkUpkeep`/`performUpkeep` pattern?

Chainlink's interface couples the check and execution into a two-phase pattern designed for their specific off-chain node architecture. Our interface separates discovery (`getExecutableTasks()` — a view function) from execution (`executeTask()` — a state-changing function). This is simpler, more gas-efficient for on-chain checks, and doesn't assume any specific off-chain architecture.

### Why sequential task IDs?

Sequential IDs enable efficient enumeration and bounded iteration. Executors can iterate from 0 to `taskCount()` to find all tasks, or use `getExecutableTasks()` for a pre-filtered list.

### Why no cancel function in the interface?

Cancellation logic is implementation-specific. Some contracts may allow only the owner to cancel, others may allow anyone, and some may not allow cancellation at all. The `TaskCancelled` event is standardized so executors can track cancellations, but the cancel mechanism itself is left to implementors.

### Competition and MEV

Multiple executors will race to execute tasks. This is by design — it mirrors how MEV searchers operate and ensures tasks get executed promptly. The first valid transaction wins the bounty. Implementors who wish to mitigate front-running MAY implement commit-reveal schemes or use private mempools, but this is outside the scope of this standard.

## Backwards Compatibility

This ERC introduces a new interface with no backwards compatibility issues. Existing contracts can be wrapped in an adapter contract that implements `IERC_ExternallyExecutableBounty` to make them discoverable by executors.

## Reference Implementation

A complete reference implementation is available at [github.com/yashutanna/externally-executable-bounty](https://github.com/yashutanna/externally-executable-bounty), including:

- **`ScheduledTaskBase.sol`** — Abstract base contract with task lifecycle, CEI pattern, ReentrancyGuard, and ETH bounty payments
- **`TaskRegistry.sol`** — Permissionless on-chain discovery registry (deployed as a public good with no owner and no fees)
- **`DeadMansSwitch.sol`** — Example: transfer funds to beneficiary if owner doesn't check in
- **`ScheduledPayment.sol`** — Example: one-shot and recurring ETH payments
- **`executor/bot.ts`** — Reference executor bot in TypeScript

The TaskRegistry is deployed at the same address on Ethereum, Base, and Arbitrum via CREATE2:
`0x4B094F689e3edeDd04C439f1BeCDE8b4C800482B`

### Abstract Base Contract

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

import {IERC_ExternallyExecutableBounty} from "./IERC_ExternallyExecutableBounty.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

abstract contract ScheduledTaskBase is IERC_ExternallyExecutableBounty, ReentrancyGuard, ERC165 {
    enum TaskStatus { Pending, Executed, Cancelled }
    enum TaskType { OneShot, Recurring }

    struct Task {
        uint256 executeAfterBlock;
        uint256 bountyAmount;
        TaskStatus status;
        TaskType taskType;
        uint256 intervalBlocks;
        bytes data;
    }

    Task[] internal _tasks;

    error TaskNotReady(uint256 taskId, uint256 currentBlock, uint256 requiredBlock);
    error TaskNotPending(uint256 taskId);
    error BountyTransferFailed();

    function supportsInterface(bytes4 interfaceId)
        public view virtual override returns (bool)
    {
        return interfaceId == type(IERC_ExternallyExecutableBounty).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function getExecutableTasks() external view override returns (uint256[] memory) {
        uint256 len = _tasks.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_isExecutable(i)) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_isExecutable(i)) result[idx++] = i;
        }
        return result;
    }

    function taskBounty(uint256 taskId) external view override returns (uint256) {
        return _tasks[taskId].bountyAmount;
    }

    function taskCount() external view override returns (uint256) {
        return _tasks.length;
    }

    function executeTask(uint256 taskId) external override nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.status != TaskStatus.Pending) revert TaskNotPending(taskId);
        if (block.number <= t.executeAfterBlock)
            revert TaskNotReady(taskId, block.number, t.executeAfterBlock);

        // Cache bounty before state changes
        uint256 bountyAmount = t.bountyAmount;

        // CEI: update state before external calls
        if (t.taskType == TaskType.Recurring && t.intervalBlocks > 0) {
            t.executeAfterBlock = block.number + t.intervalBlocks;
        } else {
            t.status = TaskStatus.Executed;
        }

        // Execute task logic (defined by inheritor)
        _onTaskExecuted(taskId, t.data);

        // Pay executor in native ETH
        if (bountyAmount > 0) {
            (bool ok, ) = payable(msg.sender).call{value: bountyAmount}("");
            if (!ok) revert BountyTransferFailed();
        }

        emit TaskExecuted(taskId, msg.sender, bountyAmount);

        if (t.taskType == TaskType.Recurring && t.intervalBlocks > 0) {
            emit TaskCreated(taskId, t.executeAfterBlock, bountyAmount);
        }
    }

    function _createTask(
        uint256 executeAfterBlock,
        uint256 bountyAmount,
        TaskType taskType,
        uint256 intervalBlocks,
        bytes memory data
    ) internal returns (uint256 taskId) {
        taskId = _tasks.length;
        _tasks.push(Task(executeAfterBlock, bountyAmount,
            TaskStatus.Pending, taskType, intervalBlocks, data));
        emit TaskCreated(taskId, executeAfterBlock, bountyAmount);
    }

    function _cancelTask(uint256 taskId) internal {
        if (_tasks[taskId].status != TaskStatus.Pending) revert TaskNotPending(taskId);
        _tasks[taskId].status = TaskStatus.Cancelled;
        emit TaskCancelled(taskId);
    }

    function _isExecutable(uint256 taskId) internal view returns (bool) {
        Task storage t = _tasks[taskId];
        return t.status == TaskStatus.Pending && block.number > t.executeAfterBlock;
    }

    /// @notice Override to define task execution logic
    function _onTaskExecuted(uint256 taskId, bytes memory data) internal virtual;

    receive() external payable {}
}
```

### Example: Dead Man's Switch

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

import {ScheduledTaskBase} from "./ScheduledTaskBase.sol";

contract DeadMansSwitch is ScheduledTaskBase {
    address public owner;
    address public beneficiary;
    uint256 public checkInIntervalBlocks;
    uint256 public switchTaskId;

    constructor(address _beneficiary, uint256 _interval, uint256 _bounty) payable {
        owner = msg.sender;
        beneficiary = _beneficiary;
        checkInIntervalBlocks = _interval;
        switchTaskId = _createTask(
            block.number + _interval, _bounty,
            TaskType.OneShot, 0, abi.encode(_beneficiary)
        );
    }

    function checkIn() external {
        require(msg.sender == owner);
        require(_tasks[switchTaskId].status == TaskStatus.Pending);
        _tasks[switchTaskId].executeAfterBlock = block.number + checkInIntervalBlocks;
    }

    function _onTaskExecuted(uint256 _taskId, bytes memory data) internal override {
        address _ben = abi.decode(data, (address));
        uint256 bountyAmt = _tasks[_taskId].bountyAmount;
        uint256 bal = address(this).balance;
        uint256 remaining = bal > bountyAmt ? bal - bountyAmt : 0;
        if (remaining > 0) {
            (bool ok, ) = payable(_ben).call{value: remaining}("");
            require(ok);
        }
    }
}
```

## Security Considerations

### Reentrancy

The bounty payment in `executeTask()` transfers ETH to `msg.sender`, which may be a contract. Implementations MUST use reentrancy guards and follow the Checks-Effects-Interactions pattern (update task state before external calls). The reference implementation uses OpenZeppelin's `ReentrancyGuard` and caches bounty amounts before state transitions.

### Implementor Footgun: Task Logic Draining Bounty Funds

If an inheritor's `_onTaskExecuted()` sends away all contract ETH, the subsequent bounty transfer to the executor will fail, reverting the entire transaction. The task becomes permanently stuck. Implementors MUST ensure sufficient ETH remains after task execution to cover the bounty. The reference `DeadMansSwitch` example demonstrates this pattern by subtracting the bounty amount before transferring remaining funds.

### Bounty Funding

Implementing contracts MUST ensure sufficient ETH exists to pay bounties. If a contract runs out of funds, `executeTask()` will revert, and the task will remain unexecuted until funded. Executors SHOULD simulate execution via `eth_call` before submitting transactions — a failed simulation indicates the task cannot be profitably executed (broken implementation, insufficient funds, etc.).

### Gas Griefing

Malicious contracts could implement `_onTaskExecuted()` to consume excessive gas, causing executor transactions to fail or be unprofitable. Executors SHOULD estimate gas before execution and verify that `bounty > gasEstimate * gasPrice` before submitting.

### Front-Running

Executor transactions are visible in the mempool. Sophisticated actors may front-run bounty claims. This is inherent to any on-chain bounty system and is analogous to MEV extraction. For high-value bounties, executors MAY use private transaction submission (e.g., Flashbots Protect, MEV Blocker).

### Task Discovery DoS

`getExecutableTasks()` iterates over all tasks. Contracts with a very large number of tasks may make this function expensive to call off-chain. Implementations with many tasks SHOULD provide additional view functions for paginated discovery.

### Registry Reentrancy

On-chain registries that validate contracts via external calls (e.g., calling `taskCount()` during registration) MUST follow the CEI pattern — reserve the registration slot before making the external call to prevent duplicate registration via reentrancy.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
