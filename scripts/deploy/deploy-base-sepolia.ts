import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n🚀 Deploying EXB contracts to Base Sepolia`);
  console.log(`   Deployer: ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`   Balance:  ${ethers.formatEther(bal)} ETH\n`);

  // 1. Deploy TaskRegistry
  const registrationFee = ethers.parseEther("0.0001");
  console.log(`   Deploying TaskRegistry...`);
  const Registry = await ethers.getContractFactory("TaskRegistry");
  const registry = await Registry.deploy(registrationFee, deployer.address);
  const registryReceipt = await registry.deploymentTransaction()!.wait(2); // wait 2 confirms
  const registryAddr = await registry.getAddress();
  console.log(`✅ TaskRegistry:    ${registryAddr} (block ${registryReceipt!.blockNumber})`);

  // 2. Deploy DeadMansSwitch
  const interval = 50; // ~100s on Base Sepolia (2s blocks)
  const bounty = ethers.parseEther("0.0001");
  const funding = ethers.parseEther("0.001");

  console.log(`   Deploying DeadMansSwitch...`);
  const DMS = await ethers.getContractFactory("DeadMansSwitch");
  const dms = await DMS.deploy(deployer.address, interval, bounty, { value: funding });
  const dmsReceipt = await dms.deploymentTransaction()!.wait(2);
  const dmsAddr = await dms.getAddress();
  console.log(`✅ DeadMansSwitch:  ${dmsAddr} (block ${dmsReceipt!.blockNumber})`);

  // 3. Register DMS in registry
  console.log(`   Registering DeadMansSwitch in TaskRegistry...`);
  const regTx = await registry.register(dmsAddr, { value: registrationFee });
  await regTx.wait(2);
  console.log(`✅ Registered in TaskRegistry`);

  // Summary
  const finalBal = await ethers.provider.getBalance(deployer.address);
  console.log(`\n📋 Deployment Summary (Base Sepolia)`);
  console.log(`   TaskRegistry:   ${registryAddr}`);
  console.log(`   DeadMansSwitch: ${dmsAddr}`);
  console.log(`   Deployer spent: ${ethers.formatEther(bal - finalBal)} ETH`);
  console.log(`   Remaining:      ${ethers.formatEther(finalBal)} ETH`);
  console.log(`\n   Task becomes executable in ~${interval} blocks (~${interval * 2}s)`);
  console.log(`\n   Executor bot:`);
  console.log(`   RPC_URL=https://sepolia.base.org PRIVATE_KEY=<key> REGISTRY_ADDRESS=${registryAddr} npm start\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
