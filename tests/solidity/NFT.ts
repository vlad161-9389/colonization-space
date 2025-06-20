import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { LandNFT } from "../typechain-types";

describe("LandNFT", function () {
  let landNFT: LandNFT;
  let owner: Signer;
  let admin: Signer;
  let user1: Signer;
  let user2: Signer;
  let addrs: Signer[];

  beforeEach(async function () {
    [owner, admin, user1, user2, ...addrs] = await ethers.getSigners();
    
    const LandNFT = await ethers.getContractFactory("LandNFT");
    landNFT = await LandNFT.deploy(await owner.getAddress());
    
    // after deployment admin = owner
    await landNFT.changeAdmin(await admin.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await landNFT.owner()).to.equal(await owner.getAddress());
    });

    it("Should set the right admin", async function () {
      expect(await landNFT.admin()).to.equal(await admin.getAddress());
    });

    it("Should have correct name and symbol", async function () {
      expect(await landNFT.name()).to.equal("Lands");
      expect(await landNFT.symbol()).to.equal("LND");
    });

    it("Should have correct max supply", async function () {
      expect(await landNFT.maxSupply()).to.equal(1_000_000);
    });

    it("Should be unpaused by default", async function () {
      const state = await landNFT.getContractState();
      expect(state[2]).to.equal(true); // contract status (not paused)
    });
  });

  describe("Admin functionality", function () {
    it("Should allow owner to change admin", async function () {
      await expect(landNFT.connect(owner).changeAdmin(await user1.getAddress()))
        .to.emit(landNFT, "AdminChanged")
        .withArgs(await admin.getAddress(), await user1.getAddress());
      
      expect(await landNFT.admin()).to.equal(await user1.getAddress());
    });

    it("Should allow admin to change admin", async function () {
      await expect(landNFT.connect(admin).changeAdmin(await user1.getAddress()))
        .to.emit(landNFT, "AdminChanged")
        .withArgs(await admin.getAddress(), await user1.getAddress());
      
      expect(await landNFT.admin()).to.equal(await user1.getAddress());
    });

    it("Should not allow non-owner/admin to change admin", async function () {
      await expect(landNFT.connect(user1).changeAdmin(await user2.getAddress()))
        .to.be.revertedWithCustomError(landNFT, "NotAdministrator");
    });

    it("Should not allow setting zero address as admin", async function () {
      await expect(landNFT.connect(owner).changeAdmin(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(landNFT, "InvalidAddress");
    });
  });

  describe("Minting", function () {
    it("Should allow admin to mint tokens", async function () {
      const tokenId = 1;
      await expect(landNFT.connect(admin).safeMint(await user1.getAddress(), tokenId))
        .to.emit(landNFT, "Transfer")
        .withArgs(ethers.ZeroAddress, await user1.getAddress(), tokenId);
      
      expect(await landNFT.ownerOf(tokenId)).to.equal(await user1.getAddress());
    });

    it("Should not allow non-admin to mint tokens", async function () {
      await expect(landNFT.connect(user1).safeMint(await user1.getAddress(), 1))
        .to.be.revertedWithCustomError(landNFT, "NotAdministrator");
    });

    //For testing you have to create a new contract "TestLandNFT" with 'uint256 public constant maxSupply = 10;'
    it("Should not mint beyond max supply (optimized test)", async function () {
        const TestLandNFT = await ethers.getContractFactory("TestLandNFT");
        const testLandNFT = await TestLandNFT.deploy(await owner.getAddress());
        await testLandNFT.changeAdmin(await admin.getAddress());
        
        const testMaxSupply = await testLandNFT.maxSupply();
        
        const batch = Array.from({length: Number(testMaxSupply)}, (_, i) => BigInt(i) + 1n);
        await testLandNFT.connect(admin).batchMint(await user1.getAddress(), batch);
        
        await expect(testLandNFT.connect(admin).safeMint(await user1.getAddress(), testMaxSupply + 1n))
            .to.be.revertedWithCustomError(testLandNFT, "MaxSupplyOverflow");
    });

    it("Should allow batch minting", async function () {
      const tokenIds = [1, 2, 3];
      await landNFT.connect(admin).batchMint(await user1.getAddress(), tokenIds);
      
      for (const id of tokenIds) {
        expect(await landNFT.ownerOf(id)).to.equal(await user1.getAddress());
      }
    });
  });

  describe("Pausing", function () {
    it("Should allow owner to pause contract", async function () {
      await expect(landNFT.connect(owner).pauseContract(true))
        .to.emit(landNFT, "Paused");
      
      const state = await landNFT.getContractState();
      expect(state[2]).to.equal(false); // contract is paused
    });

    it("Should allow admin to pause contract", async function () {
      await expect(landNFT.connect(admin).pauseContract(true))
        .to.emit(landNFT, "Paused");
      
      const state = await landNFT.getContractState();
      expect(state[2]).to.equal(false); // contract is paused
    });

    it("Should not allow non-owner/admin to pause contract", async function () {
      await expect(landNFT.connect(user1).pauseContract(true))
        .to.be.revertedWithCustomError(landNFT, "NotAdministrator");
    });

    it("Should prevent minting when paused", async function () {
      await landNFT.connect(owner).pauseContract(true);
      
      await expect(landNFT.connect(admin).safeMint(await user1.getAddress(), 1))
        .to.be.revertedWithCustomError(landNFT, "ContractPaused");
    });
  });

  describe("Batch operations", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      await landNFT.connect(admin).batchMint(await user1.getAddress(), [1, 2, 3]);
    });

    it("Should return correct owners for batch", async function () {
      const owners = await landNFT.batchOwnerOf([1, 2, 3]);
      for (const owner of owners) {
        expect(owner).to.equal(await user1.getAddress());
      }
    });

    it("Should return all owned tokens", async function () {
      const tokens = await landNFT.allOwnedTokens(await user1.getAddress());
      expect(tokens).to.have.lengthOf(3);
      expect(tokens.map(Number)).to.deep.equal([1, 2, 3]);
    });

    it("Should allow batch transfer", async function () {
      await landNFT.connect(admin).batchMint(await admin.getAddress(), [4, 5, 6]);
      await landNFT.connect(admin).batchTransfer(await user1.getAddress(), [4, 5]);
      
      expect(await landNFT.batchOwnerOf([4, 5])).to.deep.equal([
        await user1.getAddress(),
        await user1.getAddress()
      ]);
      expect(await landNFT.ownerOf(6)).to.equal(await admin.getAddress());
    });

    it("Should allow transfer any token to admin", async function () {
      await landNFT.connect(admin).returnToAdmin (5);
      expect(await landNFT.ownerOf(5)).to.equal(await admin.getAddress());

      await expect(landNFT.connect(user2).returnToAdmin (4)).to.be.revertedWithCustomError(landNFT, "NotAdministrator");
    });

    it("Should not allow batch transfer to zero address", async function () {
      await expect(landNFT.connect(admin).batchTransfer(ethers.ZeroAddress, [6]))
        .to.be.revertedWithCustomError(landNFT, "InvalidReceiver");
    });
  });

  describe("Base URI", function () {
    it("Should allow owner to set base URI", async function () {
      let newURI = "https://example.com/tokens/";
      await expect(landNFT.connect(owner).setBaseURI(newURI))
        .to.emit(landNFT, "BaseURIChanged")
        .withArgs(newURI);
      
      expect(await landNFT.baseURI()).to.equal(newURI);
    });

    it("Should not allow non-owner to set base URI", async function () {
      await expect(landNFT.connect(admin).setBaseURI("new-uri"))
        .to.be.reverted;
    });
  });

  describe("SupportsInterface", function () {
    it("Should support ERC721 interface", async function () {
      // ERC721 interface ID
      expect(await landNFT.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("Should support ERC721Enumerable interface", async function () {
      // ERC721Enumerable interface ID
      expect(await landNFT.supportsInterface("0x780e9d63")).to.be.true;
    });
  });
});