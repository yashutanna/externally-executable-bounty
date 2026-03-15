import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("E2E: Registry → DeadMansSwitch → Execute", function () {
  async function deployAll() {
    const [deployer, beneficiary, executor] = await ethers.getSigners();

    // Deploy registry
    const fee = ethers.parseEther("0.001");
    const Registry = await ethers.getContractFactory("TaskRegistry");
    const registry = await Registry.deploy(fee, deployer.address);

    // Deploy DMS
    const interval = 20;
    const bounty = ethers.parseEther("0.01");
    const DMS = await ethers.getContractFactory("DeadMansSwitch");
    const dms = await DMS.deploy(beneficiary.address, interval, bounty, {
      value: ethers.parseEther("1"),
    });

    // Register
    await registry.register(await dms.getAddress(), { value: fee });

    return { registry, dms, deployer, beneficiary, executor, interval, bounty };
  }

  it("full flow: discover via registry → find executable tasks → execute → collect bounty", async function () {
    const { registry, dms, executor, beneficiary, interval, bounty } = await loadFixture(deployAll);

    // 1. Executor discovers contracts via registry
    const contracts = await registry.getActiveContracts();
    expect(contracts.length).to.equal(1);

    // 2. No tasks executable yet
    const dmsContract = await ethers.getContractAt("DeadMansSwitch", contracts[0]);
    let tasks = await dmsContract.getExecutableTasks();
    expect(tasks.length).to.equal(0);

    // 3. Wait for deadline
    await mine(interval + 1);

    // 4. Now tasks are executable
    tasks = await dmsContract.getExecutableTasks();
    expect(tasks.length).to.equal(1);

    // 5. Check bounty is worth it
    const [token, amount] = await dmsContract.taskBounty(tasks[0]);
    expect(token).to.equal(ethers.ZeroAddress); // ETH
    expect(amount).to.equal(bounty);

    // 6. Execute and collect
    const balBefore = await ethers.provider.getBalance(executor.address);
    const tx = await dmsContract.connect(executor).executeTask(tasks[0]);
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const balAfter = await ethers.provider.getBalance(executor.address);

    // Executor profited (bounty - gas)
    const profit = balAfter - balBefore;
    expect(profit + gasCost).to.equal(bounty);
    expect(profit).to.be.greaterThan(0n);

    // 7. Beneficiary received the funds
    const beneficiaryBal = await ethers.provider.getBalance(beneficiary.address);
    // beneficiary started with 10000 ETH (hardhat default) + (1 ETH - 0.01 bounty)
    expect(beneficiaryBal).to.equal(ethers.parseEther("10000") + ethers.parseEther("1") - bounty);

    // 8. No more executable tasks
    tasks = await dmsContract.getExecutableTasks();
    expect(tasks.length).to.equal(0);

    console.log(`\n  ✅ E2E passed: executor profit = ${ethers.formatEther(profit)} ETH (after ${ethers.formatEther(gasCost)} ETH gas)\n`);
  });
});
