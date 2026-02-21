import { NextRequest, NextResponse } from 'next/server'
import { store, genId } from '../../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, skills } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const agentId = id || genId('agent')

    // Check if already registered
    const existing = store.agents.find(a => a.id === agentId)
    if (existing) {
      existing.status = 'active'
      existing.last_heartbeat = new Date().toISOString()
      return NextResponse.json({ id: agentId, status: 're-registered' })
    }

    store.agents.push({
      id: agentId,
      name: name || `Agent-${agentId.slice(0, 6)}`,
      skills: skills || [],
      reputation: 50,
      completions: 0,
      failures: 0,
      time_bonuses: 0,
      last_heartbeat: new Date().toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
      badge: 'New',
    })

    return NextResponse.json({ id: agentId, status: 'registered' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
