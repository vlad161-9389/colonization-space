// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Land NFT contract
/// @author vlad161_main
/// @notice The contract is for gaming purposes only. It is used for minting and managing NFT
/// @dev There are some non-standard functions for ERC721: changeAdmin, batchTransfer, batchMint


import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721, ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract LandNFT is ERC721, ERC721Enumerable, Ownable {
  /// @dev admin is an another contract with each own rules. After deployment admin=owner, than will be changed 
  /// @dev maxSupply is max NFTs for minting. It can not be changed after deployment

  address admin;
  uint maxSupply=1000000;
  string URI;
  bool private _contractStatus;

     
  constructor(address initialOwner) ERC721("Lands", "LND") Ownable(initialOwner) {
    admin=msg.sender;
    _contractStatus=true;
  }

  error MaxSupplyOverflow(uint256 count);

  event Paused(uint256 time, address sender);
    
  modifier onlyAdmin() {
    require(msg.sender == admin, "Not administrator");
    _;
  } 

  modifier onlyOwnerAdmin (){
    require(msg.sender == admin || msg.sender==owner() , "Not administrator or owner");
    _;
  }
   
  modifier validAddress(address _addr) {
    require(_addr != address(0), "Not valid address");
    _;
  } 

  modifier checkMaxSupply() {
    require(totalSupply()< maxSupply, "Max supply reached");
    _;
  } 

  modifier checkStatus() {
    require(_contractStatus, "Contract is paused");
    _;
  }

     
  /// @notice admin must be another contract with its own consensus
  
  function changeAdmin(address _newAdmin) public onlyOwnerAdmin validAddress(_newAdmin){
    admin = _newAdmin;
  }

  /// @notice if NFT hasn't been used for some time it transfers to Treasury
  /// @dev only another (admin) contract can do it. Treasury should be admin contract but not necessarily
  
  function batchTransfer(address to, uint256[] calldata tokenIdBatch) public onlyOwnerAdmin checkStatus{
    if (to == address(0)) {
      revert ERC721InvalidReceiver(address(0));
    }
    for (uint i=0; i<tokenIdBatch.length; i++){
      uint tokenId=tokenIdBatch[i];
      _update(to, tokenId, _msgSender());
    }
  }

  function safeMint(address to, uint256 tokenId) public onlyAdmin checkMaxSupply checkStatus{
    _safeMint(to, tokenId);
  }
    
  function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }

  /// @notice minting NFT batches
  /// @dev the rules will be in admin contracts. Mint sequence may not be followed
 
  function batchMint (address to, uint256[] calldata tokenIdBatch) public onlyAdmin checkStatus {
    if (maxSupply < totalSupply()+tokenIdBatch.length) {
      revert MaxSupplyOverflow(totalSupply()+tokenIdBatch.length);
    }
    for (uint i=0; i<tokenIdBatch.length; i++){
      uint tokenId=tokenIdBatch[i];
      _safeMint(to, tokenId);
    }
  }

  function setURI (string calldata _URI) public onlyOwner {
    URI=_URI;
  }
  /// @notice if smth goes wrong
  /// @dev admin contract can only change this status to true if there is consensus
  
  function pauseContract (bool status) public onlyOwnerAdmin {
    _contractStatus=status;
    emit Paused (block.timestamp, msg.sender);
  }

  function getContractStatus () public view returns (address, address, bool, string memory, uint, uint) {
    address curentOwner=owner();
    string memory currentURI=_baseURI();
    uint supply=totalSupply();
    return (curentOwner, admin, _contractStatus, currentURI, maxSupply, supply);
  }

  function batchOwnerOf (uint256[] calldata tokenIdBatch) public view returns (address[] memory){
    address [] memory owners=new address[](32);
    if (tokenIdBatch.length<=32){
      for (uint i=0; i<tokenIdBatch.length; i++){
        uint tokenId=tokenIdBatch[i];
        owners[i]=_ownerOf(tokenId);
      }
    }
    return owners;
  }

  function allOwnedTokens (address owner) public view returns (uint256[] memory){
    uint256 index = balanceOf(owner);
    uint256[] memory tokens = new uint256[](index);
    for (uint256 i = 0; i < index-1; i++){
      tokens[i] = tokenOfOwnerByIndex(owner, i);
    }
    return tokens;
  }
    
  function _baseURI() internal override view returns (string memory) {
    return URI;
  }

  function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
    return super._update(to, tokenId, auth);
  }

    
  function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
    super._increaseBalance(account, value);
  }

}