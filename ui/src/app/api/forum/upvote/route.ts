import { NextRequest, NextResponse } from 'next/server'
import { store } from '../../_lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { post_id, agent_id } = body

    if (!post_id) return NextResponse.json({ error: 'post_id is required' }, { status: 400 })
    if (!agent_id) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

    const key = `${post_id}:${agent_id}`
    if (store.forumUpvotes.has(key)) {
      return NextResponse.json({ error: 'Already upvoted' }, { status: 409 })
    }

    store.forumUpvotes.add(key)

    // Update upvote count
    const post = store.forumPosts.find(p => p.id === post_id)
    if (post) post.upvotes++

    return NextResponse.json({ post_id, upvotes: post?.upvotes || 1 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid request body', details: err.message }, { status: 400 })
  }
}
