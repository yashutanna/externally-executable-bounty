import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("TaskRegistry", function () {
  async function deployFixture() {
    const [deployer, user1, user2] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("TaskRegistry");
    const registry = await Registry.deploy();

    // Deploy a valid IExternallyExecutableBounty contract to register
    const DMS = await ethers.getContractFactory("DeadMansSwitch");
    const dms = await DMS.deploy(user2.address, 100, ethers.parseEther("0.01"), {
      value: ethers.parseEther("1"),
    });

    return { registry, dms, deployer, user1, user2 };
  }

  it("should register a valid contract", async function () {
    const { registry, dms, user1 } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress());

    const active = await registry.getActiveContracts();
    expect(active.length).to.equal(1);
    expect(active[0]).to.equal(await dms.getAddress());
  });

  it("should reject duplicate registration", async function () {
    const { registry, dms, user1 } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress());
    await expect(
      registry.connect(user1).register(await dms.getAddress())
    ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
  });

  it("should reject invalid contract (no taskCount)", async function () {
    const { registry, user1 } = await loadFixture(deployFixture);
    await expect(
      registry.connect(user1).register(user1.address)
    ).to.be.reverted;
  });

  it("should allow deregistration by registrant", async function () {
    const { registry, dms, user1 } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress());
    await registry.connect(user1).deregister(await dms.getAddress());

    const active = await registry.getActiveContracts();
    expect(active.length).to.equal(0);
  });

  it("should reject deregistration by non-registrant", async function () {
    const { registry, dms, user1, user2 } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress());
    await expect(
      registry.connect(user2).deregister(await dms.getAddress())
    ).to.be.revertedWithCustomError(registry, "NotRegistrant");
  });

  it("should paginate active contracts", async function () {
    const { registry, dms, deployer, user1 } = await loadFixture(deployFixture);

    // Deploy a second contract
    const DMS2 = await ethers.getContractFactory("DeadMansSwitch");
    const dms2 = await DMS2.deploy(user1.address, 200, ethers.parseEther("0.01"), {
      value: ethers.parseEther("1"),
    });

    await registry.connect(user1).register(await dms.getAddress());
    await registry.connect(deployer).register(await dms2.getAddress());

    // Page 1: offset 0, limit 1
    const page1 = await registry.getActiveContractsPaginated(0, 1);
    expect(page1.length).to.equal(1);
    expect(page1[0]).to.equal(await dms.getAddress());

    // Page 2: offset 1, limit 1
    const page2 = await registry.getActiveContractsPaginated(1, 1);
    expect(page2.length).to.equal(1);
    expect(page2[0]).to.equal(await dms2.getAddress());

    // Out of bounds
    const page3 = await registry.getActiveContractsPaginated(10, 5);
    expect(page3.length).to.equal(0);
  });

  it("should track entry count", async function () {
    const { registry, dms, user1 } = await loadFixture(deployFixture);
    expect(await registry.entryCount()).to.equal(0);

    await registry.connect(user1).register(await dms.getAddress());
    expect(await registry.entryCount()).to.equal(1);

    // Deregister — count stays (entry still in array, just inactive)
    await registry.connect(user1).deregister(await dms.getAddress());
    expect(await registry.entryCount()).to.equal(1);
  });
});
