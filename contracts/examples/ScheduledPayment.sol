// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScheduledTaskBase} from "../base/ScheduledTaskBase.sol";

/// @title ScheduledPayment — Example: recurring ETH payments (payroll, subscriptions, vesting)
/// @notice Schedule ETH payments that anyone can trigger once due.
contract ScheduledPayment is ScheduledTaskBase {
    address public owner;

    error OnlyOwner();
    error ZeroRecipient();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Schedule a one-time ETH payment
    /// @param recipient Who receives the payment
    /// @param amount Payment amount in wei
    /// @param executeAfterBlock Block after which this can be executed
    /// @param bountyAmount ETH bounty for executor
    function schedulePayment(
        address recipient,
        uint256 amount,
        uint256 executeAfterBlock,
        uint256 bountyAmount
    ) external onlyOwner returns (uint256) {
        if (recipient == address(0)) revert ZeroRecipient();
        if (amount == 0) revert ZeroAmount();
        return _createTask(
            executeAfterBlock,
            bountyAmount,
            TaskType.OneShot,
            0,
            abi.encode(recipient, amount)
        );
    }

    /// @notice Schedule a recurring ETH payment
    function scheduleRecurringPayment(
        address recipient,
        uint256 amount,
        uint256 executeAfterBlock,
        uint256 intervalBlocks,
        uint256 bountyAmount
    ) external onlyOwner returns (uint256) {
        if (recipient == address(0)) revert ZeroRecipient();
        if (amount == 0) revert ZeroAmount();
        return _createTask(
            executeAfterBlock,
            bountyAmount,
            TaskType.Recurring,
            intervalBlocks,
            abi.encode(recipient, amount)
        );
    }

    /// @notice Cancel a pending payment
    function cancelPayment(uint256 taskId) external onlyOwner {
        _cancelTask(taskId);
    }

    function _onTaskExecuted(uint256 /* taskId */, bytes memory data) internal override {
        (address recipient, uint256 amount) = abi.decode(data, (address, uint256));
        (bool ok, ) = payable(recipient).call{value: amount}("");
        require(ok, "Payment failed");
    }

    /// @notice Owner can withdraw ETH
    function withdraw(uint256 amount) external onlyOwner {
        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok);
    }
}
