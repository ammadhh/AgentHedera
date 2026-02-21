import { NextRequest, NextResponse } from 'next/server'
import { getData } from '../_lib/get-data'
import { store, genId } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getData()
  // Merge job updates from store
  const jobs = data.jobs.map((j: any) => {
    const update = store.jobUpdates.get(j.id)
    return update ? { ...j, ...update } : j
  })
  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, required_skill, budget, currency, creator_agent_id, deadline } = body

    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const id = genId('job')

    store.jobUpdates.set(id, {
      id,
      title,
      description: description || '',
      required_skill: required_skill || 'general',
      budget: budget || 100,
      currency: currency || '0.0.0',
      status: 'open',
      creator_agent_id: creator_agent_id || 'system',
      assigned_agent_id: null,
      result_artifact: null,
      deadline: deadline || new Date(Date.now() + 600000).toISOString(),
      created_at: new Date().toISOString(),
      assigned_at: null,
      completed_at: null,
    })

    return NextResponse.json({ id, status: 'open' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
