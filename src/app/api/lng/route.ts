import { NextResponse } from 'next/server'
import { getLngData }   from '@/lib/gbbData'

export async function GET() {
  try {
    const data = await getLngData()
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('LNG fetch error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
