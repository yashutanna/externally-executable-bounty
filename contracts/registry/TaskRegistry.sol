// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExternallyExecutableBounty} from "../interfaces/IExternallyExecutableBounty.sol";

/// @title TaskRegistry — Permissionless on-chain discovery for EXB contracts
/// @notice A public good registry with no owner, no fees, no admin.
///         Anyone can register a contract implementing IExternallyExecutableBounty.
///         Only the original registrant can deregister their entry.
contract TaskRegistry {
    struct Entry {
        address contractAddr;
        address registrant;
        uint256 registeredAt;
        bool active;
    }

    Entry[] public entries;
    mapping(address => uint256) public contractToId; // contract addr → entry index + 1 (0 = not registered)

    event Registered(uint256 indexed id, address indexed contractAddr, address indexed registrant);
    event Deregistered(uint256 indexed id, address indexed contractAddr);

    error AlreadyRegistered(address contractAddr);
    error NotRegistered(address contractAddr);
    error NotRegistrant();
    error InvalidContract();

    /// @notice Register a contract that implements IExternallyExecutableBounty
    /// @param contractAddr The contract to register
    function register(address contractAddr) external returns (uint256 id) {
        if (contractToId[contractAddr] != 0) revert AlreadyRegistered(contractAddr);

        // CEI: reserve slot BEFORE external call to prevent reentrancy duplication.
        // If taskCount() re-enters register(), AlreadyRegistered will catch it.
        id = entries.length;
        entries.push(Entry({
            contractAddr: contractAddr,
            registrant: msg.sender,
            registeredAt: block.timestamp,
            active: true
        }));
        contractToId[contractAddr] = id + 1; // +1 so 0 means "not found"

        // Interface validation (external call — reentrancy safe due to mapping set above)
        // If this reverts, the entire tx rolls back including the push.
        try IExternallyExecutableBounty(contractAddr).taskCount() {} catch {
            revert InvalidContract();
        }

        emit Registered(id, contractAddr, msg.sender);
    }

    /// @notice Deregister a contract (only the original registrant)
    function deregister(address contractAddr) external {
        uint256 raw = contractToId[contractAddr];
        if (raw == 0) revert NotRegistered(contractAddr);
        uint256 id = raw - 1;
        Entry storage e = entries[id];
        if (msg.sender != e.registrant) revert NotRegistrant();

        e.active = false;
        delete contractToId[contractAddr];

        emit Deregistered(id, contractAddr);
    }

    /// @notice Get all active registered contracts
    function getActiveContracts() external view returns (address[] memory) {
        uint256 len = entries.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (entries[i].active) count++;
        }
        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            if (entries[i].active) {
                result[idx++] = entries[i].contractAddr;
            }
        }
        return result;
    }

    /// @notice Paginated version for large registries
    /// @param offset Start index
    /// @param limit Max results to return
    function getActiveContractsPaginated(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 len = entries.length;
        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        uint256 count = 0;
        for (uint256 i = offset; i < end; i++) {
            if (entries[i].active) count++;
        }
        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = offset; i < end; i++) {
            if (entries[i].active) {
                result[idx++] = entries[i].contractAddr;
            }
        }
        return result;
    }

    /// @notice Total entries (including inactive)
    function entryCount() external view returns (uint256) {
        return entries.length;
    }
}
