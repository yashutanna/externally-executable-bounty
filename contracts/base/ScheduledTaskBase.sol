// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExternallyExecutableBounty} from "../interfaces/IExternallyExecutableBounty.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ScheduledTaskBase — Abstract base for contracts with scheduled tasks
/// @notice Provides task storage, bounty management, and execution scaffolding.
///         Inheritors define what happens when a task fires via `_onTaskExecuted`.
///         Bounties are paid in native ETH only.
abstract contract ScheduledTaskBase is IExternallyExecutableBounty, ReentrancyGuard {
    enum TaskStatus {
        Pending,
        Executed,
        Cancelled
    }

    enum TaskType {
        OneShot,
        Recurring
    }

    struct Task {
        uint256 executeAfterBlock;  // Task becomes executable after this block
        uint256 bountyAmount;       // Bounty in native ETH (wei)
        TaskStatus status;
        TaskType taskType;
        uint256 intervalBlocks;     // For recurring: re-arm after this many blocks (0 = one-shot)
        bytes data;                 // Arbitrary data the inheritor can use
    }

    Task[] internal _tasks;

    /// @notice Revert reasons
    error TaskNotReady(uint256 taskId, uint256 currentBlock, uint256 requiredBlock);
    error TaskNotPending(uint256 taskId);
    error BountyTransferFailed();

    // ─── Views ───────────────────────────────────────────────────────────

    function getExecutableTasks() external view override returns (uint256[] memory) {
        uint256 len = _tasks.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_isExecutable(i)) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_isExecutable(i)) {
                result[idx++] = i;
            }
        }
        return result;
    }

    /// @notice Paginated version for contracts with many tasks
    /// @param offset Start index
    /// @param limit Max results to return
    function getExecutableTasksPaginated(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        uint256 len = _tasks.length;
        if (offset >= len) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        uint256 count = 0;
        for (uint256 i = offset; i < end; i++) {
            if (_isExecutable(i)) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = offset; i < end; i++) {
            if (_isExecutable(i)) {
                result[idx++] = i;
            }
        }
        return result;
    }

    function taskBounty(uint256 taskId) external view override returns (uint256 amount) {
        return _tasks[taskId].bountyAmount;
    }

    function taskCount() external view override returns (uint256) {
        return _tasks.length;
    }

    function getTask(uint256 taskId)
        external
        view
        returns (
            uint256 executeAfterBlock,
            uint256 bountyAmount,
            TaskStatus status,
            TaskType taskType,
            uint256 intervalBlocks
        )
    {
        Task storage t = _tasks[taskId];
        return (t.executeAfterBlock, t.bountyAmount, t.status, t.taskType, t.intervalBlocks);
    }

    // ─── Execution ──────────────────────────────────────────────────────

    function executeTask(uint256 taskId) external override nonReentrant {
        Task storage t = _tasks[taskId];

        if (t.status != TaskStatus.Pending) revert TaskNotPending(taskId);
        if (block.number <= t.executeAfterBlock) {
            revert TaskNotReady(taskId, block.number, t.executeAfterBlock);
        }

        // Cache bounty before execution
        uint256 bountyAmount = t.bountyAmount;

        // Update state BEFORE external calls (CEI pattern)
        if (t.taskType == TaskType.Recurring && t.intervalBlocks > 0) {
            t.executeAfterBlock = block.number + t.intervalBlocks;
        } else {
            t.status = TaskStatus.Executed;
        }

        // Execute the task logic (defined by inheritor)
        _onTaskExecuted(taskId, t.data);

        // Pay the executor in native ETH
        if (bountyAmount > 0) {
            (bool ok, ) = payable(msg.sender).call{value: bountyAmount}("");
            if (!ok) revert BountyTransferFailed();
        }

        emit TaskExecuted(taskId, msg.sender, bountyAmount);

        // Emit re-arm event for recurring
        if (t.taskType == TaskType.Recurring && t.intervalBlocks > 0) {
            emit TaskCreated(taskId, t.executeAfterBlock, bountyAmount);
        }
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _createTask(
        uint256 executeAfterBlock,
        uint256 bountyAmount,
        TaskType taskType,
        uint256 intervalBlocks,
        bytes memory data
    ) internal returns (uint256 taskId) {
        taskId = _tasks.length;
        _tasks.push(Task({
            executeAfterBlock: executeAfterBlock,
            bountyAmount: bountyAmount,
            status: TaskStatus.Pending,
            taskType: taskType,
            intervalBlocks: intervalBlocks,
            data: data
        }));
        emit TaskCreated(taskId, executeAfterBlock, bountyAmount);
    }

    function _cancelTask(uint256 taskId) internal {
        Task storage t = _tasks[taskId];
        if (t.status != TaskStatus.Pending) revert TaskNotPending(taskId);
        t.status = TaskStatus.Cancelled;
        emit TaskCancelled(taskId);
    }

    function _isExecutable(uint256 taskId) internal view returns (bool) {
        Task storage t = _tasks[taskId];
        return t.status == TaskStatus.Pending && block.number > t.executeAfterBlock;
    }

    /// @notice Override this to define what the task actually does
    function _onTaskExecuted(uint256 taskId, bytes memory data) internal virtual;

    /// @notice Accept ETH for bounty funding
    receive() external payable {}
}
