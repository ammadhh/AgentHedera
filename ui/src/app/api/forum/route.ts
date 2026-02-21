import { NextRequest, NextResponse } from 'next/server'
import { getData } from '../_lib/get-data'
import { store } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const data = await getData()
  const tag = req.nextUrl.searchParams.get('tag')

  // Merge demo forum posts with store posts
  let allPosts = [...(data.forum || []), ...store.forumPosts]

  if (tag && tag !== 'all') {
    allPosts = allPosts.filter((p: any) => p.tag === tag)
  }

  // Sort newest first
  allPosts.sort((a: any, b: any) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Include replies from chain data
  const replies = data.forumReplies || {}

  return NextResponse.json({ posts: allPosts, replies })
}
