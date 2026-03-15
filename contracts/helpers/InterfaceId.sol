// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExternallyExecutableBounty} from "../interfaces/IExternallyExecutableBounty.sol";

/// @notice Helper to compute the ERC-165 interface ID for IExternallyExecutableBounty
contract InterfaceId {
    function getInterfaceId() external pure returns (bytes4) {
        return type(IExternallyExecutableBounty).interfaceId;
    }
}
