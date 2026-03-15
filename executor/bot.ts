import { ethers } from "ethers";

// --- ABI fragments for IExternallyExecutableBounty ---
const EXB_ABI = [
  "function getExecutableTasks() external view returns (uint256[])",
  "function executeTask(uint256 taskId) external",
  "function taskBounty(uint256 taskId) external view returns (address token, uint256 amount)",
  "function taskCount() external view returns (uint256)",
  "event TaskExecuted(uint256 indexed taskId, address indexed executor, address bountyToken, uint256 bountyAmount)",
];

const REGISTRY_ABI = [
  "function getActiveContracts() external view returns (address[])",
  "function entryCount() external view returns (uint256)",
];

interface BotConfig {
  rpcUrl: string;
  privateKey: string;
  registryAddress: string;
  pollIntervalMs: number;
  minProfitWei: bigint; // minimum profit after gas to bother executing
  maxGasPrice: bigint; // max gas price willing to pay (wei)
  dryRun: boolean;
}

interface TaskInfo {
  contract: string;
  taskId: bigint;
  bountyToken: string;
  bountyAmount: bigint;
}

function loadConfig(): BotConfig {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing env var: ${key}`);
    return val;
  };

  return {
    rpcUrl: required("RPC_URL"),
    privateKey: required("PRIVATE_KEY"),
    registryAddress: required("REGISTRY_ADDRESS"),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "12000"), // ~1 block on mainnet
    minProfitWei: BigInt(process.env.MIN_PROFIT_WEI || "0"),
    maxGasPrice: BigInt(process.env.MAX_GAS_PRICE || "50000000000"), // 50 gwei default
    dryRun: process.env.DRY_RUN === "true",
  };
}

class ExbExecutor {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private registry: ethers.Contract;
  private config: BotConfig;
  private executing: Set<string> = new Set(); // track in-flight executions

  constructor(config: BotConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.registry = new ethers.Contract(config.registryAddress, REGISTRY_ABI, this.provider);
  }

  async start(): Promise<void> {
    console.log(`\n🤖 EXB Executor Bot`);
    console.log(`   Wallet:   ${this.wallet.address}`);
    console.log(`   Registry: ${this.config.registryAddress}`);
    console.log(`   Poll:     ${this.config.pollIntervalMs}ms`);
    console.log(`   Dry run:  ${this.config.dryRun}`);

    const balance = await this.provider.getBalance(this.wallet.address);
    console.log(`   Balance:  ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
      console.warn(`\n⚠️  Wallet has zero balance. Execution will fail.`);
    }

    console.log(`\n   Scanning for tasks...\n`);

    // Main loop
    while (true) {
      try {
        await this.poll();
      } catch (err: any) {
        console.error(`❌ Poll error: ${err.message}`);
      }
      await this.sleep(this.config.pollIntervalMs);
    }
  }

  private async poll(): Promise<void> {
    // 1. Get all registered contracts
    const contracts: string[] = await this.registry.getActiveContracts();
    if (contracts.length === 0) return;

    // 2. Check each contract for executable tasks
    for (const addr of contracts) {
      try {
        await this.checkContract(addr);
      } catch (err: any) {
        // Don't let one bad contract kill the loop
        console.error(`   ⚠️  Error checking ${addr}: ${err.message}`);
      }
    }
  }

  private async checkContract(addr: string): Promise<void> {
    const contract = new ethers.Contract(addr, EXB_ABI, this.provider);

    const taskIds: bigint[] = await contract.getExecutableTasks();
    if (taskIds.length === 0) return;

    console.log(`📋 ${addr}: ${taskIds.length} executable task(s)`);

    for (const taskId of taskIds) {
      const key = `${addr}-${taskId}`;
      if (this.executing.has(key)) continue; // already in flight

      try {
        await this.evaluateAndExecute(contract, addr, taskId);
      } catch (err: any) {
        console.error(`   ❌ Task ${taskId}: ${err.message}`);
      }
    }
  }

  private async evaluateAndExecute(
    contract: ethers.Contract,
    addr: string,
    taskId: bigint
  ): Promise<void> {
    // Get bounty info
    const [bountyToken, bountyAmount] = await contract.taskBounty(taskId);
    const isNative = bountyToken === ethers.ZeroAddress;

    console.log(
      `   💰 Task ${taskId}: bounty = ${
        isNative ? ethers.formatEther(bountyAmount) + " ETH" : bountyAmount + " tokens (" + bountyToken + ")"
      }`
    );

    // Estimate gas
    const connectedContract = contract.connect(this.wallet) as ethers.Contract;
    let gasEstimate: bigint;
    try {
      gasEstimate = await connectedContract.executeTask.estimateGas(taskId);
    } catch (err: any) {
      console.log(`   ⏭️  Task ${taskId}: gas estimation failed (likely not ready) — skipping`);
      return;
    }

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || 0n;

    if (gasPrice > this.config.maxGasPrice) {
      console.log(`   ⏭️  Task ${taskId}: gas price ${ethers.formatUnits(gasPrice, "gwei")} gwei > max — skipping`);
      return;
    }

    const gasCost = gasEstimate * gasPrice;

    // Profitability check (only for native bounties — ERC20 needs price oracle)
    if (isNative) {
      const profit = bountyAmount - gasCost;
      console.log(
        `   ⛽ Gas: ${ethers.formatEther(gasCost)} ETH | Profit: ${ethers.formatEther(profit)} ETH`
      );

      if (profit < this.config.minProfitWei) {
        console.log(`   ⏭️  Task ${taskId}: unprofitable — skipping`);
        return;
      }
    }

    // Execute
    if (this.config.dryRun) {
      console.log(`   🏃 Task ${taskId}: would execute (dry run)`);
      return;
    }

    const key = `${addr}-${taskId}`;
    this.executing.add(key);

    try {
      console.log(`   🚀 Task ${taskId}: executing...`);
      const tx = await connectedContract.executeTask(taskId, {
        gasLimit: gasEstimate * 120n / 100n, // 20% buffer
      });
      console.log(`   📤 Task ${taskId}: tx ${tx.hash}`);

      const receipt = await tx.wait();
      const actualGas = receipt.gasUsed * receipt.gasPrice;
      console.log(
        `   ✅ Task ${taskId}: confirmed in block ${receipt.blockNumber} | gas used: ${ethers.formatEther(actualGas)} ETH`
      );
    } catch (err: any) {
      console.error(`   ❌ Task ${taskId}: execution failed — ${err.message}`);
    } finally {
      this.executing.delete(key);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- Main ---
async function main() {
  const config = loadConfig();
  const bot = new ExbExecutor(config);
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
