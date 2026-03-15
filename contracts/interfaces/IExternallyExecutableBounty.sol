// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IExternallyExecutableBounty — Standard interface for permissionless scheduled execution
/// @notice Any contract implementing this interface can have its tasks executed by
///         anyone, with the executor receiving a bounty on successful execution.
/// @dev Executors call `getExecutableTasks()` (view, free) to discover ready tasks,
///      then call `executeTask(taskId)` to execute and claim the bounty.
interface IExternallyExecutableBounty {
    /// @notice Emitted when a new task is registered
    event TaskCreated(uint256 indexed taskId, uint256 executeAfterBlock, uint256 bountyAmount);

    /// @notice Emitted when a task is successfully executed
    event TaskExecuted(uint256 indexed taskId, address indexed executor, uint256 bountyAmount);

    /// @notice Emitted when a task is cancelled by the owner
    event TaskCancelled(uint256 indexed taskId);

    /// @notice Returns all task IDs that are currently executable
    /// @return taskIds Array of task IDs ready for execution
    function getExecutableTasks() external view returns (uint256[] memory taskIds);

    /// @notice Execute a scheduled task and claim the bounty
    /// @dev MUST revert if task is not yet executable (block not reached, etc.)
    /// @dev MUST transfer bounty to msg.sender on success
    /// @dev MUST emit TaskExecuted on success
    /// @param taskId The ID of the task to execute
    function executeTask(uint256 taskId) external;

    /// @notice Get the bounty amount for a task (native ETH)
    /// @param taskId The task ID to query
    /// @return amount The bounty amount in wei
    function taskBounty(uint256 taskId) external view returns (uint256 amount);

    /// @notice Get the total number of tasks (including completed/cancelled)
    function taskCount() external view returns (uint256);
}
