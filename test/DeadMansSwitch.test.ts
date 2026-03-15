import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("DeadMansSwitch", function () {
  async function deployFixture() {
    const [owner, beneficiary, executor] = await ethers.getSigners();
    const interval = 100; // blocks
    const bounty = ethers.parseEther("0.01");
    const deposit = ethers.parseEther("1");

    const DMS = await ethers.getContractFactory("DeadMansSwitch");
    const dms = await DMS.deploy(beneficiary.address, interval, bounty, {
      value: deposit,
    });

    return { dms, owner, beneficiary, executor, interval, bounty, deposit };
  }

  it("should not be executable before deadline", async function () {
    const { dms, executor } = await loadFixture(deployFixture);
    const tasks = await dms.getExecutableTasks();
    expect(tasks.length).to.equal(0);

    await expect(dms.connect(executor).executeTask(0)).to.be.revertedWithCustomError(dms, "TaskNotReady");
  });

  it("should be executable after deadline", async function () {
    const { dms, executor, interval } = await loadFixture(deployFixture);
    await mine(interval + 1);

    const tasks = await dms.getExecutableTasks();
    expect(tasks.length).to.equal(1);
    expect(tasks[0]).to.equal(0n);
  });

  it("should pay executor bounty and send rest to beneficiary", async function () {
    const { dms, beneficiary, executor, interval, bounty } = await loadFixture(deployFixture);
    await mine(interval + 1);

    const beneficiaryBefore = await ethers.provider.getBalance(beneficiary.address);
    const executorBefore = await ethers.provider.getBalance(executor.address);

    const tx = await dms.connect(executor).executeTask(0);
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;

    const executorAfter = await ethers.provider.getBalance(executor.address);
    const beneficiaryAfter = await ethers.provider.getBalance(beneficiary.address);

    // Executor got bounty minus gas
    expect(executorAfter - executorBefore + gasCost).to.equal(bounty);

    // Beneficiary got the rest
    const expectedBeneficiary = ethers.parseEther("1") - bounty;
    expect(beneficiaryAfter - beneficiaryBefore).to.equal(expectedBeneficiary);
  });

  it("should not be executable after execution (one-shot)", async function () {
    const { dms, executor, interval } = await loadFixture(deployFixture);
    await mine(interval + 1);
    await dms.connect(executor).executeTask(0);

    await expect(dms.connect(executor).executeTask(0)).to.be.revertedWithCustomError(dms, "TaskNotPending");
  });

  it("should reset deadline on checkIn", async function () {
    const { dms, owner, executor, interval } = await loadFixture(deployFixture);
    await mine(interval - 10);
    await dms.connect(owner).checkIn();

    // Should not be executable now (deadline pushed forward)
    await mine(10);
    const tasks = await dms.getExecutableTasks();
    expect(tasks.length).to.equal(0);
  });

  it("should allow owner to withdraw and cancel", async function () {
    const { dms, owner } = await loadFixture(deployFixture);
    const before = await ethers.provider.getBalance(owner.address);
    const tx = await dms.connect(owner).withdraw();
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);

    expect(after - before + gasCost).to.equal(ethers.parseEther("1"));
  });
});
