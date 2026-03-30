import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption, INTERVAL_MAX_DAYS } from '@/lib/energyData'

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption
  const maxDays  = INTERVAL_MAX_DAYS[interval] ?? 32

  // Use yesterday as the default date_end — the OE API only has data up to the last
  // completed interval, so sending today's date returns a 416 "no data" error.
  const yesterday = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return isoDate(d)
  })()

  const dateTo   = searchParams.get('to')   ?? yesterday
  const dateFrom = searchParams.get('from') ?? (() => {
    const d = new Date(dateTo)
    d.setUTCDate(d.getUTCDate() - maxDays)
    return isoDate(d)
  })()

  try {
    const data = await getEnergyData({ interval, dateFrom, dateTo })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
