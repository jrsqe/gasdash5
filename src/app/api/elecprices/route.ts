import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'
const REGIONS  = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const LABEL: Record<string, string> = { NSW1:'NSW', VIC1:'VIC', QLD1:'QLD', SA1:'SA' }

export const revalidate = 3600

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

async function apiFetch(url: string, params: Record<string, string> = {}) {
  const qs  = '?' + new URLSearchParams(params).toString()
  const res = await fetch(`${url}${qs}`, { headers: getHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Convert ISO/datetime string → AEST date YYYY-MM-DD
function toDate(ts: string): string {
  // Already "YYYY-MM-DD ..." format from toAEST — just take first 10 chars
  if (/^\d{4}-\d{2}-\d{2}/.test(ts)) return ts.slice(0, 10)
  // ISO format — shift to AEST (+10h)
  const d = new Date(ts)
  return new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 10)
}

export async function GET() {
  try {
    // Fetch hourly spot prices for all 4 regions in parallel — fast, no facility loop
    const results = await Promise.all(
      REGIONS.map(async region => {
        const resp = await apiFetch(`${BASE_URL}/market/network/NEM`, {
          metrics:           'price',
          network_region:    region,
          interval:          '1h',
          primary_grouping:  'network_region',
        })

        // Parse whatever shape the API returns into [datetime, price] pairs
        const pairs: [string, number][] = []

        for (const series of resp.data ?? []) {
          // results-style
          for (const item of series.results ?? []) {
            for (const entry of item.data ?? []) {
              if (Array.isArray(entry) && entry.length >= 2) {
                const v = Number(entry[1])
                if (!isNaN(v)) pairs.push([String(entry[0]), v])
              }
            }
          }
          // history-style
          if (series.history?.start && Array.isArray(series.history.data)) {
            const { start, data: vals } = series.history
            let dt = new Date(start)
            for (const v of vals) {
              if (typeof v === 'number' && !isNaN(v)) pairs.push([dt.toISOString(), v])
              dt = new Date(dt.getTime() + 3_600_000) // +1h
            }
          }
        }

        // Aggregate to daily averages
        const byDate: Record<string, { sum: number; n: number }> = {}
        for (const [ts, price] of pairs) {
          const date = toDate(ts)
          if (!byDate[date]) byDate[date] = { sum: 0, n: 0 }
          byDate[date].sum += price
          byDate[date].n   += 1
        }

        const dates  = Object.keys(byDate).sort()
        const values = dates.map(d => Math.round(byDate[d]!.sum / byDate[d]!.n * 100) / 100)

        return { region, label: LABEL[region]!, dates, values }
      })
    )

    // Shape: { NSW: { dates, values }, VIC: ..., QLD: ..., SA: ... }
    const data: Record<string, { dates: string[]; values: number[] }> = {}
    for (const r of results) data[r.label] = { dates: r.dates, values: r.values }

    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('elecprices error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
