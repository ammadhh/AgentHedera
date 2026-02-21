import { NextRequest, NextResponse } from 'next/server'
import { store } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { job_id } = await req.json()
    if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

    // Find bids for this job
    const bids = store.bids
      .filter(b => b.job_id === job_id)
      .sort((a, b) => a.price - b.price)

    if (bids.length === 0) {
      return NextResponse.json({ error: 'No bids yet' }, { status: 400 })
    }

    const winner = bids[0]

    store.jobUpdates.set(job_id, {
      status: 'assigned',
      assigned_agent_id: winner.agent_id,
      assigned_at: new Date().toISOString(),
    })

    return NextResponse.json({
      job_id,
      assigned_agent_id: winner.agent_id,
      price: winner.price,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request', details: err.message }, { status: 400 })
  }
}
