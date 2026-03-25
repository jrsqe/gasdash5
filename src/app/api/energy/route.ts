import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption, INTERVAL_MAX_DAYS } from '@/lib/energyData'

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption
  const dateTo   = searchParams.get('to')   ?? undefined

  // If no explicit dateFrom, use the full max range back from today
  // (the OE API default is only *half* the max range)
  const maxDays  = INTERVAL_MAX_DAYS[interval] ?? 32
  const defaultFrom = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - maxDays)
    return isoDate(d)
  })()
  const dateFrom = searchParams.get('from') ?? defaultFrom

  try {
    const data = await getEnergyData({ interval, dateFrom, dateTo })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
