import { NextResponse } from 'next/server'
import { fetchFuelMix } from '@/lib/energyData'

export const revalidate = 3600

const REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']

export async function GET() {
  try {
    // Fetch daily fuel-mix data for each NEM region in parallel
    const results = await Promise.all(
      REGIONS.map(async region => {
        const { dates, series } = await fetchFuelMix(region, '1d')
        return { region, dates, series }
      })
    )

    // Shape: { NSW1: { dates, gasValues }, VIC1: ... }
    const data: Record<string, { dates: string[]; gas: (number|null)[] }> = {}
    for (const { region, dates, series } of results) {
      data[region] = {
        dates,
        gas: series['Gas'] ?? dates.map(() => null),
      }
    }

    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('Gas mix fetch error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
