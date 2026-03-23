import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption } from '@/lib/energyData'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption
  const dateFrom  = searchParams.get('from')  ?? undefined
  const dateTo    = searchParams.get('to')    ?? undefined
  try {
    const data = await getEnergyData({ interval, dateFrom, dateTo })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
