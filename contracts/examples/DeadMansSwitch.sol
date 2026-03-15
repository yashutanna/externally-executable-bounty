// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScheduledTaskBase} from "../base/ScheduledTaskBase.sol";

/// @title DeadMansSwitch — Example: transfer funds to beneficiary if owner doesn't check in
/// @notice Owner must call `checkIn()` before the deadline. If they don't,
///         anyone can execute the task, sending funds to the beneficiary and
///         collecting a bounty for their trouble.
contract DeadMansSwitch is ScheduledTaskBase {
    address public owner;
    address public beneficiary;
    uint256 public checkInIntervalBlocks;
    uint256 public taskId;

    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @param _beneficiary Who receives the funds if the switch triggers
    /// @param _checkInIntervalBlocks How many blocks between required check-ins
    /// @param _bountyAmount ETH bounty for the executor
    constructor(
        address _beneficiary,
        uint256 _checkInIntervalBlocks,
        uint256 _bountyAmount
    ) payable {
        owner = msg.sender;
        beneficiary = _beneficiary;
        checkInIntervalBlocks = _checkInIntervalBlocks;

        // Create a recurring task — if executed, it means owner missed check-in
        // But we override _onTaskExecuted to make it one-shot (sends all funds)
        taskId = _createTask(
            block.number + _checkInIntervalBlocks,
            address(0),         // bounty in ETH
            _bountyAmount,
            TaskType.OneShot,
            0,
            abi.encode(_beneficiary)
        );
    }

    /// @notice Owner checks in, pushing the deadline forward
    function checkIn() external onlyOwner {
        _tasks[taskId].executeAfterBlock = block.number + checkInIntervalBlocks;
    }

    /// @notice What happens when the switch triggers
    function _onTaskExecuted(uint256 /* taskId */, bytes memory data) internal override {
        address _beneficiary = abi.decode(data, (address));
        // Send remaining balance (minus bounty, which is handled by base) to beneficiary
        uint256 remaining = address(this).balance - _tasks[taskId].bountyAmount;
        if (remaining > 0) {
            (bool ok, ) = payable(_beneficiary).call{value: remaining}("");
            require(ok, "Transfer to beneficiary failed");
        }
    }

    /// @notice Owner can withdraw if they want to deactivate
    function withdraw() external onlyOwner {
        _cancelTask(taskId);
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok);
    }
}
