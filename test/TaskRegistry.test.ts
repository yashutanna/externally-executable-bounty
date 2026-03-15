import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("TaskRegistry", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    const fee = ethers.parseEther("0.001");

    const Registry = await ethers.getContractFactory("TaskRegistry");
    const registry = await Registry.deploy(fee);

    // Deploy a valid IScheduledTask contract to register
    const DMS = await ethers.getContractFactory("DeadMansSwitch");
    const dms = await DMS.deploy(user2.address, 100, ethers.parseEther("0.01"), {
      value: ethers.parseEther("1"),
    });

    return { registry, dms, owner, user1, user2, fee };
  }

  it("should register a valid contract", async function () {
    const { registry, dms, user1, fee } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress(), { value: fee });

    const active = await registry.getActiveContracts();
    expect(active.length).to.equal(1);
    expect(active[0]).to.equal(await dms.getAddress());
  });

  it("should reject registration with insufficient fee", async function () {
    const { registry, dms, user1 } = await loadFixture(deployFixture);
    await expect(
      registry.connect(user1).register(await dms.getAddress(), { value: 0 })
    ).to.be.revertedWithCustomError(registry, "InsufficientFee");
  });

  it("should reject duplicate registration", async function () {
    const { registry, dms, user1, fee } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress(), { value: fee });
    await expect(
      registry.connect(user1).register(await dms.getAddress(), { value: fee })
    ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
  });

  it("should reject invalid contract (no taskCount)", async function () {
    const { registry, user1, fee } = await loadFixture(deployFixture);
    // Try to register an EOA — reverts (either custom error or low-level)
    await expect(
      registry.connect(user1).register(user1.address, { value: fee })
    ).to.be.reverted;
  });

  it("should allow deregistration by registrant", async function () {
    const { registry, dms, user1, fee } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress(), { value: fee });
    await registry.connect(user1).deregister(await dms.getAddress());

    const active = await registry.getActiveContracts();
    expect(active.length).to.equal(0);
  });

  it("should allow owner to withdraw fees", async function () {
    const { registry, dms, owner, user1, fee } = await loadFixture(deployFixture);
    await registry.connect(user1).register(await dms.getAddress(), { value: fee });

    const before = await ethers.provider.getBalance(owner.address);
    const tx = await registry.connect(owner).withdraw();
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);

    expect(after - before + gasCost).to.equal(fee);
  });
});
