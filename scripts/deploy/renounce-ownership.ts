import { ethers } from "hardhat";

const REGISTRY = "0x8ab5A33c3Fdac8cB86301D925aB12C4565e91ce2";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  const registry = await ethers.getContractAt("TaskRegistry", REGISTRY);
  const currentOwner = await registry.owner();
  
  console.log(`\n🔓 Renouncing ownership on ${network.name} (${network.chainId})`);
  console.log(`   Registry: ${REGISTRY}`);
  console.log(`   Current owner: ${currentOwner}`);
  
  if (currentOwner === ethers.ZeroAddress) {
    console.log(`   Already renounced ✅`);
    return;
  }
  
  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Not the owner. Owner is ${currentOwner}, deployer is ${deployer.address}`);
  }

  const tx = await registry.transferOwnership(ethers.ZeroAddress);
  const receipt = await tx.wait(2);
  console.log(`   ✅ Ownership renounced (block ${receipt!.blockNumber})`);
  
  const newOwner = await registry.owner();
  console.log(`   New owner: ${newOwner}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
