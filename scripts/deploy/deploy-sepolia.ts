import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n🚀 Deploying EXB contracts to Sepolia`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1. Deploy TaskRegistry (0.001 ETH registration fee)
  const registrationFee = ethers.parseEther("0.001");
  const Registry = await ethers.getContractFactory("TaskRegistry");
  const registry = await Registry.deploy(registrationFee, deployer.address);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`✅ TaskRegistry:    ${registryAddr}`);

  // 2. Deploy DeadMansSwitch example
  //    - beneficiary = deployer (for testing)
  //    - 50 block check-in interval (~10 min on Sepolia)
  //    - 0.001 ETH bounty
  //    - funded with 0.01 ETH
  const interval = 50;
  const bounty = ethers.parseEther("0.0001");
  const funding = ethers.parseEther("0.001");

  const DMS = await ethers.getContractFactory("DeadMansSwitch");
  const dms = await DMS.deploy(deployer.address, interval, bounty, { value: funding });
  await dms.waitForDeployment();
  const dmsAddr = await dms.getAddress();
  console.log(`✅ DeadMansSwitch:  ${dmsAddr}`);
  console.log(`   Interval: ${interval} blocks | Bounty: ${ethers.formatEther(bounty)} ETH | Funded: ${ethers.formatEther(funding)} ETH`);

  // 3. Register DeadMansSwitch in TaskRegistry
  const tx = await registry.register(dmsAddr, { value: registrationFee });
  await tx.wait();
  console.log(`✅ Registered DeadMansSwitch in TaskRegistry`);

  // Summary
  console.log(`\n📋 Deployment Summary`);
  console.log(`   TaskRegistry:   ${registryAddr}`);
  console.log(`   DeadMansSwitch: ${dmsAddr}`);
  console.log(`\n   To run the executor bot:`);
  console.log(`   RPC_URL=<sepolia_rpc> PRIVATE_KEY=<key> REGISTRY_ADDRESS=${registryAddr} npm start`);
  console.log(`\n   The DeadMansSwitch task becomes executable after ~${interval} blocks (~10 min).`);
  console.log(`   Call checkIn() on the DMS contract to reset the timer.`);
  console.log(`   Or let it expire and watch the bot execute it.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
