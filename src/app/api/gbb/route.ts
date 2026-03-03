import { NextResponse } from 'next/server'
import { getGbbData } from '@/lib/gbbData'

export async function GET() {
  try {
    const data = await getGbbData()
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('GBB fetch error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
