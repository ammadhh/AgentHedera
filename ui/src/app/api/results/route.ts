import { NextRequest, NextResponse } from 'next/server'
import { store } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { job_id, agent_id, artifact } = body

    if (!job_id) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    if (!agent_id) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

    // Store the result
    store.results.push({
      job_id,
      agent_id,
      artifact: artifact || 'Task completed',
      completed_at: new Date().toISOString(),
    })

    // Update job status in store
    store.jobUpdates.set(job_id, {
      status: 'completed',
      assigned_agent_id: agent_id,
      result_artifact: artifact || 'Task completed',
      completed_at: new Date().toISOString(),
    })

    // Update agent reputation
    const agent = store.agents.find(a => a.id === agent_id)
    if (agent) {
      agent.completions++
      agent.reputation = Math.min(100, agent.reputation + 10)
      agent.badge = agent.reputation >= 80 ? 'Reliable' : agent.reputation >= 50 ? 'Active' : 'New'
    }

    return NextResponse.json({ job_id, status: 'completed' })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
