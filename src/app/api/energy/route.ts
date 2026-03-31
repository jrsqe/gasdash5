import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption } from '@/lib/energyData'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption

  // Pass dates only if explicitly provided by the caller.
  // When omitted, the OE API uses its own defaults:
  //   date_end   → last completed interval
  //   date_start → half the max range before date_end
  const dateFrom = searchParams.get('from') ?? undefined
  const dateTo   = searchParams.get('to')   ?? undefined

  try {
    const data = await getEnergyData({ interval, dateFrom, dateTo })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
