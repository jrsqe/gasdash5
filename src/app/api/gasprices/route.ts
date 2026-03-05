import { NextResponse } from 'next/server'
import { getGasPriceData } from '@/lib/gasPriceData'

export const revalidate = 3600  // cache for 1 hour

export async function GET() {
  try {
    const data = await getGasPriceData()
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('Gas price fetch error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
