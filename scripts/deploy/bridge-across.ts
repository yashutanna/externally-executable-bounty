// Bridge ETH from Base to Ethereum + Arbitrum via Across Protocol
import { ethers } from "ethers";
import { execSync } from "child_process";

const SPOKE_POOL = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const ZERO = "0x0000000000000000000000000000000000000000";
const WALLET = "0xF00CAAb8E02378384d133347F15698F2A704b3A5";

const ABI = [
  "function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message) payable",
];

async function getQuote(destChainId: number, amount: string) {
  const url = `https://app.across.to/api/suggested-fees?inputToken=${WETH_BASE}&outputToken=${ZERO}&originChainId=8453&destinationChainId=${destChainId}&amount=${amount}&skipAmountLimit=true`;
  const res = await fetch(url);
  return res.json();
}

async function bridge(signer: ethers.Wallet, destChainId: number, amount: bigint, chainName: string) {
  console.log(`\n🌉 Bridging ${ethers.formatEther(amount)} ETH → ${chainName} (chain ${destChainId})`);

  const quote = await getQuote(destChainId, amount.toString());
  const outputAmount = BigInt(quote.outputAmount);
  const fee = amount - outputAmount;
  console.log(`   Output: ${ethers.formatEther(outputAmount)} ETH | Fee: ${ethers.formatEther(fee)} ETH`);

  const spokePool = new ethers.Contract(SPOKE_POOL, ABI, signer);

  const quoteTimestamp = parseInt(quote.timestamp);
  const fillDeadline = parseInt(quote.fillDeadline);
  // exclusivityDeadline from API is relative seconds — convert to absolute
  const exclusivityDeadline = quoteTimestamp + parseInt(quote.exclusivityDeadline);

  const tx = await spokePool.depositV3(
    WALLET,
    WALLET,
    WETH_BASE,
    ZERO,
    amount,
    outputAmount,
    destChainId,
    quote.exclusiveRelayer,
    quoteTimestamp,
    fillDeadline,
    exclusivityDeadline,
    "0x",
    { value: amount }
  );

  const receipt = await tx.wait(2);
  console.log(`   ✅ TX: ${tx.hash} (block ${receipt!.blockNumber})`);
  return tx.hash;
}

async function main() {
  const key = execSync("security find-generic-password -s paymeback-deployer-key -a deployer -w")
    .toString().trim();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const signer = new ethers.Wallet(key, provider);

  const bal = await provider.getBalance(WALLET);
  console.log(`💰 Base balance: ${ethers.formatEther(bal)} ETH`);

  const amount = ethers.parseEther("0.001");

  // Bridge to Ethereum
  await bridge(signer, 1, amount, "Ethereum");

  // Bridge to Arbitrum
  await bridge(signer, 42161, amount, "Arbitrum");

  const remaining = await provider.getBalance(WALLET);
  console.log(`\n💰 Remaining on Base: ${ethers.formatEther(remaining)} ETH`);
  console.log(`\n⏳ Funds should arrive in 2-10 minutes. Then run deploy-create2.ts on each chain.`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
