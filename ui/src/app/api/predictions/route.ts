import { NextRequest, NextResponse } from 'next/server'
import { getData } from '../_lib/get-data'
import { genId } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getData()
  return NextResponse.json(data.predictions)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { job_id, target_agent_id, question, deadline, creator_agent_id } = body

    if (!job_id) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    if (!target_agent_id) return NextResponse.json({ error: 'target_agent_id is required' }, { status: 400 })

    const id = genId('pred')

    return NextResponse.json({ id, status: 'open' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
