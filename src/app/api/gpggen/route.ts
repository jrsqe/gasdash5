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
    // The OE API returns raw energy values — each data point is the total MWh
    // accumulated across all 5-min slots in the interval. At 1d that is directly MWh/day.
    // (aggregateFacility in energyData.ts divides by FIVE_MIN_PERIODS to convert back to
    // average MW — we skip that here and keep MWh.)
    const facilityResults = await Promise.all(
      facilities.map(async fac => {
        try {
          const resp = await apiFetch(`${BASE_URL}/data/facilities/NEM`, {
            facility_code: fac.code,
            metrics: 'power',
            interval: '1d',
          })
          // Sum raw MWh per date across all units in the facility
          const byDate: Record<string, number> = {}
          for (const series of resp.data ?? []) {
            for (const result of series.results ?? []) {
              for (const entry of result.data ?? []) {
                if (!Array.isArray(entry) || entry.length < 2) continue
                const mwh = Number(entry[1])
                if (isNaN(mwh) || mwh < 0) continue
                const date = toDateAEST(String(entry[0]))
                byDate[date] = (byDate[date] ?? 0) + mwh  // raw value IS MWh/day
              }
            }
          }
          return { ...fac, byDate }
        } catch {
          return { ...fac, byDate: {} as Record<string, number> }
        }
      })
    )

    // 3. Build union date list
    const dateSet = new Set<string>()
    for (const f of facilityResults) Object.keys(f.byDate).forEach(d => dateSet.add(d))
    const dates = Array.from(dateSet).sort()

    // 4. Shape output: byRegion → { facilities: { name, values[] }, stateTotalValues[] }
    const regionLabel: Record<string, string> = {
      NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA'
    }
    const byRegion: Record<string, {
      label: string
      facilities: { name: string; values: (number | null)[] }[]
      stateTotal: (number | null)[]
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
      byRegion[region] = { label, facilities: facSeries, stateTotal }
    }

    return NextResponse.json({ ok: true, data: { dates, byRegion } })
  } catch (err: any) {
    console.error('GPG gen error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
