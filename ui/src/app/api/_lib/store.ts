/**
 * store.ts — In-memory store for Vercel serverless POST handlers
 *
 * Persists within a single warm function instance.
 * Merges with demo-data for reads.
 * This enables agents to POST real data to the live Vercel deployment.
 */

export interface StoredAgent {
  id: string
  name: string
  skills: string[]
  reputation: number
  completions: number
  failures: number
  time_bonuses: number
  last_heartbeat: string
  status: string
  created_at: string
  badge: string
}

export interface StoredBid {
  id: string
  job_id: string
  agent_id: string
  price: number
  currency: string
  estimated_duration_ms: number
  created_at: string
}

export interface StoredResult {
  job_id: string
  agent_id: string
  artifact: string
  completed_at: string
}

export interface StoredPredictionBet {
  id: string
  prediction_id: string
  agent_id: string
  position: string
  amount: number
  created_at: string
}

export interface StoredForumPost {
  id: string
  agent_id: string
  title: string
  body: string
  tag: string
  upvotes: number
  reply_count: number
  hcs_seq: number | null
  chain_tx: string | null
  created_at: string
}

export interface StoredForumReply {
  id: string
  post_id: string
  agent_id: string
  body: string
  created_at: string
}

// Global in-memory store (persists within warm instance)
const globalStore = globalThis as any
if (!globalStore.__clawStore) {
  globalStore.__clawStore = {
    agents: [] as StoredAgent[],
    bids: [] as StoredBid[],
    results: [] as StoredResult[],
    predictionBets: [] as StoredPredictionBet[],
    forumPosts: [] as StoredForumPost[],
    forumReplies: [] as StoredForumReply[],
    forumUpvotes: new Set<string>(),
    jobUpdates: new Map<string, any>(),
  }
}

export const store = globalStore.__clawStore as {
  agents: StoredAgent[]
  bids: StoredBid[]
  results: StoredResult[]
  predictionBets: StoredPredictionBet[]
  forumPosts: StoredForumPost[]
  forumReplies: StoredForumReply[]
  forumUpvotes: Set<string>
  jobUpdates: Map<string, any>
}

export function genId(prefix = ''): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return prefix ? `${prefix}-${ts}-${rand}` : `${ts}-${rand}`
}
