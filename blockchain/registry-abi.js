export const DID_REGISTRY_ABI = Object.freeze([
  'function owner() view returns (address)',
  'function registerDid(bytes32 didHash, bytes32 documentHash, address controller)',
  'function updateDid(bytes32 didHash, bytes32 documentHash, address controller)',
  'function deactivateDid(bytes32 didHash)',
  'function resolveDid(bytes32 didHash) view returns (address controller, bytes32 documentHash, uint64 version, bool deactivated, uint64 updatedAt)',
  'event DidRegistered(bytes32 indexed didHash, bytes32 indexed documentHash, uint64 version, address controller)',
  'event DidUpdated(bytes32 indexed didHash, bytes32 indexed documentHash, uint64 version, address controller)',
  'event DidDeactivated(bytes32 indexed didHash, uint64 version)',
]);
