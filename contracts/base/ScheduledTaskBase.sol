// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExternallyExecutableBounty} from "../interfaces/IExternallyExecutableBounty.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ScheduledTaskBase — Abstract base for contracts with scheduled tasks
/// @notice Provides task storage, bounty management, and execution scaffolding.
///         Inheritors define what happens when a task fires via `_onTaskExecuted`.
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
        address bountyToken;        // address(0) = native ETH
        uint256 bountyAmount;
        TaskStatus status;
        TaskType taskType;
        uint256 intervalBlocks;     // For recurring: re-arm after this many blocks (0 = one-shot)
        bytes data;                 // Arbitrary data the inheritor can use
    }

    Task[] internal _tasks;

    /// @notice Revert reasons
    error TaskNotReady(uint256 taskId, uint256 currentBlock, uint256 requiredBlock);
    error TaskNotPending(uint256 taskId);
    error InsufficientBountyBalance();
    error BountyTransferFailed();

    // ─── Views ───────────────────────────────────────────────────────────

    function getExecutableTasks() external view override returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _tasks.length; i++) {
            if (_isExecutable(i)) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _tasks.length; i++) {
            if (_isExecutable(i)) {
                result[idx++] = i;
            }
        }
        return result;
    }

    function taskBounty(uint256 taskId) external view override returns (address token, uint256 amount) {
        Task storage t = _tasks[taskId];
        return (t.bountyToken, t.bountyAmount);
    }

    function taskCount() external view override returns (uint256) {
        return _tasks.length;
    }

    function getTask(uint256 taskId)
        external
        view
        returns (
            uint256 executeAfterBlock,
            address bountyToken,
            uint256 bountyAmount,
            TaskStatus status,
            TaskType taskType,
            uint256 intervalBlocks
        )
    {
        Task storage t = _tasks[taskId];
        return (t.executeAfterBlock, t.bountyToken, t.bountyAmount, t.status, t.taskType, t.intervalBlocks);
    }

    // ─── Execution ──────────────────────────────────────────────────────

    function executeTask(uint256 taskId) external override nonReentrant {
        Task storage t = _tasks[taskId];

        if (t.status != TaskStatus.Pending) revert TaskNotPending(taskId);
        if (block.number <= t.executeAfterBlock) {
            revert TaskNotReady(taskId, block.number, t.executeAfterBlock);
        }

        // Execute the task logic (defined by inheritor)
        _onTaskExecuted(taskId, t.data);

        // Pay the executor
        _payBounty(msg.sender, t.bountyToken, t.bountyAmount);

        emit TaskExecuted(taskId, msg.sender, t.bountyToken, t.bountyAmount);

        // Handle recurring vs one-shot
        if (t.taskType == TaskType.Recurring && t.intervalBlocks > 0) {
            // Re-arm: set next execution block
            t.executeAfterBlock = block.number + t.intervalBlocks;
            emit TaskCreated(taskId, t.executeAfterBlock, t.bountyToken, t.bountyAmount);
        } else {
            t.status = TaskStatus.Executed;
        }
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _createTask(
        uint256 executeAfterBlock,
        address bountyToken,
        uint256 bountyAmount,
        TaskType taskType,
        uint256 intervalBlocks,
        bytes memory data
    ) internal returns (uint256 taskId) {
        taskId = _tasks.length;
        _tasks.push(Task({
            executeAfterBlock: executeAfterBlock,
            bountyToken: bountyToken,
            bountyAmount: bountyAmount,
            status: TaskStatus.Pending,
            taskType: taskType,
            intervalBlocks: intervalBlocks,
            data: data
        }));
        emit TaskCreated(taskId, executeAfterBlock, bountyToken, bountyAmount);
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

    function _payBounty(address executor, address token, uint256 amount) internal {
        if (amount == 0) return;

        if (token == address(0)) {
            // Native ETH
            (bool ok, ) = payable(executor).call{value: amount}("");
            if (!ok) revert BountyTransferFailed();
        } else {
            // ERC20
            bool ok = IERC20(token).transfer(executor, amount);
            if (!ok) revert BountyTransferFailed();
        }
    }

    /// @notice Override this to define what the task actually does
    /// @param taskId The task being executed
    /// @param data Arbitrary data stored with the task
    function _onTaskExecuted(uint256 taskId, bytes memory data) internal virtual;

    /// @notice Accept ETH for bounty funding
    receive() external payable {}
}
