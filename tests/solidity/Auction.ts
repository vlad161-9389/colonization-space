import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { Signer } from "ethers";
import { Auction } from "../typechain-types";

describe("Auction Contract", function () {
    let auction: Auction;
    let owner: Signer;
    let admin: Signer;
    let oracle: Signer;
    let user1: Signer;
    let user2: Signer;
    let user3: Signer;
    let mockNFT: any; 

    async function deployAuctionFixture() {
        [owner, admin, oracle, user1, user2, user3] = await ethers.getSigners();
        
        // Deploy mock NFT contract
        const MockNFT = await ethers.getContractFactory("LandNFT");
        const mockNFT = await MockNFT.deploy(await owner.getAddress());;
        const nftContract = await mockNFT.getAddress();

        // Deploy Auction contract
        const Auction = await ethers.getContractFactory("Auction");
        const auction = await Auction.deploy(await owner.getAddress(), nftContract);
        await auction.waitForDeployment;
        await mockNFT.changeAdmin(auction.target);
        
        // Set up initial roles
        await auction.connect(owner).changeAdmin(await admin.getAddress());
        await auction.connect(owner).changeOracle(await oracle.getAddress());

        return { auction, owner, admin, oracle, user1, user2, user3, mockNFT }; // Return mockNFT here
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployAuctionFixture);
        auction = fixture.auction;
        owner = fixture.owner;
        admin = fixture.admin;
        oracle = fixture.oracle;
        user1 = fixture.user1;
        user2 = fixture.user2;
        user3 = fixture.user3;
        mockNFT = fixture.mockNFT; 
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await auction.owner()).to.equal(await owner.getAddress());
        });

        it("Should initialize with correct default settings", async function () {
            const status = await auction.getContractStatus();
            expect(status[3]).to.equal(1); // minDeposit
            expect(status[4]).to.equal(10); // minPrice
            expect(status[5]).to.equal(604800); // mintPeriod (7 days)
        });

        it("Should set admin and oracle roles correctly", async function () {
            expect(await auction.connect(owner).changeAdmin(await admin.getAddress()));
            expect(await auction.connect(owner).changeOracle(await oracle.getAddress()));
            
            const status = await auction.getContractStatus();
            expect(status[1]).to.equal(await admin.getAddress()); // admin
            expect(status[2]).to.equal(await oracle.getAddress()); // oracle

            // Verify no owner can't change admin/oracle
            await expect(auction.connect(user1).changeAdmin(await user1.getAddress()))
                .to.be.revertedWithCustomError(auction, "NotAuthorized");
            await expect(auction.connect(user1).changeOracle(await user1.getAddress()))
                .to.be.revertedWithCustomError(auction, "NotAuthorized");

            // Test renouncing ownership
            await auction.connect(owner).transferOwnership(await user1.getAddress()); 
            let newOwner = await auction.owner();
            expect(newOwner).to.equal(await user1.getAddress()); 
            
            await auction.connect(user1).renounceOwnership();
            expect(await auction.owner()).to.equal(ethers.ZeroAddress); 
        });
    });

    describe("startReceivingApplications", function () {
        const testLandIds = [1, 2, 3];
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

        it("Should allow owner or admin to start new auctions", async function () {
            // Owner can start auction
            await expect(auction.connect(owner).startReceivingApplications(futureTimestamp, testLandIds))
            .to.changeTokenBalance(mockNFT, auction, testLandIds.length);

            // Admin can start auction
            await expect(auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds))
                .to.not.be.reverted;

            // Verify auction details
            for (const landId of testLandIds) {
                const auctionInfo = await auction.getApplicantsByLand(landId);
                expect(auctionInfo.endTime).to.equal(futureTimestamp);
                expect(await mockNFT.ownerOf(landId)).to.equal(await auction.getAddress());
            }
        });
        
        it("Should reject unauthorized calls", async function () {
            await expect(auction.connect(user1).startReceivingApplications(futureTimestamp, testLandIds))
                .to.be.revertedWithCustomError(auction, "NotAuthorized");
        });

        it("Should mint new NFTs when they don't exist", async function () {
            // Verify NFTs don't exist
            for (const landId of testLandIds) {
                await expect(mockNFT.ownerOf(landId)).to.be.reverted;
            }

            // Start auction
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);

            // Verify NFTs now exist and are owned by contract
            for (const landId of testLandIds) {
                expect(await mockNFT.ownerOf(landId)).to.equal(await auction.getAddress());
            }
        });

        it("Should skip already auctioned lands", async function () {
            // Start first auction
            const firstResult = await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            expect(firstResult).to.emit(mockNFT, "Transfer");

            // Try to start again with same lands
            const secondResult = await auction.connect(admin).startReceivingApplications(futureTimestamp + 1000, testLandIds);
            
            // Should return empty array for already auctioned lands
            expect(await auction.getAllLandsForSale()).to.have.lengthOf(testLandIds.length);
            const status = await auction.getContractStatus();
            expect(status[6]).to.equal(1); // auctionNumber
        });

        it("Should increment auctionNumber only when adding new auctions", async function () {
            const initialStatus = await auction.getContractStatus();
            
            // First call with new lands
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            let status = await auction.getContractStatus();
            expect(status[6]).to.equal(initialStatus[6] + BigInt(1)); // auctionNumber
            
            // Second call with same lands
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            status = await auction.getContractStatus();
            expect(status[6]).to.equal(initialStatus[6] + BigInt(1)); // auctionNumber should not increment
            
            // Third call with new lands
            await auction.connect(admin).startReceivingApplications(futureTimestamp, [4, 5, 6]);
            status = await auction.getContractStatus();
            expect(status[6]).to.equal(initialStatus[6] + BigInt(2)); // auctionNumber increments again
        });

        it("Should properly set auction parameters", async function () {
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            
            for (const landId of testLandIds) {
                const landAuction = await auction.getApplicantsByLand(landId);
                expect(landAuction.minPrice).to.equal(10); // From default settings
                expect(landAuction.endTime).to.equal(futureTimestamp);
            }
        });

        it("Should handle empty land array", async function () {
            await expect(auction.connect(admin).startReceivingApplications(futureTimestamp, []))
                .to.not.be.reverted;
            
            expect(await auction.getAllLandsForSale()).to.have.lengthOf(0);
        });

        it("Should revert with invalid end time", async function () {
            const pastTimestamp = Math.floor(Date.now() / 1000) - 100;
            await expect(auction.connect(admin).startReceivingApplications(pastTimestamp, testLandIds))
                .to.be.reverted;
        });

        it("Should create an auction if there were no bids", async function () {
            const { auction, owner, user1, user2, oracle } = await loadFixture(deployAuctionFixture);
            const testLandIds = [1, 2];
            let firstBlockTime = await time.latest();
            const futureTimestamp1 = firstBlockTime + 10;
            // Start auction first
            await auction.connect(admin).startReceivingApplications(futureTimestamp1, testLandIds);
            const deposit1 = await auction.connect(user1).depositForSender();
            const deposit2 = await auction.connect(user2).depositForSender();
            auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });

            while (firstBlockTime < futureTimestamp1) {
                firstBlockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setRating(user1.getAddress(), [10, 3, 150, 100, 10, 10, 10]);
            await auction.connect(oracle).setRating(user2.getAddress(), [20, 3, 150, 100, 10, 10, 10]);
            await auction.connect(oracle).setWinner();
            let winner = await auction.connect(user1).getWinner(1);
            expect(winner[0]).to.equal(await user2.getAddress()); // User2 has higher rating
            
            expect(await auction.connect(user1).ownerOf(1)).to.equal(await auction.getAddress());
            expect(await auction.connect(user1).ownerOf(2)).to.equal(await auction.getAddress());

            // creating a new auctions
            firstBlockTime = await time.latest();
            const futureTimestamp2 = firstBlockTime + 10;
           
            await auction.connect(admin).startReceivingApplications(futureTimestamp2, testLandIds);
            expect(await auction.connect(admin).getAllLandsForSale()).to.deep.equal([2n]);

            const deposit3 = await auction.connect(user1).depositForSender();
            auction.connect(user1).applicationNFT(testLandIds[1], { value: deposit3 });

            while (firstBlockTime < futureTimestamp2) {
                firstBlockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();
            winner = await auction.connect(user1).getWinner(2);
            expect(winner[0]).to.equal(await user1.getAddress());
        });
    });
  
    describe("applicationNFT Function", function () {
        const testLandIds = [1, 2, 3];
        const futureTimestamp = BigInt(Math.floor(Date.now() / 1000)) + 86400n; // 1 day from now

        beforeEach(async function () {
            // Start auction before each test
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
        });

        it("Should allow users to apply for auction with correct deposit", async function () {
            const requiredDeposit = await auction.connect(user1).depositForSender();
            
            await expect(
                auction.connect(user1).applicationNFT(testLandIds[0], { value: requiredDeposit }))
                .to.changeEtherBalance(user1, -requiredDeposit); 

            let [, applicants, deposits,,] = await auction.getApplicantsByLand(testLandIds[0]);
            expect(applicants).to.have.lengthOf(1);
            expect(applicants[0]).to.equal(await user1.getAddress());
            expect(deposits[0]).to.equal(requiredDeposit);
            expect(await auction.connect(user1).getContractBalance()).to.equal(requiredDeposit);
        });

        it("Should reject applications with insufficient deposit", async function () {
            const requiredDeposit = await auction.connect(user1).depositForSender();
            const lowDeposit = requiredDeposit - 1n;
            
            await expect(
                auction.connect(user1).applicationNFT(testLandIds[0], { value: lowDeposit })
                ).to.be.revertedWithCustomError(auction, "BidTooLow");
        });

        it("Should prevent duplicate applications", async function () {
            // first application
            let deposit = await auction.connect(user1).depositForSender();
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit });
            
            // second application
            deposit = await auction.connect(user1).depositForSender();
            await expect(
                auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit })
            ).to.be.revertedWithCustomError(auction, "AlreadyApplied");
        });

        it("Should calculate increasing deposits for multiple applications", async function () {
            const firstDeposit = await auction.connect(user1).depositForSender();
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: firstDeposit });
            
            const secondDeposit = await auction.connect(user1).depositForSender();
            expect(secondDeposit).to.be.gt(firstDeposit);
        });

        it("Should reject applications for inactive auctions", async function () {
            const { auction, user1, user2, oracle } = await loadFixture(deployAuctionFixture);
            const testLandId = 1;
            let firstBlockTime = await time.latest();
            const futureTimestamp = firstBlockTime + 10;
            // Start auction first
            await auction.connect(admin).startReceivingApplications(futureTimestamp, [testLandId]);
            const deposit1 = await auction.connect(user1).depositForSender();
            auction.connect(user1).applicationNFT(testLandId, { value: deposit1 });

            while (firstBlockTime < futureTimestamp) {
                firstBlockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }
            
            // Should reject application for ended auction
            const deposit2 = await auction.connect(user2).depositForSender();
            await expect(
                auction.connect(user2).applicationNFT(testLandId, { value: deposit2 })
            ).to.be.revertedWithCustomError(auction, "AuctionHasEnded"); 

            
            // Finish the auction
            await auction.connect(oracle).setWinner();
            
            // Should reject application for ended auction

            await expect(
                auction.connect(user2).applicationNFT(testLandId, { value: deposit2 })
            ).to.be.revertedWithCustomError(auction, "AuctionNotExists"); 
            
        });

        it("Should include user fines in deposit calculation", async function () {
            const { auction, owner, user1, user2, oracle } = await loadFixture(deployAuctionFixture);
            const testLandId = 1;
            let firstBlockTime = await time.latest();
            const futureTimestamp1 = firstBlockTime + 10;
            // Start auction first
            await auction.connect(admin).startReceivingApplications(futureTimestamp1, [testLandId]);
            const deposit1 = await auction.connect(user1).depositForSender();
            auction.connect(user1).applicationNFT(testLandId, { value: deposit1 });

            while (firstBlockTime < futureTimestamp1) {
                firstBlockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setRating(user1.getAddress(), [10, 3, 150, 100, 10, 10, 10]);
            await auction.connect(oracle).setWinner();
            await auction.connect(owner).changeAuctionSettings(1, 10, 5);
            firstBlockTime = await time.latest();
            const futureTimestamp2 = firstBlockTime + 5;

            while (firstBlockTime < futureTimestamp2) {
                firstBlockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            const finesBefore = await auction.connect(user1).getFines(await user1.getAddress());
            // add fine for user
            await auction.connect(oracle).setFines();
            const finesAfter = await auction.connect(user1).getFines(await user1.getAddress());
            expect(finesAfter).to.be.gt(finesBefore);
            
            const depositWithFine = await auction.connect(user1).depositForSender();
            const depositWithoutFine = await auction.connect(user2).depositForSender();
            
            expect(depositWithFine).to.be.gt(depositWithoutFine);
        });


        it("Should properly track user applications", async function () {
            const deposit = await auction.connect(user1).depositForSender();
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit });
            
            const userApps = await auction.getUserApplications(await user1.getAddress());
            expect(userApps).to.include(BigInt(testLandIds[0]));
        });

        it("Should calculate NFT price based on user history", async function () {
            const initialPrice = await auction.connect(user1).NFTpriceForSender();
            
            // After ther first application the price has to increase
            const deposit = await auction.connect(user1).depositForSender();
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit });
            
            const newPrice = await auction.connect(user1).NFTpriceForSender();
            expect(newPrice).to.be.gt(initialPrice);
        });

        it("Should reject applications for non-existent auctions", async function () {
            const nonExistentLandId = 999n;
            const deposit = await auction.connect(user1).depositForSender();
            
            await expect(
                auction.connect(user1).applicationNFT(nonExistentLandId, { value: deposit })
            ).to.be.revertedWithCustomError(auction, "AuctionNotExists");
        });
    });

    describe("setWinner Function", function () {
        const testLandIds = [1, 2, 3]; 
        const ZERO_ADDRESS = ethers.ZeroAddress;
        let futureTimestamp = 0;
        beforeEach(async function () {
            futureTimestamp = await time.latest() + 50;
            // Start auction before each test
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            await auction.connect(oracle).setRating(user1.getAddress(), [10, 3, 150, 100, 10, 10, 10]);
            await auction.connect(oracle).setRating(user2.getAddress(), [5, 7, 100, 50, 10, 10, 10]);
            await auction.connect(oracle).setRating(user3.getAddress(), [1, 3, 0, 0, 0, 0, 10]);
        });

        it("Should revert when called by non-oracle", async function () {
            await expect(auction.connect(user1).setWinner())
            .to.be.revertedWithCustomError(auction, "NotOracle()");
        });

        it("Winner check", async function () {
            let deposit1 = await auction.connect(user1).depositForSender();
            let deposit2 = await auction.connect(user2).depositForSender();
            let deposit3 = await auction.connect(user3).depositForSender();
            
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            await auction.connect(user3).applicationNFT(testLandIds[0], { value: deposit3 });

            await auction.connect(oracle).setWinner();

            // Check winners set
            let winner1 = await auction.getWinner(testLandIds[0]);
            let winner2 = await auction.getWinner(testLandIds[1]);
            let winner3 = await auction.getWinner(testLandIds[2]);
            expect(winner1[0]).to.equal(await user1.getAddress());
            expect(winner2[0]).to.equal(ZERO_ADDRESS);
            expect(winner3[0]).to.equal(ZERO_ADDRESS);

            deposit2 = await auction.connect(user2).depositForSender();
            await auction.connect(user2).applicationNFT(testLandIds[1], { value: deposit2 });
            await auction.connect(oracle).setWinner();
           
            winner2 = await auction.getWinner(testLandIds[1]);
            winner3 = await auction.getWinner(testLandIds[2]);
            expect(winner2[0]).to.equal(await user2.getAddress());
            expect(winner3[0]).to.equal(ZERO_ADDRESS);

            deposit1 = await auction.connect(user1).depositForSender();
            await auction.connect(user1).applicationNFT(testLandIds[1], { value: deposit1 });
            await auction.connect(oracle).setWinner();
            winner2 = await auction.getWinner(testLandIds[1]);
            expect(winner2[0]).to.equal(await user1.getAddress());

            deposit3 = await auction.connect(user3).depositForSender();
            await auction.connect(user3).applicationNFT(testLandIds[2], { value: deposit3 });
            await auction.connect(oracle).setWinner();
            winner3 = await auction.getWinner(testLandIds[2])
            expect(winner3[0]).to.equal(await user3.getAddress());

            deposit2 = await auction.connect(user2).depositForSender();
            await auction.connect(user2).applicationNFT(testLandIds[2], { value: deposit2 });
            await auction.connect(oracle).setWinner();
            winner3 = await auction.getWinner(testLandIds[2])
            expect(winner3[0]).to.equal(await user2.getAddress());

            deposit1 = await auction.connect(user1).depositForSender();
            await auction.connect(user1).applicationNFT(testLandIds[2], { value: deposit1 });
            await auction.connect(oracle).setWinner();
            winner3 = await auction.getWinner(testLandIds[2])
            expect(winner3[0]).to.equal(await user1.getAddress());
        });

        it("Should move ended auctions to transfer array", async function () {
            let deposit1 = await auction.connect(user1).depositForSender();
            let deposit2 = await auction.connect(user2).depositForSender();
            let deposit3 = await auction.connect(user3).depositForSender();
            
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            await auction.connect(user3).applicationNFT(testLandIds[0], { value: deposit3 });

            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + (futureTimestamp - blockTime + 1);

            while (blockTime < localFutureTimestamp) {
                 blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();

            const landsForTransfer = await auction.getAllLandsForTransfer();
            const landsForSale = await auction.getAllLandsForSale();
            expect(landsForTransfer).to.include(BigInt(testLandIds[0]));
            expect(landsForTransfer).to.not.include(BigInt(testLandIds[1]));
            expect(landsForSale).to.be.empty;
        });

        it("Should refund deposits to non-winners", async function () {
            const initialBalance1 = await ethers.provider.getBalance(await user1.getAddress());
            const initialBalance2 = await ethers.provider.getBalance(await user2.getAddress());

            let deposit1 = await auction.connect(user1).depositForSender();
            let deposit2 = await auction.connect(user2).depositForSender();
            const tx1 = await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            let receipt1 = await tx1.wait();
            if (!receipt1) {
                throw new Error("Transaction failed (receipt is null)");
            } 
            let gasUsed = receipt1.gasUsed;
            let gasPrice = tx1.gasPrice; 
            const transactionFee1 = gasUsed * gasPrice;
            const tx2 = await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            const receipt2 = await tx2.wait();
            if (!receipt2) {
                throw new Error("Transaction failed (receipt is null)");
            } 
            gasUsed = receipt2.gasUsed; 
            gasPrice = tx2.gasPrice; 
            const transactionFee2 = gasUsed * gasPrice;
        
            // Check user1's and user2's deposit
            let currentBalance1 = await ethers.provider.getBalance(await user1.getAddress());
            let currentBalance2 = await ethers.provider.getBalance(await user2.getAddress());
            expect(currentBalance1).to.equal(initialBalance1 - deposit1 - transactionFee1);
            expect(currentBalance2).to.equal(initialBalance2 - deposit2 - transactionFee2);
            
            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + (futureTimestamp - blockTime + 1);

            while (blockTime < localFutureTimestamp) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();
            
            // User1 should have received their deposit back
            currentBalance1 = await ethers.provider.getBalance(await user1.getAddress());
            currentBalance2 = await ethers.provider.getBalance(await user2.getAddress());
            expect(currentBalance1).to.equal(initialBalance1 - deposit1 - transactionFee1);
            expect(currentBalance2).to.equal(initialBalance2 - transactionFee2);
        });

    });

    describe("setFines Function", function () {
        const testLandIds = [1, 2, 3]; 
        const ZERO_ADDRESS = ethers.ZeroAddress;
        let futureTimestamp = 0;
        let mintPeriod = 0; 
        beforeEach(async function () {
            futureTimestamp = await time.latest() + 50;
            // Start auction before each test
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            await auction.connect(oracle).setRating(user1.getAddress(), [10, 3, 150, 100, 10, 10, 10]);
            await auction.connect(oracle).setRating(user2.getAddress(), [5, 7, 100, 50, 10, 10, 10]);
            await auction.connect(oracle).setRating(user3.getAddress(), [1, 3, 0, 0, 0, 0, 10]);
            await auction.changeAuctionSettings(1, 10, 20);
            let tempData = await auction.getContractStatus();
            mintPeriod = Number(tempData [5]);
        });

        it("should revert if called by non-oracle", async function () {
            await expect(auction.connect(user1).setFines())
            .to.be.revertedWithCustomError(auction, "NotOracle");
        });

        it("should return empty array when no lands need fines", async function () {
            const result = await auction.connect(oracle).setFines.staticCall();
            expect(result).to.be.an('array');
            expect(result[0]).to.equal (ZERO_ADDRESS);
        });

        it("should apply fines for expired, unsold lands", async function () {

            const deposit1 = await auction.connect(user1).depositForSender();
            const deposit2 = await auction.connect(user2).depositForSender();
            const deposit3 = await auction.connect(user3).depositForSender();
            
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            await auction.connect(user3).applicationNFT(testLandIds[0], { value: deposit3 });

            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + (futureTimestamp - blockTime + 1);

            while (blockTime < localFutureTimestamp) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();

            blockTime = await time.latest();
            const localFutureTimestamp2 = blockTime + mintPeriod;
            while (blockTime < localFutureTimestamp2) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }
      
            const result1 = await auction.connect(oracle).setFines.staticCall();
            const userAddress = await user1.getAddress();
            expect(result1[0]).to.equal(userAddress);
            await auction.connect(oracle).setFines();
            expect(await auction.getFines(userAddress)).to.equal(1);
        });

        it("should not fine transfered lands", async function () {
            const deposit1 = await auction.connect(user1).depositForSender();
            const deposit2 = await auction.connect(user2).depositForSender();
            const deposit3 = await auction.connect(user3).depositForSender();
            
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            await auction.connect(user3).applicationNFT(testLandIds[0], { value: deposit3 });

            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + (futureTimestamp - blockTime + 1);

            while (blockTime < localFutureTimestamp) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();
            const price1 = await auction.connect(user1).NFTpriceForSender();
            await auction.connect(user1).transferLandToWinner(1, { value: price1 });

            const result1 = await auction.connect(oracle).setFines.staticCall();
            const userAddress = await user1.getAddress();
            expect(result1[0]).to.not.equal(userAddress);
            await auction.connect(oracle).setFines();
            expect(await auction.getFines(userAddress)).to.equal(0);

        });

        it("should remove fined lands from transfer array / landsForSale mapping", async function () {
            const deposit1 = await auction.connect(user1).depositForSender();
            const deposit2 = await auction.connect(user2).depositForSender();
            const deposit3 = await auction.connect(user3).depositForSender();
            
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            await auction.connect(user3).applicationNFT(testLandIds[0], { value: deposit3 });

            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + (futureTimestamp - blockTime + 1);

            while (blockTime < localFutureTimestamp) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();

            blockTime = await time.latest();
            const localFutureTimestamp2 = blockTime + mintPeriod;
            while (blockTime < localFutureTimestamp2) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }
            
            const landsForTransfer1 = await auction.getAllLandsForTransfer();
            expect(landsForTransfer1[0]).to.equal(1);

            const land = await auction.getApplicantsByLand(1);
            expect(land.length).to.equal(5);
            
            await auction.connect(oracle).setFines();
            const landsForTransfer2 = await auction.getAllLandsForTransfer();
            expect(landsForTransfer2.length).to.equal(0);

            await expect(auction.getApplicantsByLand(1)).to.be.revertedWithCustomError(auction, "AuctionNotExists");
        });
    });

    describe("transferLandToWinner", function () {
        const testLandIds = [1, 2, 3]; 
        const ZERO_ADDRESS = ethers.ZeroAddress;
        let futureTimestamp = 0;
        let mintPeriod = 0; 
        beforeEach(async function () {
            futureTimestamp = await time.latest() + 50;
            // Start auction before each test
            await auction.connect(admin).startReceivingApplications(futureTimestamp, testLandIds);
            await auction.connect(admin).startReceivingApplications(futureTimestamp+200, [4]);
            await auction.connect(oracle).setRating(user1.getAddress(), [10, 3, 150, 100, 10, 10, 10]);
            await auction.connect(oracle).setRating(user2.getAddress(), [5, 7, 100, 50, 10, 10, 10]);
            await auction.connect(oracle).setRating(user3.getAddress(), [1, 3, 0, 0, 0, 0, 10]);
            await auction.changeAuctionSettings(1, 10, 20);
            let tempData = await auction.getContractStatus();
            mintPeriod = Number(tempData [5]);

            const deposit1 = await auction.connect(user1).depositForSender();
            const deposit2 = await auction.connect(user2).depositForSender();
            const deposit3 = await auction.connect(user3).depositForSender();
            
            await auction.connect(user1).applicationNFT(testLandIds[0], { value: deposit1 });
            await auction.connect(user2).applicationNFT(testLandIds[0], { value: deposit2 });
            await auction.connect(user3).applicationNFT(testLandIds[0], { value: deposit3 });

            const deposit1_1 = await auction.connect(user1).depositForSender();
            const deposit2_1 = await auction.connect(user2).depositForSender();
            await auction.connect(user1).applicationNFT(4, { value: deposit1_1 });
            await auction.connect(user2).applicationNFT(testLandIds[1], { value: deposit2_1 });
            

            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + (futureTimestamp - blockTime + 1);

            while (blockTime < localFutureTimestamp) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await auction.connect(oracle).setWinner();
        });

        it("should allow winner to claim the NFT", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            await expect(
                auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
                })
            )
                .to.emit(mockNFT, "Transfer")
                .withArgs(auction.getAddress(), winner, testLandIds[0]);

            // Verify land is now owned by winner
            expect(await mockNFT.ownerOf(testLandIds[0])).to.equal(winner);
        });

        it("should mark land as sold after transfer", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            await auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
            });

            const landInfo = await auction.landsForSale(testLandIds[0]);
            expect(landInfo.isSold).to.be.true;
            expect(landInfo.isActive).to.be.false;
        });

        it("should fail if sender is not the winner", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            await expect(
                auction.connect(user3).transferLandToWinner(testLandIds[0], {
                value: price,
            })
            ).to.be.revertedWithCustomError(auction, "NotWinner");
        });

        it("should fail if claim period has expired", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);

            const settings = await auction.getContractStatus();
            let blockTime = await time.latest();
            const localFutureTimestamp = blockTime + Number(settings.mintPeriod);

            while (blockTime < localFutureTimestamp) {
                blockTime = await time.latest();
                await ethers.provider.send("evm_mine"); 
            }

            await expect(
                auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
                })
            ).to.be.revertedWithCustomError(auction, "Expired");
        });

        it("should fail if land already claimed", async function () {
        // First claim should succeed
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            await auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
            });

            // Second claim should fail
            await expect(
                auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
                })
            ).to.be.revertedWithCustomError(auction, "AlreadyClaimed");
        });

        it("should fail if auction is still active", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            // Try to claim before auction ends
            await expect(
                auction.connect(user1).transferLandToWinner(4, {
                value: price,
                })
            ).to.be.revertedWithCustomError(auction, "AuctionIsActive");
        });

        it("should fail if insufficient funds sent", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            price = price - BigInt(1);
            await expect(
                auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
                })
            ).to.be.revertedWithCustomError(auction, "InsufficientFunds");
        });

        it("should remove land from transfer array after successful claim", async function () {
            let winner;
            let price;
            [winner, price] = await auction.getWinner(testLandIds[0]);
            // Land should be in transfer array before claim
            let transferLands = await auction.getAllLandsForTransfer();
            expect(transferLands).to.include(BigInt(testLandIds[0]));
            // Claim the land
            await auction.connect(user1).transferLandToWinner(testLandIds[0], {
                value: price,
            });

            // Land should no longer be in transfer array
            transferLands = await auction.getAllLandsForTransfer();
            expect(transferLands).to.not.include(BigInt(testLandIds[0]));
        });

    });

    describe("withdrawTokens function", () => {
        it("should allow owner to withdraw funds", async () => {
            // Send some ETH to the contract first
            const depositAmount = ethers.parseEther("1.0");
            const contractAddress = await auction.getAddress();
            await owner.sendTransaction({
                to: contractAddress,
                value: depositAmount
            });

            // Check initial balance
            const initialBalance = await ethers.provider.getBalance(contractAddress);
            expect(initialBalance).to.equal(depositAmount);

            // Withdraw half the amount
            const withdrawAmount = ethers.parseEther("0.5");
            const recipientAddress = await user1.getAddress();
            const recipientInitialBalance =  await ethers.provider.getBalance(recipientAddress)
            
            await expect(auction.connect(owner).withdrawTokens(recipientAddress, withdrawAmount))
                .to.emit(auction, "TokensWithdrawn")
                .withArgs(await owner.getAddress(), recipientAddress, withdrawAmount);

            // Check remaining balance
            const remainingBalance = await ethers.provider.getBalance(contractAddress);
            expect(remainingBalance).to.equal(depositAmount - withdrawAmount);

            // Check recipient received funds
            const recipientBalance = await ethers.provider.getBalance(recipientAddress);
            expect(recipientBalance).to.equal(recipientInitialBalance + withdrawAmount); 
        });

        it("should revert if non-owner tries to withdraw", async () => {
            const amount = ethers.parseEther("0.1");
            await expect(
                auction.connect(user1).withdrawTokens(await user1.getAddress(), amount)
            ).to.be.reverted;
        });

        it("should revert if recipient is zero address", async () => {
            const amount = ethers.parseEther("0.1");
            await expect(
                auction.connect(owner).withdrawTokens(ethers.ZeroAddress, amount)
            ).to.be.revertedWithCustomError(auction, "InvalidAddress");
        });

        it("should revert if contract has insufficient balance", async () => {
            const contractBalance = await ethers.provider.getBalance(await auction.getAddress());
            const withdrawAmount = contractBalance + (ethers.parseEther("1.0"));
            
            await expect(
                auction.connect(owner).withdrawTokens(await user1.getAddress(), withdrawAmount)
            ).to.be.revertedWithCustomError(auction, "InsufficientFunds");
        });

        it("should emit TokensWithdrawn event on successful withdrawal", async () => {
            // First fund the contract
            const contractAddress = await auction.getAddress();
            await owner.sendTransaction({
                to: contractAddress,
                value: ethers.parseEther("0.5")
            });

            const amount = ethers.parseEther("0.2");
            const tx = await auction.connect(owner).withdrawTokens(await user1.getAddress(), amount);
            
            await expect(tx)
                .to.emit(auction, "TokensWithdrawn")
                .withArgs(await owner.getAddress(), await user1.getAddress(), amount);
        });
    });
});