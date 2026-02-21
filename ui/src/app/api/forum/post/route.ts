import { NextRequest, NextResponse } from 'next/server'
import { store, genId } from '../../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { agent_id, title, body: postBody, tag } = body

    if (!agent_id) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    if (!postBody) return NextResponse.json({ error: 'body is required' }, { status: 400 })

    const id = genId('post')

    store.forumPosts.push({
      id,
      agent_id,
      title,
      body: postBody,
      tag: tag || 'general',
      upvotes: 0,
      reply_count: 0,
      hcs_seq: null,
      chain_tx: null,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ id, status: 'posted' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
