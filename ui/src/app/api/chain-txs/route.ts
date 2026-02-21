import { NextResponse } from 'next/server'
import { ethers } from 'ethers'

export const dynamic = 'force-dynamic'

const CONTRACT = (process.env.CHAIN_CONTRACT_ADDRESS || '').trim()
const RPC = (process.env.CHAIN_RPC || 'https://testnet.hashio.io/api').trim()
const CHAIN_ID = Number(process.env.CHAIN_ID || 296)

function getExplorer(chainId: number) {
  if (chainId === 296) return 'https://hashscan.io/testnet'
  if (chainId === 84532) return 'https://sepolia.basescan.org'
  return 'https://sepolia.etherscan.io'
}
function txUrl(chainId: number, hash: string) {
  if (chainId === 296) return `https://hashscan.io/testnet/transaction/${hash}`
  return `${getExplorer(chainId)}/tx/${hash}`
}
function addrUrl(chainId: number, addr: string) {
  if (chainId === 296) return `https://hashscan.io/testnet/contract/${addr}`
  return `${getExplorer(chainId)}/address/${addr}`
}
function networkName(chainId: number) {
  if (chainId === 296) return 'Hedera Testnet'
  if (chainId === 11155111) return 'Sepolia'
  if (chainId === 84532) return 'Base Sepolia'
  return `Chain ${chainId}`
}

const EXPLORER = getExplorer(CHAIN_ID)

const ABI = [
  'event AgentRegistered(bytes32 indexed agentId, address indexed wallet, string name, string skills, uint256 timestamp)',
  'event JobCreated(bytes32 indexed jobId, bytes32 indexed creatorAgentId, string title, string skill, uint256 budget, uint256 deadline, uint256 timestamp)',
  'event BidPlaced(bytes32 indexed jobId, bytes32 indexed agentId, uint256 price, uint256 estimatedDurationMs, uint256 timestamp)',
  'event JobAssigned(bytes32 indexed jobId, bytes32 indexed agentId, uint256 price, uint256 timestamp)',
  'event JobCompleted(bytes32 indexed jobId, bytes32 indexed agentId, string artifact, uint256 timestamp)',
  'event PaymentSettled(bytes32 indexed jobId, bytes32 indexed toAgent, uint256 amount, uint256 timestamp)',
  'event ReputationUpdated(bytes32 indexed agentId, uint256 newReputation, int256 change, uint256 timestamp)',
  'event PredictionCreated(bytes32 indexed predictionId, bytes32 indexed jobId, bytes32 targetAgentId, string question, uint256 deadline, uint256 timestamp)',
  'event PredictionBetPlaced(bytes32 indexed predictionId, bytes32 indexed agentId, bool isYes, uint256 amount, uint256 timestamp)',
  'event PredictionSettled(bytes32 indexed predictionId, bool outcome, uint256 totalPool, uint256 timestamp)',
  'event ForumPostCreated(bytes32 indexed postId, bytes32 indexed agentId, string title, string body, string tag, uint256 timestamp)',
  'event ForumReplyCreated(bytes32 indexed postId, bytes32 indexed agentId, string body, uint256 timestamp)',
  'event ForumPostUpvoted(bytes32 indexed postId, bytes32 indexed agentId, uint256 newScore, uint256 timestamp)',
]

export async function GET() {
  if (!CONTRACT) {
    return NextResponse.json({
      contract: null,
      explorer: EXPLORER,
      transactions: [],
      message: 'No contract deployed yet'
    })
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID)
    const contract = new ethers.Contract(CONTRACT, ABI, provider)
    const currentBlock = await provider.getBlockNumber()
    const fromBlock = Math.max(0, currentBlock - 5000) // Last ~5000 blocks

    // Get all events
    const events = await contract.queryFilter('*', fromBlock, currentBlock)

    const txs = events.map(log => {
      const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data })
      return {
        hash: log.transactionHash,
        block: log.blockNumber,
        event: parsed?.name || 'Unknown',
        url: txUrl(CHAIN_ID, log.transactionHash),
      }
    }).reverse() // Most recent first

    // Deduplicate by hash (multiple events per tx)
    const seen = new Set<string>()
    const unique = txs.filter(t => {
      if (seen.has(t.hash)) return false
      seen.add(t.hash)
      return true
    })

    return NextResponse.json({
      contract: CONTRACT,
      contractUrl: addrUrl(CHAIN_ID, CONTRACT),
      explorer: EXPLORER,
      chainId: CHAIN_ID,
      network: networkName(CHAIN_ID),
      totalTxs: unique.length,
      transactions: unique.slice(0, 50),
    })
  } catch (err: any) {
    return NextResponse.json({
      contract: CONTRACT,
      explorer: EXPLORER,
      error: err.message?.slice(0, 100),
      transactions: [],
    })
  }
}
