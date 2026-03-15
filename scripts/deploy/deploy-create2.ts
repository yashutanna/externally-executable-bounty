import { ethers } from "hardhat";

// Deterministic Deployment Proxy (exists on all major EVM chains)
// https://github.com/Arachnid/deterministic-deployment-proxy
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT = ethers.id("exb-v2"); // deterministic salt

async function deployCreate2(name: string, bytecode: string, constructorArgs: string) {
  const [deployer] = await ethers.getSigners();
  const initCode = ethers.concat([bytecode, constructorArgs]);
  
  // Compute deterministic address
  const address = ethers.getCreate2Address(CREATE2_FACTORY, SALT, ethers.keccak256(initCode));
  
  // Check if already deployed
  const existing = await ethers.provider.getCode(address);
  if (existing !== "0x") {
    console.log(`   ${name}: already deployed at ${address} ✅`);
    return address;
  }

  // Deploy via CREATE2 factory
  const tx = await deployer.sendTransaction({
    to: CREATE2_FACTORY,
    data: ethers.concat([SALT, initCode]),
  });
  const receipt = await tx.wait(2);
  
  // Verify deployment
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${name} deployment failed — no code at ${address}`);
  }
  
  console.log(`   ${name}: ${address} (block ${receipt!.blockNumber}) ✅`);
  return address;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(deployer.address);
  
  console.log(`\n🚀 CREATE2 Deployment`);
  console.log(`   Chain:    ${network.name} (${network.chainId})`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance:  ${ethers.formatEther(bal)} ETH`);
  console.log(`   Salt:     ${SALT}\n`);

  // Check CREATE2 factory exists on this chain
  const factoryCode = await ethers.provider.getCode(CREATE2_FACTORY);
  if (factoryCode === "0x") {
    throw new Error(`CREATE2 factory not found at ${CREATE2_FACTORY} on this chain`);
  }

  // 1. Deploy TaskRegistry — permissionless, no owner, no fees
  const Registry = await ethers.getContractFactory("TaskRegistry");
  const registryAddr = await deployCreate2("TaskRegistry", Registry.bytecode, "0x");
  
  const finalBal = await ethers.provider.getBalance(deployer.address);
  console.log(`\n📋 Deployment Summary`);
  console.log(`   Chain:        ${network.name} (${network.chainId})`);
  console.log(`   TaskRegistry: ${registryAddr}`);
  console.log(`   Cost:         ${ethers.formatEther(bal - finalBal)} ETH`);
  console.log(`   Remaining:    ${ethers.formatEther(finalBal)} ETH`);
  console.log(`\n   This address will be THE SAME on all EVM chains.`);
  console.log(`   Just run this script on each chain to deploy.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
