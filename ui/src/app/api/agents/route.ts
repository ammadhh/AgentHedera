import { NextResponse } from 'next/server'
import { getData } from '../_lib/get-data'
import { store } from '../_lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getData()
  // Merge store agents (registered via POST) with demo/chain agents
  const storeIds = new Set(store.agents.map(a => a.id))
  const merged = [
    ...data.agents.filter((a: any) => !storeIds.has(a.id)),
    ...store.agents,
  ]
  return NextResponse.json(merged)
}
