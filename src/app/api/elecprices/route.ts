import { NextResponse } from 'next/server'
import { parseTimeseries, toAEST } from '@/lib/energyData'

const BASE_URL = 'https://api.openelectricity.org.au/v4'
const REGIONS  = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const LABEL: Record<string, string> = { NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA' }

export const revalidate = 3600

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

async function apiFetch(url: string, params: Record<string, string>) {
  const qs  = '?' + new URLSearchParams(params).toString()
  const res = await fetch(`${url}${qs}`, { headers: getHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function GET() {
  try {
    // Fetch hourly spot prices for all 4 regions in parallel
    // Uses IDENTICAL call pattern to the working getEnergyData price fetch
    const results = await Promise.all(
      REGIONS.map(async region => {
        const resp = await apiFetch(`${BASE_URL}/market/network/NEM`, {
          metrics:          'price',
          network_region:   region,
          interval:         '1h',
          primary_grouping: 'network_region',
        })

        // Use same parseTimeseries as rest of app — handles both response shapes
        const parsed = parseTimeseries(resp)
        const allPairs = Object.values(parsed).flat() // [[isoTs, price], ...]

        // Aggregate to daily averages using toAEST for timezone-correct date keys
        const byDate: Record<string, { sum: number; n: number }> = {}
        for (const [ts, price] of allPairs) {
          if (price == null || isNaN(price)) continue
          const date = toAEST(ts).slice(0, 10) // "YYYY-MM-DD HH:MM" → "YYYY-MM-DD"
          if (!byDate[date]) byDate[date] = { sum: 0, n: 0 }
          byDate[date].sum += price
          byDate[date].n   += 1
        }

        const dates  = Object.keys(byDate).sort()
        const values = dates.map(d => Math.round(byDate[d]!.sum / byDate[d]!.n * 100) / 100)
        return { label: LABEL[region]!, dates, values }
      })
    )

    const data: Record<string, { dates: string[]; values: number[] }> = {}
    for (const r of results) data[r.label] = { dates: r.dates, values: r.values }

    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('elecprices error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
