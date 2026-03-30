import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption, INTERVAL_MAX_DAYS } from '@/lib/energyData'

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption
  const maxDays  = INTERVAL_MAX_DAYS[interval] ?? 32

  const today = isoDate(new Date())

  // Always resolve both ends explicitly so the API always gets a fully bounded range.
  // Without an explicit date_end the API measures from date_start to *now*, which
  // can silently exceed the max range limit and return a 400.
  const dateTo   = searchParams.get('to')   ?? today
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
