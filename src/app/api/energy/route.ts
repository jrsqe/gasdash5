import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption, INTERVAL_MAX_DAYS } from '@/lib/energyData'

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption
  const maxDays  = INTERVAL_MAX_DAYS[interval] ?? 32

  // Don't send date_end — the API defaults it to the last completed interval,
  // which avoids 416 errors when today has no data yet.
  // Fetch one day less than the max range to stay safely within limits.
  const dateTo   = searchParams.get('to') ?? undefined
  const dateFrom = searchParams.get('from') ?? (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (maxDays - 1))
    return isoDate(d)
  })()

  try {
    const data = await getEnergyData({ interval, dateFrom, dateTo })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
