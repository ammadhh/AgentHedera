import { NextResponse } from 'next/server'
import { getData } from '../_lib/get-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getData()
  return NextResponse.json(data.events)
}
