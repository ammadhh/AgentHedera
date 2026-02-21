import { NextRequest, NextResponse } from 'next/server'
import { store } from '../../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { agent_id } = await req.json()
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const agent = store.agents.find(a => a.id === agent_id)
    if (agent) {
      agent.last_heartbeat = new Date().toISOString()
      agent.status = 'active'
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
