// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Land NFT contract
/// @author vlad161_main
/// @notice The contract is for gaming purposes only. It is used for minting and managing NFT lands
/// @dev There are some non-standard functions for ERC721: changeAdmin, batchTransfer, batchMint


import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721, ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract LandNFT is ERC721, ERC721Enumerable, Ownable {

    /// @dev admin is another contract with its own rules. After deployment admin=owner, then will be changed 
    /// @dev maxSupply is max NFTs for minting. It cannot be changed after deployment

    address public admin;
    uint256 public constant maxSupply = 1_000_000;
    string public baseURI;
    bool private _contractStatus;

	 
    constructor(address initialOwner) ERC721("Lands", "LND") Ownable(initialOwner) {
      admin = msg.sender;
      _contractStatus = true;
    }

    error MaxSupplyOverflow(uint256 requested, uint256 available);
    error InvalidReceiver(address receiver);
    error ContractPaused();
    error NotAdministrator();
    error InvalidAddress();
    
    event Paused(uint256 timestamp, address sender);
    event AdminChanged(address previousAdmin, address newAdmin);
    event BaseURIChanged(string newURI);

    modifier onlyAdmin() {
      if (msg.sender != admin){
        revert NotAdministrator();
      }
      _;
    } 

    modifier onlyOwnerOrAdmin() {
      if (msg.sender != admin && msg.sender != owner()){
        revert NotAdministrator();
      }
      _;
    }
   
    modifier validAddress(address _addr) {
      if (_addr == address(0)){
        revert InvalidAddress();
      }
      _;
    } 

    modifier checkMaxSupply(uint256 amount) {
      if (totalSupply() + amount > maxSupply) {
        revert MaxSupplyOverflow(amount, maxSupply - totalSupply());
      }
      _;
    } 

    modifier checkStatus() {
      if (!_contractStatus) {
        revert ContractPaused();
      }
      _;
    }

    /// @notice Changes the admin address
    /// @param _newAdmin The new admin address
    function changeAdmin(address _newAdmin) external onlyOwnerOrAdmin validAddress(_newAdmin) {
      emit AdminChanged(admin, _newAdmin);
      admin = _newAdmin;
    }
  
    /// @notice Transfers multiple tokens to a single address
    /// @dev Only owner or admin can call this function
    /// @param to The recipient address
    /// @param tokenIdBatch Array of token IDs to transfer
    function batchTransfer(address to, uint256[] calldata tokenIdBatch) external onlyOwnerOrAdmin checkStatus {
      if (to == address(0)) {
        revert InvalidReceiver(address(0));
      }
        
      for (uint256 i = 0; i < tokenIdBatch.length; i++) {
        _update(to, tokenIdBatch[i], _msgSender());
      }
    }

    function returnToAdmin (uint256 _token) external onlyAdmin {
      _update(admin, _token, address(0));
    }

    /// @notice Safely mints a single token
    /// @param to The recipient address
    /// @param tokenId The token ID to mint
    function safeMint(address to, uint256 tokenId) external onlyAdmin checkMaxSupply(1) checkStatus {
      _safeMint(to, tokenId);
    }
    
    /// @notice Checks interface support
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
      return super.supportsInterface(interfaceId);
    }

    /// @notice Mints multiple tokens in a batch
    /// @param to The recipient address
    /// @param tokenIdBatch Array of token IDs to mint
    function batchMint(address to, uint256[] calldata tokenIdBatch) external onlyAdmin checkMaxSupply(tokenIdBatch.length) checkStatus {
      for (uint256 i = 0; i < tokenIdBatch.length; i++) {
			  _safeMint(to, tokenIdBatch[i]);
      }
    }

    /// @notice Sets the base URI for token metadata
    /// @param _newURI The new base URI
    function setBaseURI(string calldata _newURI) external onlyOwner {
      baseURI = _newURI;
      emit BaseURIChanged(_newURI);
    }

    /// @notice Pauses or unpauses the contract
    /// @param status The new pause status (true = paused)
    function pauseContract(bool status) external onlyOwnerOrAdmin {
      _contractStatus = !status;
      emit Paused(block.timestamp, msg.sender);
    }

    /// @notice Returns contract state information
    /// @return contract owner, contract admin, contract status (paused), NFT URI, maxSupply,currentSupply
    function getContractState() external view returns (address, address, bool, string memory, uint256, uint256) {
      return (owner(), admin, _contractStatus, _baseURI(), maxSupply, totalSupply());
    }

    /// @notice Returns owners for a batch of tokens
    /// @param tokenIdBatch Array of token IDs to check
    /// @return owners Array of owner addresses
    function batchOwnerOf(uint256[] calldata tokenIdBatch) external view returns (address[] memory owners) {
      owners = new address[](tokenIdBatch.length);
      for (uint256 i = 0; i < tokenIdBatch.length; i++) {
        owners[i] = _ownerOf(tokenIdBatch[i]);
      }
      return owners;
    }

    /// @notice Returns all tokens owned by an address
    /// @param owner The address to query
    /// @return tokens Array of owned token IDs
    function allOwnedTokens(address owner) external view returns (uint256[] memory tokens) {
      uint256 balance = balanceOf(owner);
      tokens = new uint256[](balance);
      for (uint256 i = 0; i < balance; i++) {
        tokens[i] = tokenOfOwnerByIndex(owner, i);
      }
      return tokens;
    }
    
    function _baseURI() internal view override returns (string memory) {
      return baseURI;
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
      return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
      super._increaseBalance(account, value);
    }

}