/**
 * get-data.ts — Unified data source for API routes
 *
 * Priority:
 * 1. On-chain data from Base Sepolia contract (if CHAIN_CONTRACT_ADDRESS is set)
 * 2. Demo data (fallback for when no contract is deployed)
 */
import { readChainData, isChainConfigured } from './chain-reader'
import { generateDemoData } from './demo-data'

let lastSource = 'none'

export async function getData(): Promise<{
  agents: any[]
  jobs: any[]
  events: any[]
  transfers: any[]
  predictions: any[]
  predictionBets: any[]
  forum: any[]
  metrics: any
  health: any
  source: 'chain' | 'demo'
}> {
  // Try chain first
  if (isChainConfigured()) {
    try {
      const chainData = await readChainData()
      if (chainData && chainData.agents.length > 0) {
        if (lastSource !== 'chain') {
          console.log('[Data] Serving from Base Sepolia chain')
          lastSource = 'chain'
        }
        return { ...chainData, source: 'chain' }
      }
    } catch (err: any) {
      console.warn('[Data] Chain read failed:', err.message?.slice(0, 60))
    }
  }

  // Fallback to demo data
  if (lastSource !== 'demo') {
    console.log('[Data] Serving demo data (no chain contract)')
    lastSource = 'demo'
  }
  return { ...generateDemoData(), source: 'demo' }
}
