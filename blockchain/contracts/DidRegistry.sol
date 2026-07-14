// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal public anchor for an Issuer DID. No private key, VC, or PII is stored on-chain.
contract DidRegistry {
    struct DidRecord {
        address controller;
        bytes32 documentHash;
        uint64 version;
        bool deactivated;
        uint64 updatedAt;
    }

    address public immutable owner;
    mapping(bytes32 => DidRecord) private records;

    event DidRegistered(bytes32 indexed didHash, bytes32 indexed documentHash, uint64 version, address controller);
    event DidUpdated(bytes32 indexed didHash, bytes32 indexed documentHash, uint64 version, address controller);
    event DidDeactivated(bytes32 indexed didHash, uint64 version);

    modifier onlyOwner() {
        require(msg.sender == owner, "registry owner required");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerDid(bytes32 didHash, bytes32 documentHash, address controller) external onlyOwner {
        require(records[didHash].version == 0, "DID already registered");
        require(controller != address(0), "controller required");
        records[didHash] = DidRecord(controller, documentHash, 1, false, uint64(block.timestamp));
        emit DidRegistered(didHash, documentHash, 1, controller);
    }

    function updateDid(bytes32 didHash, bytes32 documentHash, address controller) external onlyOwner {
        DidRecord storage record = records[didHash];
        require(record.version != 0, "DID not registered");
        require(!record.deactivated, "DID deactivated");
        require(controller != address(0), "controller required");
        record.documentHash = documentHash;
        record.controller = controller;
        record.version += 1;
        record.updatedAt = uint64(block.timestamp);
        emit DidUpdated(didHash, documentHash, record.version, controller);
    }

    function deactivateDid(bytes32 didHash) external onlyOwner {
        DidRecord storage record = records[didHash];
        require(record.version != 0, "DID not registered");
        require(!record.deactivated, "DID already deactivated");
        record.deactivated = true;
        record.version += 1;
        record.updatedAt = uint64(block.timestamp);
        emit DidDeactivated(didHash, record.version);
    }

    function resolveDid(bytes32 didHash) external view returns (DidRecord memory) {
        return records[didHash];
    }
}
