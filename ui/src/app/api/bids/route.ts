import { NextRequest, NextResponse } from 'next/server'
import { getData } from '../_lib/get-data'
import { store, genId } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getData()
  return NextResponse.json([...(data as any).bids || [], ...store.bids])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { job_id, agent_id, price, currency, ucp_quote, estimated_duration_ms } = body

    if (!job_id) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    if (!agent_id) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    if (price === undefined) return NextResponse.json({ error: 'price is required' }, { status: 400 })

    // Check if agent already bid on this job
    const existingBid = store.bids.find(b => b.job_id === job_id && b.agent_id === agent_id)
    if (existingBid) {
      return NextResponse.json({ error: 'Agent already bid on this job' }, { status: 409 })
    }

    const id = genId('bid')

    store.bids.push({
      id,
      job_id,
      agent_id,
      price,
      currency: currency || '0.0.0',
      estimated_duration_ms: estimated_duration_ms || 60000,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ id, status: 'placed' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
