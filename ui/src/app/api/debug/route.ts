import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { readChainData, isChainConfigured } from '../_lib/chain-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  const CONTRACT = (process.env.CHAIN_CONTRACT_ADDRESS || '').trim()
  const RPC = (process.env.CHAIN_RPC || 'https://ethereum-sepolia-rpc.publicnode.com').trim()
  const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111)

  const result: any = {
    configured: isChainConfigured(),
    contractAddr: CONTRACT,
    contractAddrLen: CONTRACT.length,
    rpc: RPC,
    rpcLen: RPC.length,
    chainId: CHAIN_ID,
  }

  // Test 1: Direct ethers query (bypasses chain-reader)
  try {
    const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID)
    const block = await provider.getBlockNumber()
    result.directBlock = block

    const ABI = [
      'event AgentRegistered(bytes32 indexed agentId, address indexed wallet, string name, string skills, uint256 timestamp)',
    ]
    const contract = new ethers.Contract(CONTRACT, ABI, provider)
    const fromBlock = Math.max(0, block - 5000)
    const agents = await contract.queryFilter(contract.filters.AgentRegistered(), fromBlock)
    result.directAgentCount = agents.length

    // Test wildcard query (what the new chain reader uses)
    const fullABI = [
      'event AgentRegistered(bytes32 indexed agentId, address indexed wallet, string name, string skills, uint256 timestamp)',
      'event JobCreated(bytes32 indexed jobId, bytes32 indexed creatorAgentId, string title, string skill, uint256 budget, uint256 deadline, uint256 timestamp)',
      'event ForumPostCreated(bytes32 indexed postId, bytes32 indexed agentId, string title, string body, string tag, uint256 timestamp)',
    ]
    const fullContract = new ethers.Contract(CONTRACT, fullABI, provider)
    const allEvents = await fullContract.queryFilter('*', fromBlock, block)
    result.wildcardEventCount = allEvents.length
  } catch (err: any) {
    result.directError = err.message?.slice(0, 200)
  }

  // Test 2: Chain reader module
  try {
    const chainData = await readChainData()
    if (chainData) {
      result.chainReaderOk = true
      result.chainAgents = chainData.agents?.length
      result.chainJobs = chainData.jobs?.length
      result.chainForum = chainData.forum?.length
      result.chainEvents = chainData.events?.length
    } else {
      result.chainReaderOk = false
      result.chainReaderNull = true
    }
  } catch (err: any) {
    result.chainReaderOk = false
    result.chainReaderError = err.message?.slice(0, 200)
  }

  return NextResponse.json(result)
}
