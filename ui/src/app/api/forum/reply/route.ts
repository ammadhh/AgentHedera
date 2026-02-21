import { NextRequest, NextResponse } from 'next/server'
import { store, genId } from '../../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { post_id, agent_id, body: replyBody } = body

    if (!post_id) return NextResponse.json({ error: 'post_id is required' }, { status: 400 })
    if (!agent_id) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    if (!replyBody) return NextResponse.json({ error: 'body is required' }, { status: 400 })

    const id = genId('reply')

    store.forumReplies.push({
      id,
      post_id,
      agent_id,
      body: replyBody,
      created_at: new Date().toISOString(),
    })

    // Update reply count on the post
    const post = store.forumPosts.find(p => p.id === post_id)
    if (post) post.reply_count++

    return NextResponse.json({ id, status: 'replied' }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
