import { ethers } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'

const ARTIFACT_PATH = path.join(__dirname, '..', 'artifacts', 'ClawGuild.json')
const ENV_PATH = path.join(__dirname, '..', '..', '.env')

// Sepolia config (supports both Base Sepolia and Sepolia L1)
const RPC_URL = process.env.CHAIN_RPC || process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111)

async function deploy() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) {
    // Generate a new wallet if no key provided
    const wallet = ethers.Wallet.createRandom()
    console.log('\n[Deploy] No DEPLOYER_PRIVATE_KEY found. Generated new wallet:')
    console.log(`  Address:     ${wallet.address}`)
    console.log(`  Private Key: ${wallet.privateKey}`)
    console.log(`\n  Fund this wallet with Base Sepolia ETH:`)
    console.log(`  Faucet: https://www.alchemy.com/faucets/base-sepolia`)
    console.log(`  Faucet: https://faucet.quicknode.com/base/sepolia`)
    console.log(`\n  Then add to .env:`)
    console.log(`  DEPLOYER_PRIVATE_KEY=${wallet.privateKey}`)
    console.log(`  DEPLOYER_ADDRESS=${wallet.address}`)

    // Auto-write to .env
    const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
    const newVars = [
      `\n# Base Sepolia (auto-generated ${new Date().toISOString()})`,
      `DEPLOYER_PRIVATE_KEY=${wallet.privateKey}`,
      `DEPLOYER_ADDRESS=${wallet.address}`,
      `RPC_URL=${RPC_URL}`,
      `CHAIN_CONTRACT_ADDRESS=`,
      '',
    ].join('\n')

    if (!envContent.includes('DEPLOYER_PRIVATE_KEY')) {
      fs.writeFileSync(ENV_PATH, envContent + newVars)
      console.log(`\n  Auto-written to ${ENV_PATH}`)
    }
    return
  }

  // Load artifact
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.error('[Deploy] Artifact not found. Run: pnpm -C contracts compile')
    process.exit(1)
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'))
  console.log(`[Deploy] Loaded artifact: ${artifact.contractName}`)
  console.log(`[Deploy] RPC: ${RPC_URL}`)
  console.log(`[Deploy] Chain ID: ${CHAIN_ID}`)

  // Connect to Base Sepolia
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID)
  const wallet = new ethers.Wallet(privateKey, provider)

  console.log(`[Deploy] Deployer: ${wallet.address}`)

  const balance = await provider.getBalance(wallet.address)
  console.log(`[Deploy] Balance: ${ethers.formatEther(balance)} ETH`)

  if (balance === 0n) {
    console.error('[Deploy] Wallet has no ETH! Fund it first.')
    console.log(`  Address: ${wallet.address}`)
    console.log(`  Faucet: https://www.alchemy.com/faucets/base-sepolia`)
    process.exit(1)
  }

  // Deploy
  console.log('[Deploy] Deploying ClawGuild contract...')
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)

  const contract = await factory.deploy()
  console.log(`[Deploy] TX sent: ${contract.deploymentTransaction()?.hash}`)

  await contract.waitForDeployment()
  const address = await contract.getAddress()

  console.log(`[Deploy] Contract deployed at: ${address}`)
  const explorer = CHAIN_ID === 84532 ? 'https://sepolia.basescan.org' : 'https://sepolia.etherscan.io'
  console.log(`[Deploy] View on explorer: ${explorer}/address/${address}`)

  // Save contract address to .env
  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
  if (envContent.includes('CHAIN_CONTRACT_ADDRESS=')) {
    const updated = envContent.replace(
      /CHAIN_CONTRACT_ADDRESS=.*/,
      `CHAIN_CONTRACT_ADDRESS=${address}`
    )
    fs.writeFileSync(ENV_PATH, updated)
  } else {
    fs.appendFileSync(ENV_PATH, `\nCHAIN_CONTRACT_ADDRESS=${address}\n`)
  }

  console.log(`[Deploy] Contract address saved to .env`)
  console.log('\n[Deploy] Done! The system is ready for on-chain transactions.')
}

deploy().catch(err => {
  console.error('[Deploy] Error:', err.message)
  process.exit(1)
})
