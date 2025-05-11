import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe("Auction", function () {
  async function deploy () {
    const [user1, user2, user3, user4] = await ethers.getSigners ();
    const factoryNFT = await ethers.getContractFactory ("LandNFT");
    const NFT = await factoryNFT.deploy(user1);
    await NFT.waitForDeployment;

    const factory = await ethers.getContractFactory ("Auction");
    const Auction = await factory.deploy(user1, NFT.target);
    await Auction.waitForDeployment;
    await NFT.changeAdmin(Auction.target);
    return {user1, user2, user3, user4, Auction};
  }
  it ("contract deploing is done", async function (){
    
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    expect (Auction.target).to.be.properAddress;
    
  });

  it ("check initial contract status", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(curentOwner).to.eq(user1);
    expect(admin).to.eq(user1);
    expect(oracle).to.eq(user1);
    expect(minDeposit).to.eq(1);
    expect(minPrice).to.eq(10);
    expect(mintPeriod).to.eq(604800);
    expect(auctionNumber).to.eq(0);
  });

  it ("change contract admin", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    let [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user1.address);
    //admin and owner changes admin, must be true
    await Auction.changeAdmin (user2.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user2.address);
    //owner changes admin, must be true
    await Auction.changeAdmin (user3.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user3.address);
    //admin changes admin, must be true
    await Auction.connect(user3).changeAdmin(user1.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user1.address);
    //not admin and not owner changes admin, must be false
    await expect(Auction.connect(user3).changeAdmin(user2.address)).to.be.revertedWith("Not administrator or owner");
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user1.address);

    //null address 0x0000000000000000000000000000000000000000, must be false
    await expect(Auction.changeAdmin("0x0000000000000000000000000000000000000000")).to.be.revertedWith("Not valid address");
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user1.address);
  });


  it ("change contract oracle", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    let [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user1.address);
    //admin and owner changes oracle, must be true
    await Auction.changeOracle (user2.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user2.address);
    //owner changes oracle, must be true
    await Auction.changeAdmin (user2.address);
    await Auction.changeOracle (user3.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user3.address);
    //admin changes oracle, must be true
    await Auction.connect(user2).changeOracle(user1.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user1.address);
    //not admin and not owner changes oracle, must be false
    await expect(Auction.connect(user3).changeOracle(user2.address)).to.be.revertedWith("Not administrator or owner");
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user1.address);

    //null address 0x0000000000000000000000000000000000000000, must be false
    await expect(Auction.changeOracle("0x0000000000000000000000000000000000000000")).to.be.revertedWith("Not valid address");
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user1.address);
  });

  //change owner (Ownable)

  it ("change contract owner", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    let [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(curentOwner).to.eq(user1.address);
    //owner changes oracle, must be true
    await Auction.transferOwnership (user2.address);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(curentOwner).to.eq(user2.address);
    //owner changes oracle, must be false
    await expect(Auction.transferOwnership (user2.address)).to.be.reverted;
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(curentOwner).to.eq(user2.address);

    //null address 0x0000000000000000000000000000000000000000, must be false
    await expect(Auction.changeAdmin("0x0000000000000000000000000000000000000000")).to.be.reverted;
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(admin).to.eq(user1.address);
  });


  it ("change contract settings", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    //not owner or admin changes oracle, must be false
    await expect(Auction.connect(user3).changeAuctionSettings(10, 10, 10)).to.be.revertedWith("Not administrator or owner");
    let [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(minDeposit).to.eq(1);
    expect(minPrice).to.eq(10);
    expect(mintPeriod).to.eq(604800);
    //change settings, must be true
    await Auction.changeAuctionSettings(10, 100, 1000);
    [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(minDeposit).to.eq(10);
    expect(minPrice).to.eq(100);
    expect(mintPeriod).to.eq(1000);
  });

  

  it ("start new auction", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const aucDate = [123456789, 234567890];
    //not owner or admin changes oracle, must be false
    await expect(Auction.connect(user3).startReceivingApplications (123456789, [1,2])).to.be.revertedWith("Not administrator or owner");
    //start new auction
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    //check auction number and end date
    let [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(auctionNumber).to.eq(1);
    //check lands for sale getAllLandsForSale ()
    let [first, second] = await Auction.getAllLandsForSale ();
    expect(first).to.eq(1);
    expect(second).to.eq(2);
    //add new auction
    await Auction.startReceivingApplications (aucDate[1], [3,4]);
    let [, , third, fourth] = await Auction.getAllLandsForSale ();
    expect(third).to.eq(3);
    expect(fourth).to.eq(4);
    //checking feilds of landsForSale 

    let land = await Auction.getApplicantsByLand (1);
    expect(land[4]).to.eq (aucDate[0]);

    land = await Auction.getApplicantsByLand (3);
    expect(land[4]).to.eq (aucDate[1]);
    expect(land[0]).to.eq (10);

    //checking repeated auction
    land = await Auction.getApplicantsByLand (4);
    expect(land[4]).to.eq (aucDate[1]);
    await Auction.startReceivingApplications (aucDate[0], [3,4]);
    expect(land[4]).to.eq (aucDate[1]);
  });

  it ("make an application for the land", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    let aucDate = [];
    aucDate[0] = Math.floor((Date.now()) / 1000) - 10;
    aucDate[1] = Math.floor((Date.now()) / 1000) + 3600;
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    await Auction.startReceivingApplications (aucDate[1], [3,4]);
    //check deposite for betting
    let deposite1 = await Auction.connect(user2).depositeForSender ();
    expect(deposite1).to.eq(ethers.parseEther("1.0")); 
    //check NFT price
    let price1 = await Auction.connect(user2).NFTpriceForSender();
    expect(price1).to.eq(ethers.parseEther("11.0"));
     //make an application with wrong land, must be false
    await expect(Auction.connect(user2).applicationNFT (5)).to.be.revertedWith("This land is not for sale");
    //make an application with expired date, must be false
    await expect(Auction.connect(user2).applicationNFT (1)).to.be.revertedWith("Time has expired, you can't make a bet");
    //make an application with no funds, must be false
    await expect(Auction.connect(user2).applicationNFT (3)).to.be.revertedWith("Insufficient funds");

    //make an application
    await Auction.connect(user2).applicationNFT (3, {value: deposite1});
    let answer = await Auction.connect(user2).getApplicantsByLand (3);
    expect(answer[0]).to.eq(10);
    expect(answer[1][0]).to.eq('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(answer[2][0]).to.eq(deposite1);
    expect(answer[3][0]).to.eq(price1);

    let deposite2 = await Auction.connect(user2).depositeForSender ();
    let price2 = await Auction.connect(user2).NFTpriceForSender();
    await Auction.connect(user2).applicationNFT (4, {value: deposite2});
    answer = await Auction.connect(user2).getApplicantsByLand (4);
    expect(answer[1][0]).to.eq('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(answer[2][0]).to.eq(deposite2);
    expect(answer[3][0]).to.eq(price2);
    //make re-bid on the same land, must be false
    deposite2 = await Auction.connect(user2).depositeForSender ();
    await expect(Auction.connect(user2).applicationNFT (4, {value: deposite2})).to.be.revertedWith("Re-bids are forbidden");

    let answer2 = await Auction.connect(user2).getAllLandsForSale ();
    expect(answer2.length).to.eq(4);
    expect(answer2[2]).to.eq(3);

    let deposite3 = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user3).applicationNFT (4, {value: deposite3});
    answer = await Auction.connect(user2).getApplicantsByLand (4);
    expect(answer[1].length).to.eq(2);
    expect(answer[2].length).to.eq(2);
    expect(answer[3].length).to.eq(2);
    expect(answer[1][0]).to.eq(user2);
    expect(answer[1][1]).to.eq(user3);
 });

  it ("set and get ratings", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    expect(oracle).to.eq(user1);
    let data1=[5, 175, 75, 10, 0, 0, 2];
    let data2=[10, 300, 75, 10, 5, 5, 2];
    //check oracle
    await expect(Auction.connect(user2).setRating (user1, data1)).to.be.revertedWith("Not administrator or oracle");
    //add data
    await Auction.setRating (user1, data1);
    await Auction.setRating (user2, data2);

    let ratings = await Auction.getRatings ([user1, user2]);
    expect(ratings[0]).to.lessThan(ratings[1]);
  });

  it ("set the winner", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    let data1=[5, 175, 75, 10, 0, 0, 2];
    let data2=[10, 300, 75, 10, 5, 5, 2];
    let data3=[5, 300, 75, 8, 5, 5, 2];
    //add data
    await Auction.setRating (user1, data1);
    await Auction.setRating (user2, data2); 
    await Auction.setRating (user3, data3);  
    let aucDate = [];
    const timeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    aucDate[0] = timeStamp + 10;
    aucDate[1] = Math.floor((Date.now()) / 1000) + 3600;
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    await Auction.startReceivingApplications (aucDate[1], [3,4,5]);
    await Auction.startReceivingApplications (aucDate[0], [6]);
    let deposite = await Auction.connect(user1).depositeForSender ();
    await Auction.connect(user1).applicationNFT (1, {value: deposite});
    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (2, {value: deposite});
    
    //winner is user2
    deposite = await Auction.connect(user1).depositeForSender ();
    await Auction.connect(user1).applicationNFT (3, {value: deposite});
    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (3, {value: deposite});
    //winner is user2
    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (4, {value: deposite});
    deposite = await Auction.connect(user3).depositeForSender ();
    await Auction.connect(user3).applicationNFT (4, {value: deposite});
    //winner is user3
    deposite = await Auction.connect(user3).depositeForSender ();
    await Auction.connect(user3).applicationNFT (5, {value: deposite});
    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (5, {value: deposite});


    //check oracle
    await expect(Auction.connect(user2).setWinner ()).to.be.revertedWith("Not administrator or oracle");
    //check winners
    let landForSale = await Auction.getAllLandsForSale ();
    await Auction.setWinner ();
    expect(await Auction.getWinner (3)).to.eq(user2);
    expect(await Auction.getWinner (4)).to.eq(user2);
    expect(await Auction.getWinner (5)).to.eq(user2);

   
    //check answer after deleting
    landForSale = await Auction.getAllLandsForSale ();
    expect(landForSale.length).to.eq(3);
    expect(landForSale[0]).to.eq(3);

    //check removin of lands without applicants. 
    let answer = await Auction.getApplicantsByLand(6);
    expect(answer[4]).to.eq(0);
  });

  it ("transfer to winner", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    
    let data1=[5, 175, 75, 10, 0, 0, 2];
    let data2=[10, 300, 75, 10, 5, 5, 2];
    let data3=[5, 300, 75, 8, 5, 5, 2];

    //add data
    await Auction.setRating (user1, data1);
    await Auction.setRating (user2, data2); 
    await Auction.setRating (user3, data3);  
    let aucDate = [];
    const timeStamp = await ethers.provider.getBlock("latest");
    aucDate[0] = timeStamp.timestamp + 6;
    aucDate[1] = Math.floor((Date.now()) / 1000) + 3600;
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    await Auction.startReceivingApplications (aucDate[1], [3,4,5]);

    let deposite = await Auction.connect(user1).depositeForSender ();
    await Auction.connect(user1).applicationNFT (1, {value: deposite});
    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (1, {value: deposite});

    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (3, {value: deposite});
    deposite = await Auction.connect(user3).depositeForSender ();
    await Auction.connect(user3).applicationNFT (3, {value: deposite});

    await Auction.setWinner ();
    
    //now finished auction, must be false
    await expect(Auction.connect(user2).transferLandToWinner (3)).to.be.revertedWith("Auction has not been finished yet");

    //insufficient funds, must be false
    await expect(Auction.connect(user2).transferLandToWinner (1)).to.be.revertedWith("Insufficient funds");
    //transfer not to winner, must be false
    let price = await Auction.connect(user3).NFTpriceForSender ();
    await expect(Auction.connect(user3).transferLandToWinner (1, {value: price})).to.be.revertedWith("You are not a winner");
    //already transfered, must be false
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect((await Auction.getUserApplications(user2)).length).to.eq(2);
    await Auction.connect(user2).transferLandToWinner (1, {value: price});
    await expect(Auction.connect(user2).transferLandToWinner (1, {value: price})).to.be.revertedWith("The land is already bought");
    

    //expired time, must be false
    await Auction.changeAuctionSettings (1, 10, 1);
    price = await Auction.connect(user2).NFTpriceForSender ();
    await expect(Auction.connect(user2).transferLandToWinner (1)).to.be.revertedWith("Time has expired");

    //Checking ownership of NFT3
    expect(await Auction.connect(user2).ownerOf (1)).to.eq(user2);
    //Checking user application array
    expect((await Auction.getUserApplications(user2)).length).to.eq(1);
  });

  it ("winner fines", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    
    let data1=[5, 175, 75, 10, 0, 0, 2];
    let data2=[10, 300, 75, 10, 5, 5, 2];
    let data3=[5, 300, 75, 8, 5, 5, 2];
    //add data
    await Auction.setRating (user1, data1);
    await Auction.setRating (user2, data2); 
    await Auction.setRating (user3, data3);  
    let aucDate = [];
    const timeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    aucDate[0] = timeStamp + 5;
    aucDate[1] = Math.floor((Date.now()) / 1000) + 3600;
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    await Auction.startReceivingApplications (aucDate[1], [3,4,5]);

    let deposite = await Auction.connect(user1).depositeForSender ();
    await Auction.connect(user1).applicationNFT (1, {value: deposite});
    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (1, {value: deposite});

    deposite = await Auction.connect(user2).depositeForSender ();
    await Auction.connect(user2).applicationNFT (3, {value: deposite});
    deposite = await Auction.connect(user3).depositeForSender ();
    await Auction.connect(user3).applicationNFT (3, {value: deposite});

    await Auction.setWinner ();
    await Auction.changeAuctionSettings (1, 10, 1);

    //user has no fines
    expect(await Auction.getFines (user2)).to.eq(0);
    //deposite 1+2 = 3
    expect(await Auction.connect(user2).depositeForSender ()).to.eq(ethers.parseEther('3'));
    //user has one fine
    await Auction.setFines ();
    expect(await Auction.getFines (user2)).to.eq(1);
  //deposite 1+2+2 = 5
    expect(await Auction.connect(user2).depositeForSender ()).to.eq(ethers.parseEther('5'));
  });

  it ("NFT price", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ()

    let data1=[5, 175, 75, 10, 0, 0, 2];
    let data2=[10, 300, 75, 10, 5, 5, 2];
    let data3=[5, 300, 75, 8, 5, 5, 2];

    //add data
    await Auction.setRating (user1, data1);
    await Auction.setRating (user2, data2); 
    await Auction.setRating (user3, data3);  
    let aucDate = [];
    const timeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    aucDate[0] = timeStamp + 5;
    aucDate[1] = Math.floor((Date.now()) / 1000) + 3600;
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    await Auction.startReceivingApplications (aucDate[1], [3,4,5]);

    //first application
    //gameSettings.minPrice + 2**winner/owner + applications 10 + 2**0 + 0 = 11 
    let deposite = await Auction.connect(user1).depositeForSender ();
    let price = await Auction.connect(user1).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('11'));
    await Auction.connect(user1).applicationNFT (1, {value: deposite});
   
    deposite = await Auction.connect(user2).depositeForSender ();
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('11'));
    await Auction.connect(user2).applicationNFT (1, {value: deposite});

    //second application
    //gameSettings.minPrice + 2**winner/owner + applications 10 + 2**0 + 1 = 12
    deposite = await Auction.connect(user1).depositeForSender ();
    price = await Auction.connect(user1).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('12'));
    await Auction.connect(user1).applicationNFT (3, {value: deposite});
   
    deposite = await Auction.connect(user2).depositeForSender ();
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('12'));
    await Auction.connect(user2).applicationNFT (3, {value: deposite});

    //third application
    //gameSettings.minPrice + 2**winner/owner + applications 10 + 2**0 + 2 = 13
    deposite = await Auction.connect(user1).depositeForSender ();
    price = await Auction.connect(user1).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('13'));
    await Auction.connect(user1).applicationNFT (4, {value: deposite});
   
    deposite = await Auction.connect(user2).depositeForSender ();
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('13'));
    await Auction.connect(user2).applicationNFT (4, {value: deposite});

    //set winner, user2
    //gameSettings.minPrice + 2**winner/owner + applications: 10 + 2**0 + 3 = 14
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('14'));
    await Auction.setWinner ();
    //gameSettings.minPrice + 2**winner/owner + applications: 10 + 2**1 + 2 = 14
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('14'));
    //gameSettings.minPrice + 2**winner/owner + applications: 10 + 2**0 + 2 = 13
    price = await Auction.connect(user1).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('13'));
    //сделать трансфер победителю. 
    let [,users,,prices,] = await Auction.connect(user2).getApplicantsByLand (3);
    const address = (element) => element = user2.address;
    let key = users.findIndex(address);
    price = prices[key];
    await Auction.connect(user2).transferLandToWinner (1, {value: price});
    //gameSettings.minPrice + 2**winner/owner + applications: 10 + 2**0 + 2 = 13
    price = await Auction.connect(user2).NFTpriceForSender ();
    expect(price).to.eq(ethers.parseEther('14'));
  });


  it ("common functions test", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    
    let data1=[5, 175, 75, 10, 0, 0, 2];
    let data2=[10, 300, 75, 10, 5, 5, 2];
    let data3=[5, 300, 75, 8, 5, 5, 2];

    //add data
    await Auction.setRating (user1, data1);
    await Auction.setRating (user2, data2); 
    await Auction.setRating (user3, data3);  
    let aucDate = [];
    const timeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    aucDate[0] = timeStamp + 7;
    aucDate[1] = Math.floor((Date.now()) / 1000) + 3600;
    await Auction.startReceivingApplications (aucDate[0], [1,2]);
    await Auction.startReceivingApplications (aucDate[1], [3,4,5]);

    //1
    let deposite = await Auction.connect(user1).depositeForSender ();
    //sum = 1
    let sum = deposite;
    await Auction.connect(user1).applicationNFT (1, {value: deposite});
    //1
    deposite = await Auction.connect(user2).depositeForSender ();
    //sum = 1 + 1
    sum += deposite;
    await Auction.connect(user2).applicationNFT (1, {value: deposite});

    //2
    deposite = await Auction.connect(user2).depositeForSender ();
    //sum = 1 + 1 + 2
    sum += deposite;
    await Auction.connect(user2).applicationNFT (3, {value: deposite});
    //1
    deposite = await Auction.connect(user3).depositeForSender ();
    //sum = 1 + 1 + 2 + 1
    sum += deposite;
    await Auction.connect(user3).applicationNFT (3, {value: deposite});
    expect(await Auction.getContractBalance()).to.eq(ethers.parseEther('5'));

    await Auction.setWinner ();
    //balance after applications 5 - 1 = 4 (returned to loser)
    expect(await Auction.getContractBalance()).to.eq(ethers.parseEther('4'));
    let [,users,,prices,] = await Auction.connect(user2).getApplicantsByLand (1);
    const address = (element) => element = user2.address;
    let key = users.findIndex(address);
    let price = prices[key];
    await Auction.connect(user2).transferLandToWinner (1, {value: price});
    
    //balance after winner transfer 4+11 = 15
    expect(await Auction.getContractBalance()).to.eq(ethers.parseEther('15'));
    //withdrawall by not the owner
    await expect(Auction.connect(user2).withdrawTokens (user1, ethers.parseEther('5'))).to.be.reverted;

    //withdrawall over balance is
    await expect(Auction.withdrawTokens (user1, ethers.parseEther('50'))).to.be.revertedWith("Insufficient balance");
    //correct withdrawall
    await Auction.withdrawTokens (user1, ethers.parseEther('5'));
    expect(await Auction.getContractBalance()).to.eq(ethers.parseEther('10'));
  });

  it ("events", async function (){
    const {user1, user2, user3, user4, Auction} = await loadFixture (deploy);
    const [curentOwner, admin, oracle, minDeposit, minPrice, mintPeriod, auctionNumber] = await Auction.getContractStatus ();
    await Auction.connect(user1).changeAdmin(user2);
    //ChangeAdminSucsess
    let filter1 = Auction.filters.ChangeAdminSucsess;
    let blockNumber = await ethers.provider.getBlockNumber();
    let events1 = await Auction.queryFilter(filter1, 0, blockNumber);
    expect(events1.length).to.eq(1);
    //ChangeSettingsSucsess
    let val = 5;
    await Auction.connect(user2).changeAuctionSettings (val, 15, 104800);
    let filter2= Auction.filters.ChangeSettingsSucsess;
    blockNumber = await ethers.provider.getBlockNumber();
    let events2 = await Auction.queryFilter(filter2, 0, blockNumber);

    expect(events2[0].args[0]).to.eq(user2);
    expect(events2[0].args[1][0]).to.eq(val);
    //TokensReceived
    await user2.sendTransaction({to: Auction.target, value: ethers.parseEther("2.0")});
    let filter3= Auction.filters.TokensReceived;
    blockNumber = await ethers.provider.getBlockNumber();
    let events3 = await Auction.queryFilter(filter3, 0, blockNumber);
    expect(events3[0].args[1]).to.eq(ethers.parseEther("2.0"));
    //TokensWithdrawn
    await Auction.connect(user1).withdrawTokens (user3, ethers.parseEther("1.0"));
    let filter4= Auction.filters.TokensWithdrawn;
    blockNumber = await ethers.provider.getBlockNumber();
    let events4 = await Auction.queryFilter(filter4, 0, blockNumber);
    expect(events4[0].args[0]).to.eq(user1);
    expect(events4[0].args[2]).to.eq(ethers.parseEther("1.0"));
    //ChangeOracleSucsess
    await Auction.connect(user1).changeOracle(user2);
    let filter5= Auction.filters.ChangeOracleSucsess;
    blockNumber = await ethers.provider.getBlockNumber();
    let events5 = await Auction.queryFilter(filter5, 0, blockNumber);
    expect(events5[0].args[1]).to.eq(user2);
  });
});




