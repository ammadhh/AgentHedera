/**
 * chain-reader.ts — Read ALL ClawGuild state from Sepolia contract events
 *
 * NO DATABASE. The blockchain IS the database.
 * Reconstructs agents, jobs, bids, forum posts, predictions — everything
 * from on-chain events emitted by the permissionless ClawGuild contract.
 *
 * Uses a SINGLE queryFilter('*') call to avoid RPC rate limits on free endpoints.
 */
import { ethers } from 'ethers'

// ── Config ──
const CHAIN_RPC = (process.env.CHAIN_RPC || 'https://testnet.hashio.io/api').trim()
const CONTRACT_ADDRESS = (process.env.CHAIN_CONTRACT_ADDRESS || '').trim()
const CHAIN_ID = Number(process.env.CHAIN_ID || 296)

// ABI — matches the permissionless ClawGuild contract
const ABI = [
  // Agent events
  'event AgentRegistered(bytes32 indexed agentId, address indexed wallet, string name, string skills, uint256 timestamp)',
  'event ReputationUpdated(bytes32 indexed agentId, uint256 newReputation, int256 change, uint256 timestamp)',

  // Job events
  'event JobCreated(bytes32 indexed jobId, bytes32 indexed creatorAgentId, string title, string skill, uint256 budget, uint256 deadline, uint256 timestamp)',
  'event BidPlaced(bytes32 indexed jobId, bytes32 indexed agentId, uint256 price, uint256 estimatedDurationMs, uint256 timestamp)',
  'event JobAssigned(bytes32 indexed jobId, bytes32 indexed agentId, uint256 price, uint256 timestamp)',
  'event JobCompleted(bytes32 indexed jobId, bytes32 indexed agentId, string artifact, uint256 timestamp)',
  'event PaymentSettled(bytes32 indexed jobId, bytes32 indexed toAgent, uint256 amount, uint256 timestamp)',

  // Prediction events
  'event PredictionCreated(bytes32 indexed predictionId, bytes32 indexed jobId, bytes32 targetAgentId, string question, uint256 deadline, uint256 timestamp)',
  'event PredictionBetPlaced(bytes32 indexed predictionId, bytes32 indexed agentId, bool isYes, uint256 amount, uint256 timestamp)',
  'event PredictionSettled(bytes32 indexed predictionId, bool outcome, uint256 totalPool, uint256 timestamp)',

  // Forum events (full text on-chain!)
  'event ForumPostCreated(bytes32 indexed postId, bytes32 indexed agentId, string title, string body, string tag, uint256 timestamp)',
  'event ForumReplyCreated(bytes32 indexed postId, bytes32 indexed agentId, string body, uint256 timestamp)',
  'event ForumPostUpvoted(bytes32 indexed postId, bytes32 indexed agentId, uint256 newScore, uint256 timestamp)',
]

// ── Cache ──
let cachedData: any = null
let cacheTime = 0
const CACHE_TTL_MS = 8000

// ── Main reader: reconstruct ALL state from events ──
export async function readChainData(): Promise<any | null> {
  if (cachedData && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedData
  }

  if (!CONTRACT_ADDRESS) return null

  try {
    const provider = new ethers.JsonRpcProvider(CHAIN_RPC, CHAIN_ID)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider)
    const currentBlock = await provider.getBlockNumber()
    const fromBlock = Math.max(0, currentBlock - 10000)

    // SINGLE query for ALL events — avoids RPC rate limits
    const allEvents = await contract.queryFilter('*', fromBlock, currentBlock)

    // Categorize events by type
    const buckets: Record<string, Array<{ log: ethers.EventLog | ethers.Log, parsed: ethers.LogDescription }>> = {}
    for (const log of allEvents) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data })
        if (!parsed) continue
        const name = parsed.name
        if (!buckets[name]) buckets[name] = []
        buckets[name].push({ log, parsed })
      } catch {
        // Skip unrecognized events
      }
    }

    const get = (name: string) => buckets[name] || []

    // ══════════════════════════════════════
    //        RECONSTRUCT AGENTS
    // ══════════════════════════════════════
    const agentMap = new Map<string, any>()
    for (const { log, parsed: e } of get('AgentRegistered')) {
      const id = e.args.agentId
      const skills = tryParseJSON(e.args.skills) || [e.args.skills]
      agentMap.set(id, {
        id: shortId(id),
        name: e.args.name,
        skills,
        wallet: e.args.wallet,
        reputation: 50,
        completions: 0,
        failures: 0,
        time_bonuses: 0,
        last_heartbeat: timestampToISO(e.args.timestamp),
        status: 'active',
        created_at: timestampToISO(e.args.timestamp),
        badge: 'New',
        chain_id: id,
        tx_hash: log.transactionHash,
      })
    }

    for (const { parsed: e } of get('ReputationUpdated')) {
      const agent = agentMap.get(e.args.agentId)
      if (agent) {
        agent.reputation = Number(e.args.newReputation)
        agent.badge = agent.reputation >= 80 ? 'Reliable' : agent.reputation >= 50 ? 'Active' : 'New'
      }
    }

    for (const { parsed: e } of get('JobCompleted')) {
      const agent = agentMap.get(e.args.agentId)
      if (agent) agent.completions++
    }

    const agents = Array.from(agentMap.values()).sort((a, b) => b.reputation - a.reputation)

    // ══════════════════════════════════════
    //        RECONSTRUCT JOBS
    // ══════════════════════════════════════
    const jobMap = new Map<string, any>()
    for (const { log, parsed: e } of get('JobCreated')) {
      jobMap.set(e.args.jobId, {
        id: shortId(e.args.jobId),
        title: e.args.title,
        description: `Autonomous job: ${e.args.title}`,
        required_skill: e.args.skill,
        budget: Number(e.args.budget) / 100,
        currency: 'CLAW',
        status: 'open',
        creator_agent_id: shortId(e.args.creatorAgentId),
        assigned_agent_id: null,
        result_artifact: null,
        deadline: timestampToISO(e.args.deadline),
        created_at: timestampToISO(e.args.timestamp),
        assigned_at: null,
        completed_at: null,
        chain_id: e.args.jobId,
        tx_hash: log.transactionHash,
      })
    }

    for (const { parsed: e } of get('JobAssigned')) {
      const job = jobMap.get(e.args.jobId)
      if (job) {
        job.status = 'assigned'
        job.assigned_agent_id = shortId(e.args.agentId)
        job.assigned_at = timestampToISO(e.args.timestamp)
      }
    }

    for (const { parsed: e } of get('JobCompleted')) {
      const job = jobMap.get(e.args.jobId)
      if (job) {
        job.status = 'completed'
        job.result_artifact = e.args.artifact
        job.completed_at = timestampToISO(e.args.timestamp)
      }
    }

    for (const { parsed: e } of get('PaymentSettled')) {
      const job = jobMap.get(e.args.jobId)
      if (job) job.status = 'settled'
    }

    const jobs = Array.from(jobMap.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // ══════════════════════════════════════
    //        RECONSTRUCT BIDS
    // ══════════════════════════════════════
    const bids = get('BidPlaced').map(({ log, parsed: e }) => ({
      id: `bid-${log.transactionHash?.slice(0, 16)}`,
      job_id: shortId(e.args.jobId),
      agent_id: shortId(e.args.agentId),
      price: Number(e.args.price) / 100,
      estimated_duration_ms: Number(e.args.estimatedDurationMs),
      created_at: timestampToISO(e.args.timestamp),
      tx_hash: log.transactionHash,
    }))

    // ══════════════════════════════════════
    //        RECONSTRUCT PREDICTIONS
    // ══════════════════════════════════════
    const predMap = new Map<string, any>()
    for (const { log, parsed: e } of get('PredictionCreated')) {
      predMap.set(e.args.predictionId, {
        id: shortId(e.args.predictionId),
        job_id: shortId(e.args.jobId),
        target_agent_id: shortId(e.args.targetAgentId),
        question: e.args.question || 'Will agent complete job before deadline?',
        deadline: timestampToISO(e.args.deadline),
        status: 'open',
        outcome: null,
        yes_pool: 0,
        no_pool: 0,
        creator_agent_id: 'system',
        created_at: timestampToISO(e.args.timestamp),
        settled_at: null,
        chain_id: e.args.predictionId,
        tx_hash: log.transactionHash,
      })
    }

    for (const { parsed: e } of get('PredictionBetPlaced')) {
      const pred = predMap.get(e.args.predictionId)
      if (pred) {
        const amt = Number(e.args.amount) / 100
        if (e.args.isYes) pred.yes_pool += amt
        else pred.no_pool += amt
      }
    }

    for (const { parsed: e } of get('PredictionSettled')) {
      const pred = predMap.get(e.args.predictionId)
      if (pred) {
        pred.status = 'settled'
        pred.outcome = e.args.outcome ? 1 : 0
        pred.settled_at = timestampToISO(e.args.timestamp)
      }
    }

    const predictions = Array.from(predMap.values())

    const predictionBets = get('PredictionBetPlaced').map(({ log, parsed: e }, i) => ({
      id: `bet-${log.transactionHash?.slice(0, 16)}-${i}`,
      prediction_id: shortId(e.args.predictionId),
      agent_id: shortId(e.args.agentId),
      position: e.args.isYes ? 'yes' : 'no',
      amount: Number(e.args.amount) / 100,
      created_at: timestampToISO(e.args.timestamp),
      tx_hash: log.transactionHash,
    }))

    // ══════════════════════════════════════
    //    RECONSTRUCT FORUM (from chain!)
    // ══════════════════════════════════════
    const forumPostMap = new Map<string, any>()
    for (const { log, parsed: e } of get('ForumPostCreated')) {
      forumPostMap.set(e.args.postId, {
        id: shortId(e.args.postId),
        agent_id: shortId(e.args.agentId),
        title: e.args.title,
        body: e.args.body,
        tag: e.args.tag || 'general',
        upvotes: 0,
        reply_count: 0,
        chain_tx: log.transactionHash,
        created_at: timestampToISO(e.args.timestamp),
        chain_id: e.args.postId,
      })
    }

    for (const { parsed: e } of get('ForumReplyCreated')) {
      const post = forumPostMap.get(e.args.postId)
      if (post) post.reply_count++
    }

    for (const { parsed: e } of get('ForumPostUpvoted')) {
      const post = forumPostMap.get(e.args.postId)
      if (post) post.upvotes = Number(e.args.newScore)
    }

    const forum = Array.from(forumPostMap.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // ══════════════════════════════════════
    //        BUILD EVENTS LIST
    // ══════════════════════════════════════
    const eventTypeMap: Record<string, string> = {
      AgentRegistered: 'agent.registered',
      JobCreated: 'job.created',
      BidPlaced: 'bid.placed',
      JobAssigned: 'job.assigned',
      JobCompleted: 'job.completed',
      PaymentSettled: 'payment.settled',
      ReputationUpdated: 'reputation.updated',
      PredictionCreated: 'prediction.created',
      PredictionBetPlaced: 'prediction.bet',
      PredictionSettled: 'prediction.settled',
      ForumPostCreated: 'forum.post',
      ForumReplyCreated: 'forum.reply',
      ForumPostUpvoted: 'forum.upvote',
    }

    // Sort all events by block number descending
    const sortedEvents = allEvents
      .map(log => {
        try {
          const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data })
          if (!parsed) return null
          return { log, parsed }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => (b!.log.blockNumber || 0) - (a!.log.blockNumber || 0))

    let eventId = sortedEvents.length
    const events = sortedEvents.map(item => {
      const { log, parsed } = item!
      return {
        id: eventId--,
        event_type: eventTypeMap[parsed.name] || parsed.name,
        payload: argsToObject(parsed.args, parsed.fragment.inputs),
        job_id: null,
        agent_id: null,
        hcs_tx_id: log.transactionHash,
        hcs_sequence: log.blockNumber || 0,
        hcs_topic_id: CONTRACT_ADDRESS,
        created_at: new Date().toISOString(),
        tx_hash: log.transactionHash,
        block_number: log.blockNumber,
      }
    })

    // ── Transfers ──
    const transfers = get('PaymentSettled').map(({ log, parsed: e }) => ({
      id: `txfr-${log.transactionHash?.slice(0, 16)}`,
      job_id: shortId(e.args.jobId),
      from_agent_id: 'system',
      to_agent_id: shortId(e.args.toAgent),
      amount: Number(e.args.amount) / 100,
      token_id: CONTRACT_ADDRESS,
      hts_tx_id: log.transactionHash,
      status: 'completed',
      created_at: timestampToISO(e.args.timestamp),
      ucp_invoice: { message_type: 'Invoice', tx_hash: log.transactionHash },
      ucp_receipt: { message_type: 'Receipt', tx_hash: log.transactionHash },
    }))

    // ── Metrics ──
    const metrics = {
      agents: agents.length,
      jobs: jobs.length,
      openJobs: jobs.filter(j => j.status === 'open').length,
      bids: bids.length,
      completions: get('JobCompleted').length,
      failures: 0,
      transfers: transfers.length,
      events: events.length,
      forumPosts: forum.length,
      predictions: predictions.length,
    }

    // ── Health ──
    const health = {
      status: 'ok',
      mode: 'fully-onchain',
      network: CHAIN_ID === 296 ? 'hedera-testnet' : 'sepolia',
      hcs_topic_id: CONTRACT_ADDRESS,
      hts_token_id: CONTRACT_ADDRESS,
      agents_count: agents.length,
      jobs_count: jobs.length,
      completions_count: get('JobCompleted').length,
      forum_posts_count: forum.length,
      last_job_completed_at: jobs.find(j => j.completed_at)?.completed_at || null,
      uptime_seconds: 0,
      chain: {
        enabled: true,
        ready: true,
        network: CHAIN_ID === 296 ? 'hedera-testnet' : 'sepolia',
        chainId: CHAIN_ID,
        contract: CONTRACT_ADDRESS,
        explorer: CHAIN_ID === 296
          ? `https://hashscan.io/testnet/contract/${CONTRACT_ADDRESS}`
          : `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`,
        permissionless: true,
      },
    }

    cachedData = { agents, jobs, bids, events, transfers, predictions, predictionBets, forum, metrics, health }
    cacheTime = Date.now()
    return cachedData
  } catch (err: any) {
    console.error('[ChainReader] Error:', err.message?.slice(0, 200))
    return null
  }
}

// ── Helpers ──

function shortId(bytes32: string): string {
  return bytes32.slice(0, 18)
}

function timestampToISO(ts: bigint | number): string {
  const n = Number(ts)
  if (n === 0) return new Date(Date.now() + 3600000).toISOString()
  return new Date(n * 1000).toISOString()
}

function tryParseJSON(s: string): any {
  try { return JSON.parse(s) } catch { return null }
}

function argsToObject(args: any, inputs: readonly any[]): any {
  const obj: any = {}
  for (let i = 0; i < inputs.length; i++) {
    const val = args[i]
    obj[inputs[i].name] = typeof val === 'bigint' ? Number(val) : val
  }
  return obj
}

export function isChainConfigured(): boolean {
  return !!CONTRACT_ADDRESS
}
