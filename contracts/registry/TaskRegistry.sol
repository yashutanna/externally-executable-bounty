// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExternallyExecutableBounty} from "../interfaces/IExternallyExecutableBounty.sol";

/// @title TaskRegistry — On-chain discovery for IExternallyExecutableBounty contracts
/// @notice Executors scan this registry to find contracts with pending tasks.
///         Anyone can register a contract. Registration is permissionless.
///         A small fee (configurable) prevents spam.
contract TaskRegistry {
    struct Entry {
        address contractAddr;
        address registrant;
        uint256 registeredAt;
        bool active;
    }

    Entry[] public entries;
    mapping(address => uint256) public contractToId; // contract addr → entry index + 1 (0 = not registered)

    address public owner;
    uint256 public registrationFee;

    event Registered(uint256 indexed id, address indexed contractAddr, address indexed registrant);
    event Deregistered(uint256 indexed id, address indexed contractAddr);
    event FeeUpdated(uint256 newFee);

    error AlreadyRegistered(address contractAddr);
    error NotRegistered(address contractAddr);
    error InsufficientFee();
    error NotAuthorized();
    error InvalidContract();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    constructor(uint256 _registrationFee) {
        owner = msg.sender;
        registrationFee = _registrationFee;
    }

    /// @notice Register a contract that implements IExternallyExecutableBounty
    /// @param contractAddr The contract to register
    function register(address contractAddr) external payable returns (uint256 id) {
        if (msg.value < registrationFee) revert InsufficientFee();
        if (contractToId[contractAddr] != 0) revert AlreadyRegistered(contractAddr);

        // Basic interface check: must respond to taskCount()
        try IExternallyExecutableBounty(contractAddr).taskCount() {} catch {
            revert InvalidContract();
        }

        id = entries.length;
        entries.push(Entry({
            contractAddr: contractAddr,
            registrant: msg.sender,
            registeredAt: block.timestamp,
            active: true
        }));
        contractToId[contractAddr] = id + 1; // +1 so 0 means "not found"

        emit Registered(id, contractAddr, msg.sender);
    }

    /// @notice Deregister a contract (only registrant or registry owner)
    function deregister(address contractAddr) external {
        uint256 raw = contractToId[contractAddr];
        if (raw == 0) revert NotRegistered(contractAddr);
        uint256 id = raw - 1;
        Entry storage e = entries[id];
        if (msg.sender != e.registrant && msg.sender != owner) revert NotAuthorized();

        e.active = false;
        delete contractToId[contractAddr];

        emit Deregistered(id, contractAddr);
    }

    /// @notice Get all active registered contracts
    function getActiveContracts() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].active) count++;
        }
        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < entries.length; i++) {
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

    // ─── Admin ──────────────────────────────────────────────────────────

    function setFee(uint256 _fee) external onlyOwner {
        registrationFee = _fee;
        emit FeeUpdated(_fee);
    }

    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
