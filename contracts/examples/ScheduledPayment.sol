// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScheduledTaskBase} from "../base/ScheduledTaskBase.sol";

/// @title ScheduledPayment — Example: recurring payments (payroll, subscriptions, vesting)
/// @notice Schedule ETH or ERC20 payments that anyone can trigger once due.
contract ScheduledPayment is ScheduledTaskBase {
    address public owner;

    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Schedule a one-time payment
    /// @param recipient Who receives the payment
    /// @param amount Payment amount
    /// @param paymentToken Token address (address(0) for ETH)
    /// @param executeAfterBlock Block after which this can be executed
    /// @param bountyToken Bounty token for executor
    /// @param bountyAmount Bounty for executor
    function schedulePayment(
        address recipient,
        uint256 amount,
        address paymentToken,
        uint256 executeAfterBlock,
        address bountyToken,
        uint256 bountyAmount
    ) external onlyOwner returns (uint256) {
        return _createTask(
            executeAfterBlock,
            bountyToken,
            bountyAmount,
            TaskType.OneShot,
            0,
            abi.encode(recipient, amount, paymentToken)
        );
    }

    /// @notice Schedule a recurring payment
    function scheduleRecurringPayment(
        address recipient,
        uint256 amount,
        address paymentToken,
        uint256 executeAfterBlock,
        uint256 intervalBlocks,
        address bountyToken,
        uint256 bountyAmount
    ) external onlyOwner returns (uint256) {
        return _createTask(
            executeAfterBlock,
            bountyToken,
            bountyAmount,
            TaskType.Recurring,
            intervalBlocks,
            abi.encode(recipient, amount, paymentToken)
        );
    }

    /// @notice Cancel a pending payment
    function cancelPayment(uint256 taskId) external onlyOwner {
        _cancelTask(taskId);
    }

    function _onTaskExecuted(uint256 /* taskId */, bytes memory data) internal override {
        (address recipient, uint256 amount, address paymentToken) = abi.decode(data, (address, uint256, address));

        if (paymentToken == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            require(ok, "Payment failed");
        } else {
            // Use low-level call for ERC20 transfer
            (bool ok, bytes memory ret) = paymentToken.call(
                abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
            );
            require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "ERC20 payment failed");
        }
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool ok, ) = payable(owner).call{value: amount}("");
            require(ok);
        } else {
            (bool ok, ) = token.call(
                abi.encodeWithSignature("transfer(address,uint256)", owner, amount)
            );
            require(ok);
        }
    }
}
