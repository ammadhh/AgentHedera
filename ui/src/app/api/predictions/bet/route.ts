import { NextRequest, NextResponse } from 'next/server'
import { store, genId } from '../../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prediction_id, agent_id, position, amount } = body

    if (!prediction_id) return NextResponse.json({ error: 'prediction_id is required' }, { status: 400 })
    if (!agent_id) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    if (position !== 'yes' && position !== 'no') {
      return NextResponse.json({ error: 'position must be "yes" or "no"' }, { status: 400 })
    }

    // Check if already bet
    const existing = store.predictionBets.find(
      b => b.prediction_id === prediction_id && b.agent_id === agent_id
    )
    if (existing) {
      return NextResponse.json({ error: 'Agent already bet on this prediction' }, { status: 409 })
    }

    const id = genId('bet')

    store.predictionBets.push({
      id,
      prediction_id,
      agent_id,
      position,
      amount: amount || 10,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ id, status: 'placed' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
