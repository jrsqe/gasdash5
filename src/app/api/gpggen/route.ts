import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'
const GAS_FUELTECHS = new Set(['gas_ccgt', 'gas_ocgt', 'gas_recip', 'gas_steam', 'gas_wcmg'])
const REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']

export const revalidate = 3600

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

async function apiFetch(url: string, params: Record<string, string> = {}) {
  const qs = '?' + new URLSearchParams(params).toString()
  const res = await fetch(`${url}${qs}`, { headers: getHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Convert ISO timestamp → AEST date string YYYY-MM-DD
function toDateAEST(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() + 10 * 3600000).toISOString().slice(0, 10)
}

export async function GET() {
  try {
    // 1. Fetch all gas facilities
    const facData = await apiFetch(`${BASE_URL}/facilities/`, { network_code: 'NEM' })
    const facilities: { code: string; name: string; region: string }[] = []
    const seen = new Set<string>()
    for (const f of facData.data ?? []) {
      if (!REGIONS.includes(f.network_region)) continue
      const hasGas = (f.units ?? []).some(
        (u: any) => GAS_FUELTECHS.has(u.fueltech_id) && u.status_id === 'operating'
      )
      if (hasGas && !seen.has(f.code)) {
        facilities.push({ code: f.code, name: f.name, region: f.network_region })
        seen.add(f.code)
      }
    }

    // 2. Fetch daily generation for each facility.
    // The OE API with metrics='power' returns 5-minute averaged MW values.
    // At interval='1d' the response contains 288 five-minute data points per day.
    // To get MWh/day: sum all MW values for the day ÷ 288 (= avg MW) × 24h = MWh/day
    // Equivalently: sum ÷ 12  (since 288 ÷ 24 = 12 five-min periods per hour)
    const PERIODS_PER_HOUR = 12  // 60min ÷ 5min
    const facilityResults = await Promise.all(
      facilities.map(async fac => {
        try {
          const resp = await apiFetch(`${BASE_URL}/data/facilities/NEM`, {
            facility_code: fac.code,
            metrics: 'power',
            interval: '1d',
          })
          // Sum all 5-min MW values per date, then convert to MWh
          const byDateSum:   Record<string, number> = {}
          const byDateCount: Record<string, number> = {}
          for (const series of resp.data ?? []) {
            for (const result of series.results ?? []) {
              for (const entry of result.data ?? []) {
                if (!Array.isArray(entry) || entry.length < 2) continue
                const mw = Number(entry[1])
                if (isNaN(mw) || mw < 0) continue
                const date = toDateAEST(String(entry[0]))
                byDateSum[date]   = (byDateSum[date]   ?? 0) + mw
                byDateCount[date] = (byDateCount[date] ?? 0) + 1
              }
            }
          }
          // Convert: sum of MW values ÷ periods_per_hour = MWh
          const byDate: Record<string, number> = {}
          for (const date of Object.keys(byDateSum)) {
            byDate[date] = byDateSum[date] / PERIODS_PER_HOUR
          }
          return { ...fac, byDate }
        } catch {
          return { ...fac, byDate: {} as Record<string, number> }
        }
      })
    )

    // 3. Fetch daily average electricity spot price per region ($/MWh)
    // Uses market/network/NEM with metrics='price' — returns 5-min prices
    // Daily avg = sum of 5-min values ÷ count
    const elecPriceByRegion: Record<string, Record<string, number>> = {}
    await Promise.all(
      REGIONS.map(async region => {
        try {
          const resp = await apiFetch(`${BASE_URL}/market/network/NEM`, {
            metrics: 'price', network_region: region,
            interval: '1d', primary_grouping: 'network_region',
          })
          const byDateSum:   Record<string, number> = {}
          const byDateCount: Record<string, number> = {}
          // Response may be history-style or results-style — handle both
          for (const series of resp.data ?? []) {
            const results = series.results ?? [series]
            for (const item of results) {
              // results-style: item.data = [[ts, val], ...]
              if (Array.isArray(item.data)) {
                for (const entry of item.data) {
                  if (!Array.isArray(entry) || entry.length < 2) continue
                  const val = Number(entry[1])
                  if (isNaN(val)) continue
                  const date = toDateAEST(String(entry[0]))
                  byDateSum[date]   = (byDateSum[date]   ?? 0) + val
                  byDateCount[date] = (byDateCount[date] ?? 0) + 1
                }
              }
              // history-style
              if (item.history?.start && Array.isArray(item.history.data)) {
                const { start, data: vals } = item.history
                const mins = 5
                let dt = new Date(start)
                for (const v of vals) {
                  if (typeof v === 'number' && !isNaN(v)) {
                    const date = toDateAEST(dt.toISOString())
                    byDateSum[date]   = (byDateSum[date]   ?? 0) + v
                    byDateCount[date] = (byDateCount[date] ?? 0) + 1
                  }
                  dt = new Date(dt.getTime() + mins * 60000)
                }
              }
            }
          }
          const byDate: Record<string, number> = {}
          for (const date of Object.keys(byDateSum)) {
            if (byDateCount[date]) byDate[date] = byDateSum[date] / byDateCount[date]
          }
          elecPriceByRegion[region] = byDate
        } catch (e) {
          console.warn(`Elec price fetch failed for ${region}:`, e)
          elecPriceByRegion[region] = {}
        }
      })
    )

    // 4. Build union date list
    const dateSet = new Set<string>()
    for (const f of facilityResults) Object.keys(f.byDate).forEach(d => dateSet.add(d))
    const dates = Array.from(dateSet).sort()

    // 5. Shape output: byRegion → { facilities: { name, values[] }, stateTotalValues[] }
    const regionLabel: Record<string, string> = {
      NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA'
    }
    const byRegion: Record<string, {
      label: string
      facilities: { name: string; values: (number | null)[] }[]
      stateTotal: (number | null)[]
      elecPrices: (number | null)[]
    }> = {}

    for (const region of REGIONS) {
      const label = regionLabel[region]!
      const regionFacs = facilityResults.filter(f => f.region === region)
      const facSeries = regionFacs.map(f => ({
        name: f.name,
        values: dates.map(d => (f.byDate[d] != null ? Math.round(f.byDate[d]) : null)),
      }))
      const stateTotal = dates.map(d => {
        const sum = regionFacs.reduce((s, f) => s + (f.byDate[d] ?? 0), 0)
        return sum > 0 ? Math.round(sum) : null
      })
      const elecPrices = dates.map(d => {
        const v = elecPriceByRegion[region]?.[d]
        return v != null ? Math.round(v * 100) / 100 : null
      })
      byRegion[region] = { label, facilities: facSeries, stateTotal, elecPrices }
    }

    return NextResponse.json({ ok: true, data: { dates, byRegion } })
  } catch (err: any) {
    console.error('GPG gen error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
