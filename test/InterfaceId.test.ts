import { ethers } from "hardhat";

describe("InterfaceId", function () {
  it("should output the ERC-165 interface ID for IExternallyExecutableBounty", async function () {
    const factory = await ethers.getContractFactory("InterfaceId");
    const helper = await factory.deploy();
    const id = await helper.getInterfaceId();
    console.log(`\n  IExternallyExecutableBounty interface ID: ${id}\n`);
  });
});
