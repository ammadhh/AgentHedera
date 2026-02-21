import { NextRequest, NextResponse } from 'next/server'
import { store } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { job_id } = await req.json()
    if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

    store.jobUpdates.set(job_id, {
      ...(store.jobUpdates.get(job_id) || {}),
      status: 'settled',
    })

    return NextResponse.json({
      job_id,
      status: 'settled',
      hts_tx_id: `mock-hts-${Date.now()}`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request', details: err.message }, { status: 400 })
  }
}
