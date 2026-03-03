import { NextResponse, NextRequest } from 'next/server'
import { getEnergyData, IntervalOption } from '@/lib/energyData'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = (searchParams.get('interval') ?? '1h') as IntervalOption
  try {
    const data = await getEnergyData({ interval })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
