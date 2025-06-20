// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Control contract for the game Colonization
/// @author vlad161_main
/// @notice The contract is for gaming purposes only. It is used for managing of the game dynamics

/// @dev some functions of NFT contract can be executed only with this contract

interface NFTcontract {
    function balanceOf(address owner) external view returns (uint256);
    function safeMint(address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "hardhat/console.sol";


// Custom errors
error NotAdministrator();
error NotAuthorized();
error NotOracle();
error InvalidAddress();
error AuctionNotActive(uint256 _land);
error AuctionIsActive(uint256 _land);
error AuctionNotExists(uint256 _land);
error NotWinner(address user); //
error Expired(uint256 _date); 
error InsufficientFunds();
error AlreadyClaimed(uint256 _land); 
error BidTooLow(); 
error AlreadyApplied(uint256 _land); 
error AuctionHasEnded(uint256 _land);
error WithdrawFailed();
error RefundFailed();

contract Auction is Ownable, IERC721Receiver {
    NFTcontract NFT;

    /// @dev userRating is current rating for applicants. Rating updates daily
    /// @dev userFines contains fines for users which don't claim NFT in time
    mapping(uint256 => LandAuction) public landsForSale;
    mapping(address => uint256) userRating;
    mapping(address => uint256) userFines;
    mapping(address => uint256[]) userApplications;
    
    uint256[] landsForSaleArray;
    uint256[] landsForTransferArray;
    
    settings gameSettings;
    rating ratingRatio;
   
    /// @notice general settings of the current contract
    struct settings {
        uint256 minDeposit;
        uint256 minPrice;
        uint256 mintPeriod;
        uint256 auctionNumber;
        address admin;
        address oracle;
    }

    struct LandAuction {
        uint256 deposit;
        uint256 minPrice;
        Applicant[] applicants;
        address winner;
        uint256 endTime;
        bool isActive;
        bool isSold;
        uint256 totalDeposits;
    }

    struct Applicant {
        address applicant;
        uint256 deposit; 
        uint256 price;
        bool isRefunded; 
    }
    
    /// @notice Ratings for pricing NFTs
    struct rating {
        uint256 userBalance;
        uint256 transactions;
        uint256 firstDate;
        uint256 stackingBalance;
        uint256 communityToken;
        uint256 lockedCommunityToken;
        uint256 lockDuration;
        uint256 otherTokens;
        uint256 nftLand;
    }

    constructor(address initialOwner, address _NFTcontractAddress) Ownable(initialOwner) {
        gameSettings.admin = msg.sender;
        gameSettings.oracle = msg.sender;
        gameSettings.minDeposit = 1;
        gameSettings.minPrice = 10;
        gameSettings.mintPeriod = 604800; // 7 days in seconds
        NFT = NFTcontract(_NFTcontractAddress);
        
        // Initialize rating ratios
        ratingRatio = rating(12, 15, 12, 17, 15, 17, 20, 11, 13);
    }

    // Modifiers
    modifier onlyAdmin() {
        if (msg.sender != gameSettings.admin) {
            revert NotAdministrator();
        }
        _;
    }

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && msg.sender != gameSettings.admin) {
            revert NotAuthorized();
        }
        _;
    }
    
    /// @notice Only oracle can execute some functions
    modifier onlyOracle() {
        if (msg.sender != gameSettings.oracle) {
            revert NotOracle();
        }
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) {
            revert InvalidAddress();
        }
        _;
    }
    
    // Events
    event ChangeAdminSucsess(address sender, address newAdmin);
    event ChangeOracleSucsess(address sender, address newAdmin);
    event ChangeSettingsSucsess(address sender, uint256[3] settings);
    event TokensReceived(address sender, uint256 amount);
    event TokensWithdrawn(address sender, address recipient, uint256 amount);

    // ERC721 Receiver implementation
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /// @notice Returns current contract status and settings
    function getContractStatus() external view returns (
        address currentOwner,
        address admin,
        address oracle,
        uint256 minDeposit,
        uint256 minPrice,
        uint256 mintPeriod,
        uint256 auctionNumber
    ) {
        return (
            owner(),
            gameSettings.admin,
            gameSettings.oracle,
            gameSettings.minDeposit,
            gameSettings.minPrice,
            gameSettings.mintPeriod,
            gameSettings.auctionNumber
        );
    }

    /// @notice Starts new auction for specified NFTs
    function startReceivingApplications(uint256 _endDate, uint256[] calldata _NFTs) external onlyOwnerOrAdmin returns (uint256[] memory) {
        if (_endDate < block.timestamp) {
            revert AuctionHasEnded(0);
        }

        uint256[] memory newLands = new uint256[](_NFTs.length);
        bool addAuction = false;
        
        for (uint256 i = 0; i < _NFTs.length; i++) {
            uint256 land = _NFTs[i];
            if (landsForSale[land].endTime == 0) {
                address owner;
                try NFT.ownerOf(land) {
                    owner = NFT.ownerOf(land);
                } catch {
                    owner = address(0);
                }
                
                if (owner == address(0)) {
                    NFT.safeMint(address(this), land);
                    owner = NFT.ownerOf(land);
                }
                
                if (owner == address(this)) {
                    landsForSale[land].deposit = gameSettings.minDeposit;
                    landsForSale[land].minPrice = gameSettings.minPrice;
                    landsForSale[land].endTime = _endDate;
                    landsForSale[land].isActive = true;
                    landsForSale[land].isSold = false;
                    newLands[i] = land;
                    landsForSaleArray.push(land);
                    addAuction = true;
                }
            }
        }
        
        if (addAuction) {
           gameSettings.auctionNumber++;
        }
        return newLands;
    }

    /// @notice Allows user to apply for NFT auction
    function applicationNFT(uint256 _land) external payable returns (bool success) {
        LandAuction storage auction = landsForSale[_land];

        if (auction.endTime == 0) {
            revert AuctionNotExists(_land);
        }
        if (auction.endTime < block.timestamp) {
            revert AuctionHasEnded(_land);
        }

        if (!auction.isActive) {
            revert AuctionNotActive(_land);
        }
        
        uint256 requiredDeposit = depositForSender();
        
        if (msg.value < requiredDeposit){
            revert BidTooLow();
        }

        if (!checkApplication(msg.sender, _land)){
            revert AlreadyApplied(_land);
        }
        
        uint256 price = NFTpriceForSender();
        addApplicationFees(_land, requiredDeposit, price);
        userApplications[msg.sender].push(_land);
    
        return true;
    }

    /// @notice Calculates required deposit for sender based on their applications and fines
    function depositForSender() public view returns (uint256) {
        uint256 x = userApplications[msg.sender].length + 1;
        return (gameSettings.minDeposit + (2 ** (x - 1)) / 2 * (1 + userFines[msg.sender])) * 1 ether;
    }

    /// @notice Calculates NFT price for sender based on their wins and applications
    function NFTpriceForSender() public view returns (uint256) {
        uint256 wins;
        uint256 applications;
        uint256 transferLength = landsForTransferArray.length;
        uint256 saleLength = landsForSaleArray.length;
        
        for (uint256 i = 0; i < transferLength; i++) {
            uint256 _land = landsForTransferArray[i];
            if (landsForSale[_land].winner == msg.sender && landsForSale[_land].isActive == false) {
                wins++;
            }
        }
        
        for (uint256 i = 0; i < saleLength; i++) {
            uint256 _land = landsForSaleArray[i];
            for (uint256 j = 0; j < landsForSale[_land].applicants.length; j++) {
                if (landsForSale[_land].applicants[j].applicant == msg.sender && landsForSale[_land].isActive == true) {
                    applications++;
                }
            }
        }
        
        return (gameSettings.minPrice + (2 ** wins) + applications) * 1 ether;
    }

    /// @notice Returns array of all lands currently for sale
    function getAllLandsForSale() external view returns (uint256[] memory) {
        return landsForSaleArray;
    }

    function getAllLandsForTransfer() external view returns (uint256[] memory) {
        return landsForTransferArray;
    }

    /// @notice Returns applicants data for specific land
    function getApplicantsByLand(uint256 _land) public view returns (
        uint256 minPrice,
        address[] memory applicants,
        uint256[] memory deposits,
        uint256[] memory prices,
        uint256 endTime
    ) {
        LandAuction storage auction = landsForSale[_land];
        if (auction.endTime == 0) {
            revert AuctionNotExists(_land);
        }
        
        uint256 arrayLength = auction.applicants.length;
        applicants = new address[](arrayLength);
        deposits = new uint256[](arrayLength);
        prices = new uint256[](arrayLength);

        for (uint256 i = 0; i < arrayLength; i++) {
            applicants[i] = auction.applicants[i].applicant;
            deposits[i] = auction.applicants[i].deposit;
            prices[i] = auction.applicants[i].price;
        }
        
        return (auction.minPrice, applicants, deposits, prices, auction.endTime);
    }

    /// @notice Sets winner for all active auctions

    function setWinner() external onlyOracle {
        uint256[] memory tempLandsForSaleArray = new uint256[](landsForSaleArray.length);
        
        for (uint256 i = 0; i < landsForSaleArray.length; i++) {
            tempLandsForSaleArray[i] = landsForSaleArray[i];
        }
        
        for (uint256 i = 0; i < tempLandsForSaleArray.length; i++) {
            uint256 _land = tempLandsForSaleArray[i];
            
            if (landsForSale[_land].isActive == true) {
                (, address[] memory _applicants, , , ) = getApplicantsByLand(_land);
                uint256[] memory _ratings = getRatings(_applicants);
                uint256 maxRating = 0;
                address maxRatingAddress;
                for (uint256 j = 0; j < _applicants.length; j++) {
                    if (_ratings[j] > maxRating) {
                        maxRating = _ratings[j];
                        maxRatingAddress = _applicants[j];
                    }
                }
                landsForSale[_land].winner = maxRatingAddress;
                
                if (landsForSale[_land].endTime <= block.timestamp && landsForSale[_land].isActive != false) {
                    landsForSale[_land].isActive = false;
                    deleteLandFromSale(_land);
                    if (landsForSale[_land].winner == address(0)) {
                        delete landsForSale[_land];
                    } else {
                        landsForTransferArray.push(_land);
                        sendDeposit(_land);
                    }
                }
            }
        }
    }

    /// @notice Returns winner address for specific land
    function getWinner(uint256 _land) public view returns (address, uint256) {
        LandAuction storage auction = landsForSale[_land];
        uint256 userPrice = 0;
        for (uint256 i = 0; i < auction.applicants.length; i++) {
            if (auction.applicants[i].applicant == auction.winner) {
                userPrice = auction.applicants[i].price;
                break;
            }
        } 
        return (landsForSale[_land].winner, userPrice);
    }

    /// @notice Applies fines to winners who didn't claim NFT in time
    function setFines() external onlyOracle returns (address[] memory) {
        address[] memory _users = new address[](100);
        uint256[] memory _delete = new uint256[](100);
        uint256 counter = 0;
        
        for (uint256 i = 0; i < landsForTransferArray.length; i++) {
            uint256 _land = landsForTransferArray[i];
            if (landsForSale[_land].isSold != true && block.timestamp > landsForSale[_land].endTime + gameSettings.mintPeriod) {
                address _user = landsForSale[_land].winner;
                userFines[_user]++;
                _users[counter] = _user;
                _delete[counter] = _land;
                counter++;
                delete landsForSale[_land];
            }
        }

        for (uint256 i = 0; i < _delete.length; i++) {
            uint256 _land = _delete[i];
            deleteLandFromTransfer(_land);
        }
        
        return _users;
    }

    /// @notice Returns fines count for specific user
    function getFines(address _user) external view returns (uint256) {
        return userFines[_user];
    }
    
    /// @notice Allows winner to claim their NFT
    function transferLandToWinner(uint256 _land) external payable returns (bool) {
        LandAuction storage auction = landsForSale[_land];
        (address winner, uint256 userPrice) = getWinner(_land);
 
        if (auction.endTime == 0) {
            revert AuctionNotExists(_land);
        }
        if (block.timestamp > auction.endTime + gameSettings.mintPeriod){
            revert Expired(_land);
        }
        if (msg.sender != winner) {
            revert NotWinner(msg.sender);
        }
        if (auction.isSold == true) {
            revert AlreadyClaimed(_land);
        }
        if (auction.isActive == true) {
            revert AuctionIsActive(_land);
        }
        if (userPrice > msg.value) {
            revert InsufficientFunds();
        }
        
        try NFT.safeTransferFrom(address(this), msg.sender, _land) {
            auction.isSold = true;
            deleteLandFromUserApplications(_land);
            deleteLandFromTransfer(_land);
            return true;
        } catch {
            return false;
        }
    }

    /// @notice Returns array of land IDs user has applied for
    function getUserApplications(address _user) external view returns (uint256[] memory) {
        return userApplications[_user];
    }

    /// @notice Sets user rating based on various factors
    /// @param data Array with user data:
    /// [0] currentBalance (Sei);
    /// [1] numberOfTransactions;
    /// [2] firstTransactionDate (days from now);
    /// [3] stackingBalance (Sei);
    /// [4] communityTokenBalance;
    /// [5] communityTokenLocked;
    /// [6] daysOfLocking;
    function setRating(address userAddress, uint256[7] calldata data) external onlyOracle validAddress(userAddress) {
        userRating[userAddress] = (
            (userAddress.balance / 1 ether) + 
            (ratingRatio.transactions * data[0]) + 
            (ratingRatio.firstDate * data[1]) + 
            (ratingRatio.stackingBalance * data[2]) + 
            (ratingRatio.communityToken * data[3]) + 
            (ratingRatio.lockedCommunityToken * data[4]) + 
            (ratingRatio.lockDuration * data[5]) + 
            (ratingRatio.otherTokens * data[6]) + 
            (ratingRatio.nftLand * NFT.balanceOf(userAddress))
        ) / 10;
    }

    /// @notice Returns ratings for multiple users
    function getRatings(address[] memory userAddresses) public view returns (uint256[] memory) {
        uint256[] memory ratings = new uint256[](userAddresses.length);
        
        for (uint i = 0; i < userAddresses.length; i++) {
            address tempAddress = userAddresses[i];
            ratings[i] = userRating[tempAddress];
        }
        
        return ratings; 
    }

    // Administration functions
    function changeAdmin(address _newAdmin) external onlyOwnerOrAdmin validAddress(_newAdmin) {
        gameSettings.admin = _newAdmin;
        emit ChangeAdminSucsess(msg.sender, _newAdmin);
    }

    function changeOracle(address _oracle) external onlyOwnerOrAdmin validAddress(_oracle) {
        gameSettings.oracle = _oracle;
        emit ChangeOracleSucsess(msg.sender, _oracle);
    }

    function changeAuctionSettings(uint256 _deposit, uint256 _price, uint256 _mintPeriod) external onlyOwnerOrAdmin {
        gameSettings.minDeposit = _deposit;
        gameSettings.minPrice = _price;
        gameSettings.mintPeriod = _mintPeriod;
        emit ChangeSettingsSucsess(msg.sender, [_deposit, _price, _mintPeriod]);
    }

    // Owner of this contract
    function ownerOf(uint256 tokenId) external view returns (address) {
        return NFT.ownerOf(tokenId);
    }

    /// @notice Checks if user has already applied for specific land
    function checkApplication(address _user, uint256 _land) internal view returns (bool) {
        LandAuction storage auction = landsForSale[_land];
        
        for (uint256 i = 0; i < auction.applicants.length; i++) {
            if (auction.applicants[i].applicant == _user) {
                return false;
            }
        }
        
        return true;
    }
    
    /// @notice Adds new application to land auction
    function addApplicationFees(uint256 _land, uint256 _deposit, uint256 _price) internal {
        LandAuction storage auction = landsForSale[_land];
        
        auction.applicants.push(Applicant({
            applicant: msg.sender,
            deposit: _deposit,
            price: _price,
            isRefunded: false
        }));
        
        auction.totalDeposits += _deposit;
    }

    /// @notice Removes land from sale array
    function deleteLandFromSale(uint256 _land) internal {
        uint256 length = landsForSaleArray.length;
        
        for (uint256 i = 0; i < length; ) {
            if (landsForSaleArray[i] == _land) {
                landsForSaleArray[i] = landsForSaleArray[length - 1];
                landsForSaleArray.pop();
                break;
            }
            unchecked { i++; }
        }
    }

    /// @notice Removes land from transfer array
    function deleteLandFromTransfer(uint256 _land) internal {
        uint256 length = landsForTransferArray.length;
        
        for (uint256 i = 0; i < length; ) {
            if (landsForTransferArray[i] == _land) {
                landsForTransferArray[i] = landsForTransferArray[length - 1];
                landsForTransferArray.pop();
                break;
            }
            unchecked { i++; }
        }
    }

    /// @notice Removes land from user's applications
    function deleteLandFromUserApplications(uint256 _land) internal {
        uint256 length = userApplications[msg.sender].length;
        
        for (uint256 i = 0; i < length; ) {
            if (userApplications[msg.sender][i] == _land) {
                userApplications[msg.sender][i] = userApplications[msg.sender][length - 1];
                userApplications[msg.sender].pop();
                break;
            }
            unchecked { i++; }
        }
    }

    // Financial functions
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Withdraws tokens from contract
    function withdrawTokens(address payable recipient, uint256 amount) external onlyOwner validAddress(recipient) {
        if (address(this).balance < amount){
            revert InsufficientFunds();
        }
                
        (bool success, ) = recipient.call{value: amount}("");
        if (!success){
            revert WithdrawFailed();
        }        
        emit TokensWithdrawn(msg.sender, recipient, amount);
    }

    /// @notice Sends deposits back to non-winning applicants
    function sendDeposit(uint256 _land) internal {
        LandAuction storage auction = landsForSale[_land];
        uint256 applicantCount = auction.applicants.length;
        address winner = auction.winner;
        
        for (uint256 i = 0; i < applicantCount; ) {
            Applicant storage applicant = auction.applicants[i];
            
            if (applicant.applicant != winner && !applicant.isRefunded) {
                (bool success, ) = payable(applicant.applicant).call{
                    value: applicant.deposit
                }("");
                if (!success){
                    revert RefundFailed();
                }                   
                applicant.isRefunded = true;
                auction.totalDeposits -= applicant.deposit;
            }
            unchecked { i++; }
        }
    }

    // Fallback function
    receive() external payable {
        uint256 amount = msg.value;
        emit TokensReceived(msg.sender, amount);
    }
}