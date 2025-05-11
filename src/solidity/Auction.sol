// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Control contract for the game Colonization
/// @author vlad161_main
/// @notice The contract is for gaming purposes only. It is used for managing of the game dinamics

/// @dev some functions of NFT contract can be executed only with this contract

interface NFTcontract {
    function balanceOf (address owner) external view returns (uint256);
    function safeMint (address to, uint256 tokenId) external;
    function ownerOf (uint256 tokenId) external view returns (address);
    function safeTransferFrom (address from, address to, uint256 tokenId) external;
}

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract Auction is Ownable, IERC721Receiver {
    NFTcontract NFT;

    /// @dev applicationFees is mapping of structs with the deposited sums and prices for each land NFT
    /// @dev addressesApplication is reversed mapping for applicationFees
    /// @dev userRating is current rating for applicants. Rating updates daily
    /// @dev userFines contains fines for users whcih don't claim NFT in time
    /// @dev NFTWinners contains users who can transfer NFTs

    mapping(uint256 => landForSale) landsForSale;
    mapping(address => uint256) userRating;
    mapping(address => uint256) userFines;
    mapping(address => uint256[]) userApplications;
    
    uint256 [] landsForSaleArray;
    address [] applicantsArray;
    uint256 [] landsForTransferArray;
    
    settings gameSettings;
    rating ratingRatio;
   
    /// @notice general settings of the current contract
    struct settings{
        uint256 minDeposit;
        uint256 minPrice;
        uint256 endDate;
        uint256 mintPeriod;
        uint256 auctionNumber;
        address admin;
        address oracle;
    }

    struct landForSale{
        uint256 deposit;
        uint256 minPrice;
        applicants[] applicants;
        address winner;
        uint256 date;
        bool status;
        bool sold;
    }

    struct applicants {
        address applicant;
        uint256 deposite;
        uint256 price;
    }
    
    /// @notice Ratings for pricing NFTs
    struct rating {
        uint256 userBalance;
        uint256 transactions;
        uint256 firstDate;
        uint256 stackingBalance;
        uint256 communityToken;
        uint256 lockedCommunityToken;
        uint256 lockedDays;
        uint256 otherTokens;
        uint256 NFT_Land;
    }

    struct auction {
        uint256[] lands;
        uint256 endDate;
    }

    constructor(address initialOwner, address _NFTcontractAddress) Ownable(initialOwner) {
        gameSettings.admin = msg.sender;
        gameSettings.oracle = msg.sender;
        gameSettings.minDeposit = 1;
        gameSettings.minPrice = 10;
        gameSettings.mintPeriod = 604800;
        NFT = NFTcontract(_NFTcontractAddress);
        
        ratingRatio = rating(12, 15, 12, 17, 15, 17, 20, 11, 13);
    }

    modifier onlyAdmin() {
        require(msg.sender == gameSettings.admin, "Not administrator");
        _;
    }

    modifier onlyOwnerAdmin () {
        require(msg.sender == gameSettings.admin || msg.sender==owner() , "Not administrator or owner");
        _;
    } 
    /// @notice in this contact admin can execute some functions 
    modifier onlyOracle () {
        require(msg.sender == gameSettings.oracle || msg.sender==gameSettings.admin , "Not administrator or oracle");
        _; 
    } 

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Not valid address");
        _; 
    } 
    
    
    event ChangeAdminSucsess (address sender, address newAdmin);
    event ChangeOracleSucsess (address sender, address newAdmin);
    event ChangeSettingsSucsess (address sender, uint256[3] settings);
    event TokensReceived (address sender, uint256 amount);
    event TokensWithdrawn (address sender, address recipient, uint256 amount);

    function onERC721Received (address operator, address from, uint256 tokenId, bytes calldata data) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function getContractStatus () public view returns (address, address, address, uint256, uint256, uint256, uint256) {
        address curentOwner=owner();
        return (curentOwner, gameSettings.admin, gameSettings.oracle, gameSettings.minDeposit, gameSettings.minPrice, gameSettings.mintPeriod, gameSettings.auctionNumber);
    }
    /// @notice auction part

    /// @notice new auction 
    function startReceivingApplications (uint256 _endDate, uint256 [] calldata _NFTs) public onlyOwnerAdmin returns (uint256[] memory) {
        uint256[] memory newLands = new uint256[] (_NFTs.length);
        bool addAuction = false;
        for (uint256 i = 0; i < _NFTs.length; i++){
            uint256 land = _NFTs[i];
            if (landsForSale[land].date == 0){
                address owner;
                try NFT.ownerOf(land) {
                    owner = NFT.ownerOf(land);
                } catch{
                    owner = address(0);
                }
                if (owner == address(0)){
                    NFT.safeMint(address(this), land);
                    owner = NFT.ownerOf(land);
                }
                if (owner == address(this)){
                    landsForSale[land].deposit = gameSettings.minDeposit;
                    landsForSale[land].minPrice =  gameSettings.minPrice;
                    landsForSale[land].date = _endDate;
                    landsForSale[land].status = true;
                    landsForSale[land].sold = false;
                    newLands[i] = land;
                    landsForSaleArray.push (land);
                    addAuction = true;
                }
            }
        }
        if (addAuction){
           gameSettings.auctionNumber++;
        }
        return newLands;
    }

    /// @notice applying for NFT
    function applicationNFT (uint256 _land) public payable returns (bool) {
        require (landsForSale[_land].status == true, "This land is not for sale");
        require (landsForSale[_land].date > block.timestamp, "Time has expired, you can't make a bet");
        uint256 deposite = depositeForSender ();
        uint256 price = NFTpriceForSender ();
        require (deposite <= msg.value , "Insufficient funds");
        require(checkApplication (msg.sender, _land), "Re-bids are forbidden");
        addApplicationFees (_land, deposite, price);
        addAddressesApplication ();
        userApplications[msg.sender].push (_land);
        return true;
    }

    function depositeForSender () public view returns (uint256){
        uint256 x = userApplications[msg.sender].length + 1;
        return (gameSettings.minDeposit + 2**(x-1)/2*(1 + userFines[msg.sender])) * 1 ether;
    }

    function NFTpriceForSender () public view returns (uint256){
        uint256 wins = 0;
        uint256 applications = 0;
        for (uint256 i = 0; i < landsForTransferArray.length; i++){
            uint256 _land = landsForTransferArray[i];
            if (landsForSale[_land].winner == msg.sender && landsForSale[_land].status == false){
                wins++;
            }
        }
        for (uint256 i = 0; i < landsForSaleArray.length; i++){
            uint256 _land = landsForSaleArray[i];
            for (uint256 j = 0; j < landsForSale[_land].applicants.length; j++){
                if (landsForSale[_land].applicants[j].applicant == msg.sender && landsForSale[_land].status == true){
                    applications++;
                }

            }
        }
        return (gameSettings.minPrice + 2**wins + applications) * 1 ether;
    }

    function getAllLandsForSale () public view returns (uint256 [] memory){
        return landsForSaleArray;
    }

    function getApplicantsByLand (uint256 _land) public view returns (uint256, address[] memory, uint256[] memory, uint256[] memory, uint256){
        uint256 arrayLength = landsForSale[_land].applicants.length;
        address[] memory userAddress = new address[] (arrayLength);
        uint256[] memory userDeposite = new uint256[] (arrayLength);
        uint256[] memory userPrice = new uint256[] (arrayLength);
        for (uint256 i = 0; i < arrayLength; i++){
            userAddress[i] = landsForSale[_land].applicants[i].applicant;
            userDeposite[i] = landsForSale[_land].applicants[i].deposite;
            userPrice[i] = landsForSale[_land].applicants[i].price;
        }
        return (landsForSale[_land].minPrice, userAddress, userDeposite, userPrice, landsForSale[_land].date);
    }

    function setWinner () public onlyOracle {
        uint256 [] memory tempLandsForSaleArray = new uint256 [] (landsForSaleArray.length);
        for (uint256 i = 0; i < landsForSaleArray.length; i++){
            tempLandsForSaleArray[i] = landsForSaleArray [i];
        }
        for (uint256 i = 0; i < tempLandsForSaleArray.length; i++){
            uint256 _land = tempLandsForSaleArray[i];
            if (landsForSale[_land].status == true){
                (, address[] memory _applicants, ,,) = getApplicantsByLand (_land);
                uint256 [] memory _ratings = getRatings (_applicants);
                uint256 maxRating = 0;
                address maxRatingAddress;
                for (uint256 j = 0; j < _applicants.length; j++){
                    if (_ratings[j] > maxRating) {
                        maxRating = _ratings[j];
                        maxRatingAddress = _applicants [j];
                    }
                }
                landsForSale[_land].winner =  maxRatingAddress;
                if (landsForSale[_land].date <= block.timestamp){
                    landsForSale[_land].status = false;
                    deleteLandFromSale (_land);
                    landsForTransferArray.push (_land);
                    if (landsForSale[_land].winner == address(0)){
                        delete landsForSale[_land];
                    }
                    sendDeposite (_land);
                }
            }
        }        
    }

    function getWinner (uint256 _land) public view returns (address){
        return landsForSale[_land].winner;
    }

    /// @notice fines for winners who didn't claim NFT in time
    function setFines () public onlyOracle returns (address[] memory) {
        address[] memory _users = new address[] (100);
        uint256[] memory _delete = new uint256[] (100);
        uint256 counter = 0;
        for (uint256 i = 0; i < landsForTransferArray.length; i++){
            uint256 _land = landsForTransferArray[i];
            if (landsForSale[_land].sold != true && block.timestamp > landsForSale[_land].date + gameSettings.mintPeriod){
                address _user = landsForSale[_land].winner;
                userFines[_user]++;
                _users[counter] = _user;
                _delete[counter] = _land;
                counter++;
                delete landsForSale[_land];
            }
        }

        for (uint256 i = 0; i < _delete.length; i++){
            uint256 _land = _delete[i];
            deleteLandFromTransfer (_land);
        }
        return _users;
    }

    function getFines (address _user) public view returns (uint256){
        return userFines [_user];
    }
    
    /// @notice transfer NFT to Winner after auction has been finished
    function transferLandToWinner (uint256 _land) public payable returns (bool) {
        require(block.timestamp < landsForSale[_land].date + gameSettings.mintPeriod, "Time has expired"); 
        require(msg.sender == getWinner (_land), "You are not a winner"); 
        require(landsForSale[_land].sold != true, "The land is already bought");
        require(landsForSale[_land].status != true, "Auction has not been finished yet");
        uint256 userPrice;
        for (uint256 i = 0; i < landsForSale[_land].applicants.length; i++){
            if (landsForSale[_land].applicants[i].applicant == msg.sender){
                userPrice = landsForSale[_land].applicants[i].price;
            }
        }
        require (userPrice <= msg.value, "Insufficient funds");
        try NFT.safeTransferFrom (address(this), msg.sender, _land) {
            landsForSale[_land].sold = true;
            deleteLandFromUserApplications (_land);
            return true;
        } 
        catch{
            return false;
        }
    }

    function getUserApplications (address _user) public view returns (uint256[] memory) {
        return userApplications[_user];
    }

    /// @notice data array structure
    /// [0] currentBalance (Sei);
    /// [1] numberOfTransactions;
    /// [2] firstTransactionDate (days from now);
    /// [3] stackingBalance (Sei);
    /// [4] coominityTokenBalance;
    /// [5] coominityTokenLocked;
    /// [6] daysOfLocking;
    /// [7] otherSeiTokens (in pieces);
    /// [8] NFTs _Land (in pieces);

    function setRating (address userAddress, uint256[7] calldata data) public onlyOracle {
        uint256 countUserRating = (userAddress.balance /  1 ether) + ratingRatio.transactions * data[0] + ratingRatio.firstDate * data[1] 
        + ratingRatio.stackingBalance * data[2] + ratingRatio . communityToken * data[3] + ratingRatio.lockedCommunityToken * data[4] 
        + ratingRatio.lockedDays * data[5] + ratingRatio.otherTokens  * data[6] + ratingRatio.NFT_Land * NFT.balanceOf(userAddress);
        userRating[userAddress] = (countUserRating/10);
    }

    function getRatings (address [] memory userAddresses) public view returns (uint256[] memory) {
        uint256 [] memory ratings = new uint256 [] (userAddresses.length);
        for (uint i = 0; i < userAddresses.length; i++){
            address tempAddress = userAddresses[i];
            ratings[i] = userRating[tempAddress];
        }
        return ratings; 
    }


    /// @notice common functions

    function changeAdmin(address _newAdmin) public onlyOwnerAdmin validAddress(_newAdmin){
        gameSettings.admin = _newAdmin;
        emit ChangeAdminSucsess (msg.sender, _newAdmin);
    }

    function changeOracle(address _oracle) public onlyOwnerAdmin validAddress(_oracle){
        gameSettings.oracle = _oracle;
        emit ChangeOracleSucsess (msg.sender, _oracle);
    }

    function changeAuctionSettings (uint256 _deposit, uint256 _price, uint256 _mintPeriod) public onlyOwnerAdmin {
        gameSettings.minDeposit = _deposit;
        gameSettings.minPrice = _price;
        gameSettings.mintPeriod = _mintPeriod;
        emit ChangeSettingsSucsess (msg.sender, [_deposit, _price, _mintPeriod]);
    }

    function ownerOf (uint256 tokenId) public view returns (address){
        return NFT.ownerOf (tokenId);
    }

    function checkApplication (address _user, uint256 _land) internal view returns (bool){
        for (uint256 i = 0; i < landsForSale[_land].applicants.length; i++){
            if (landsForSale[_land].applicants[i].applicant == _user){
                return false;
            }
        }
        return true;
    }
    
    function addApplicationFees (uint256 _land, uint256 _deposite, uint256 _price) internal returns (bool) {
        landsForSale [_land].applicants.push (applicants(msg.sender, _deposite, _price));
        return true;
    }

    function addAddressesApplication () internal returns (bool) {
        applicantsArray.push (msg.sender);
        return true;
    }

    function deleteLandFromSale (uint256 _land) internal {
        for (uint256 i = 0; i < landsForSaleArray.length; i++){
            if (landsForSaleArray[i] == _land){
                for (uint j = i; j < landsForSaleArray.length - 1; j++) {
                    landsForSaleArray[j] = landsForSaleArray[j + 1];
                }
                landsForSaleArray.pop();
            }
        }
    }

    function deleteLandFromTransfer (uint256 _land) internal {
        for (uint256 i = 0; i < landsForTransferArray.length; i++){
            if (landsForTransferArray[i] == _land){
                for (uint j = i; j < landsForTransferArray.length - 1; j++) {
                    landsForTransferArray[j] = landsForTransferArray[j + 1];
                }
                landsForTransferArray.pop();
            }
        }
    }

    function deleteLandFromUserApplications (uint256 _land) internal {
        for (uint256 i = 0; i < userApplications[msg.sender].length; i++){
            if (userApplications[msg.sender][i] == _land){
                for (uint j = i; j < userApplications[msg.sender].length - 1; j++) {
                    userApplications[msg.sender][j] = userApplications[msg.sender][j + 1];
                }
                userApplications[msg.sender].pop();
            }
        }
    }

    /// @notice transactions 
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function withdrawTokens (address payable recipient, uint256 amount) public onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = recipient.call {value: amount}('');
        require(success, "Withdraw call failed");
        emit TokensWithdrawn (msg.sender, recipient, amount);
    }

    function sendDeposite (uint256 _land) internal {
        for (uint256 i = 0; i < landsForSale[_land].applicants.length; i++){
            if (landsForSale[_land].applicants[i].applicant != landsForSale[_land].winner){
                uint256 amount = landsForSale[_land].applicants[i].deposite;
                address payable recipient = payable(landsForSale[_land].applicants[i].applicant);
                recipient.call {value: amount}('');
            }
        }
    }

    receive() external payable {
        uint256 amount = msg.value;
        emit TokensReceived (msg.sender, amount);
    }

   
}

