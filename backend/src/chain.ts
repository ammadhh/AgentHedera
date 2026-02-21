/**
 * chain.ts — Base Sepolia on-chain attestation layer
 *
 * Wraps ethers.js interactions with the ClawGuild contract.
 * Dual-write: chain for attestation, SQLite for fast reads.
 * Graceful fallback: if chain is unavailable, logs warning and continues.
 */
import { ethers } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'

// ── Config ──
const CHAIN_RPC = process.env.CHAIN_RPC || process.env.CHAIN_RPC || 'https://ethereum-sepolia-rpc.publicnode.com'
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111)
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1500

// ── State ──
let provider: ethers.JsonRpcProvider | null = null
let wallet: ethers.Wallet | null = null
let contract: ethers.Contract | null = null
let contractAddress: string | null = null
let chainReady = false
let txCount = 0
let currentNonce = -1

// ── Transaction Queue (prevents nonce collisions) ──
const txQueue: Array<() => Promise<void>> = []
let txProcessing = false

async function processTxQueue() {
  if (txProcessing) return
  txProcessing = true
  while (txQueue.length > 0) {
    const fn = txQueue.shift()!
    try {
      await fn()
    } catch (err: any) {
      console.warn('[Chain] Queue item failed:', err.message?.slice(0, 80))
    }
    // Small delay between transactions to let nonce propagate
    await new Promise(r => setTimeout(r, 300))
  }
  txProcessing = false
}

function enqueue(fn: () => Promise<void>) {
  txQueue.push(fn)
  processTxQueue()
}

// ── ABI (loaded from artifact) ──
let contractABI: any[] = []

function loadArtifact(): { abi: any[]; bytecode: string } | null {
  const artifactPath = path.join(__dirname, '..', '..', 'contracts', 'artifacts', 'ClawGuild.json')
  if (!fs.existsSync(artifactPath)) {
    console.warn('[Chain] Artifact not found at', artifactPath)
    return null
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
}

// ── Initialization ──
export async function initChain(): Promise<boolean> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  contractAddress = process.env.CHAIN_CONTRACT_ADDRESS || null

  if (!privateKey) {
    console.warn('[Chain] No DEPLOYER_PRIVATE_KEY — chain attestation disabled')
    return false
  }

  const artifact = loadArtifact()
  if (!artifact) {
    console.warn('[Chain] No contract artifact — chain attestation disabled')
    return false
  }
  contractABI = artifact.abi

  try {
    provider = new ethers.JsonRpcProvider(CHAIN_RPC, CHAIN_ID)
    wallet = new ethers.Wallet(privateKey, provider)
    console.log(`[Chain] Wallet: ${wallet.address}`)
    console.log(`[Chain] RPC: ${CHAIN_RPC}`)

    if (contractAddress) {
      contract = new ethers.Contract(contractAddress, contractABI, wallet)
      currentNonce = await provider.getTransactionCount(wallet.address)
      console.log(`[Chain] Contract: ${contractAddress}`)
      console.log(`[Chain] Nonce: ${currentNonce}`)
      console.log(`[Chain] Explorer: https://sepolia.etherscan.io/address/${contractAddress}`)
      chainReady = true
    } else {
      console.warn('[Chain] No CHAIN_CONTRACT_ADDRESS — will auto-deploy on first write')
    }

    return true
  } catch (err: any) {
    console.error('[Chain] Init error:', err.message)
    return false
  }
}

// ── Auto-deploy if no contract address ──
async function ensureContract(): Promise<boolean> {
  if (contract && chainReady) return true
  if (!wallet || !provider) return false

  const artifact = loadArtifact()
  if (!artifact) return false

  // Check balance
  try {
    const balance = await provider.getBalance(wallet.address)
    if (balance === 0n) {
      console.warn(`[Chain] Wallet has 0 ETH — fund ${wallet.address} on Base Sepolia`)
      return false
    }

    if (!contractAddress) {
      console.log('[Chain] Auto-deploying ClawGuild contract...')
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
      const deployed = await factory.deploy()
      await deployed.waitForDeployment()
      contractAddress = await deployed.getAddress()
      contract = new ethers.Contract(contractAddress, artifact.abi, wallet)
      chainReady = true
      console.log(`[Chain] Deployed at: ${contractAddress}`)
      console.log(`[Chain] BaseScan: https://sepolia.etherscan.io/address/${contractAddress}`)
      return true
    }

    contract = new ethers.Contract(contractAddress, artifact.abi, wallet)
    chainReady = true
    return true
  } catch (err: any) {
    console.warn('[Chain] Deploy/connect error:', err.message?.slice(0, 100))
    return false
  }
}

// ── Retry wrapper ──
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const msg = err.message?.slice(0, 80) || 'unknown'
      if (attempt < MAX_RETRIES) {
        console.warn(`[Chain] ${label} attempt ${attempt + 1} failed: ${msg} — retrying...`)
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
      } else {
        console.error(`[Chain] ${label} failed after ${MAX_RETRIES + 1} attempts: ${msg}`)
      }
    }
  }
  return null
}

// ── Helper to convert string ID to bytes32 ──
function toBytes32(id: string): string {
  // Hash the UUID string to get a deterministic bytes32
  return ethers.keccak256(ethers.toUtf8Bytes(id))
}

// ── Sequential send helper (prevents nonce collisions) ──
async function sendTx(label: string, fn: (nonce: number) => Promise<ethers.ContractTransactionResponse>): Promise<string | null> {
  if (!(await ensureContract()) || !contract || !provider || !wallet) return null
  return new Promise((resolve) => {
    enqueue(async () => {
      try {
        if (currentNonce < 0) currentNonce = await provider!.getTransactionCount(wallet!.address)
        const nonce = currentNonce++
        const tx = await fn(nonce)
        const receipt = await tx.wait()
        txCount++
        console.log(`[Chain] ${label} tx: ${receipt!.hash} (nonce ${nonce})`)
        resolve(receipt!.hash)
      } catch (err: any) {
        console.warn(`[Chain] ${label} failed: ${err.message?.slice(0, 80)}`)
        // Reset nonce on failure so next tx fetches fresh
        currentNonce = -1
        resolve(null)
      }
    })
  })
}

// ── Public Functions (queued, non-blocking) ──

export async function chainRegisterAgent(agentId: string, name: string, skills: string[]): Promise<string | null> {
  return sendTx('AgentRegistered', (nonce) =>
    contract!.registerAgent(toBytes32(agentId), name, JSON.stringify(skills), { nonce }))
}

export async function chainCreateJob(jobId: string, title: string, skill: string, budget: number): Promise<string | null> {
  return sendTx('JobCreated', (nonce) =>
    contract!.createJob(toBytes32(jobId), title, skill, Math.round(budget * 100), { nonce }))
}

export async function chainPlaceBid(jobId: string, agentId: string, price: number): Promise<string | null> {
  return sendTx('BidPlaced', (nonce) =>
    contract!.placeBid(toBytes32(jobId), toBytes32(agentId), Math.round(price * 100), { nonce }))
}

export async function chainAssignJob(jobId: string, agentId: string, price: number): Promise<string | null> {
  return sendTx('JobAssigned', (nonce) =>
    contract!.assignJob(toBytes32(jobId), toBytes32(agentId), Math.round(price * 100), { nonce }))
}

export async function chainCompleteJob(jobId: string, agentId: string, artifact: string): Promise<string | null> {
  const artifactHash = ethers.keccak256(ethers.toUtf8Bytes(artifact || 'no-artifact'))
  return sendTx('JobCompleted', (nonce) =>
    contract!.completeJob(toBytes32(jobId), toBytes32(agentId), artifactHash, { nonce }))
}

export async function chainSettlePayment(jobId: string, toAgentId: string, amount: number): Promise<string | null> {
  return sendTx('PaymentSettled', (nonce) =>
    contract!.settlePayment(toBytes32(jobId), toBytes32(toAgentId), Math.round(amount * 100), { nonce }))
}

export async function chainUpdateReputation(agentId: string, newRep: number, change: number): Promise<string | null> {
  return sendTx('ReputationUpdated', (nonce) =>
    contract!.updateReputation(toBytes32(agentId), newRep, change, { nonce }))
}

export async function chainCreatePrediction(predId: string, jobId: string, targetAgentId: string): Promise<string | null> {
  return sendTx('PredictionCreated', (nonce) =>
    contract!.createPrediction(toBytes32(predId), toBytes32(jobId), toBytes32(targetAgentId), { nonce }))
}

export async function chainPlacePredictionBet(predId: string, agentId: string, isYes: boolean, amount: number): Promise<string | null> {
  return sendTx('PredictionBet', (nonce) =>
    contract!.placePredictionBet(toBytes32(predId), toBytes32(agentId), isYes, Math.round(amount * 100), { nonce }))
}

export async function chainSettlePrediction(predId: string, outcome: boolean, totalPool: number): Promise<string | null> {
  return sendTx('PredictionSettled', (nonce) =>
    contract!.settlePrediction(toBytes32(predId), outcome, Math.round(totalPool * 100), { nonce }))
}

// ── Forum Functions ──
export async function chainCreateForumPost(postId: string, agentId: string, title: string): Promise<string | null> {
  return sendTx('ForumPost', (nonce) =>
    contract!.createForumPost(toBytes32(postId), toBytes32(agentId), title, { nonce }))
}

export async function chainCreateForumReply(postId: string, agentId: string): Promise<string | null> {
  return sendTx('ForumReply', (nonce) =>
    contract!.createForumReply(toBytes32(postId), toBytes32(agentId), { nonce }))
}

export async function chainUpvoteForumPost(postId: string, agentId: string, newScore: number): Promise<string | null> {
  return sendTx('ForumUpvote', (nonce) =>
    contract!.upvoteForumPost(toBytes32(postId), toBytes32(agentId), newScore, { nonce }))
}

// ── Status / Info ──

export function getChainStatus(): {
  enabled: boolean
  chainReady: boolean
  contractAddress: string | null
  walletAddress: string | null
  rpc: string
  chainId: number
  txCount: number
  explorerUrl: string | null
} {
  return {
    enabled: !!wallet,
    chainReady,
    contractAddress,
    walletAddress: wallet?.address || null,
    rpc: CHAIN_RPC,
    chainId: CHAIN_ID,
    txCount,
    explorerUrl: contractAddress ? `https://sepolia.etherscan.io/address/${contractAddress}` : null,
  }
}

export async function getChainBalance(): Promise<string> {
  if (!provider || !wallet) return '0'
  try {
    const balance = await provider.getBalance(wallet.address)
    return ethers.formatEther(balance)
  } catch {
    return '0'
  }
}

export function getContractAddress(): string | null {
  return contractAddress
}

export function getProvider(): ethers.JsonRpcProvider | null {
  return provider
}

export function getContractABI(): any[] {
  return contractABI
}
