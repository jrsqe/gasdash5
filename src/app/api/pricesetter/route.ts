import { NextResponse } from 'next/server'
import JSZip from 'jszip'

// ── Config ────────────────────────────────────────────────────────────────────
const OE_BASE = 'https://api.openelectricity.org.au/v4'
const NEM_REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const DAYS_BACK = 14    // fetch last 14 days
const BIDTYPE   = 'ENERGY'

export const revalidate = 3600

// ── Fuel type groups for charting ─────────────────────────────────────────────
const FUELTECH_GROUP: Record<string, string> = {
  gas_ccgt: 'Gas', gas_ocgt: 'Gas', gas_recip: 'Gas',
  gas_steam: 'Gas', gas_wcmg: 'Gas',
  coal_black: 'Coal', coal_brown: 'Coal',
  solar_utility: 'Solar', wind: 'Wind', hydro: 'Hydro',
  battery_discharging: 'Battery', distillate: 'Liquid fuel',
  pumps: 'Pumps',
}

function oeHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

// ── Build DUID → { fuelGroup, fueltech, name, region } map from OE API ────────
async function buildDuidMap(): Promise<Record<string, {
  fuelGroup: string; fueltech: string; name: string; region: string
}>> {
  const res  = await fetch(`${OE_BASE}/facilities/?network_code=NEM`, { headers: oeHeaders(), cache: 'no-store' })
  const data = await res.json()
  const map: Record<string, { fuelGroup: string; fueltech: string; name: string; region: string }> = {}

  for (const facility of data.data ?? []) {
    if (!NEM_REGIONS.includes(facility.network_region)) continue
    for (const unit of facility.units ?? []) {
      const ft = unit.fueltech_id ?? ''
      map[unit.code] = {
        fuelGroup: FUELTECH_GROUP[ft] ?? 'Other',
        fueltech:  ft,
        name:      facility.name,
        region:    facility.network_region,
      }
    }
  }
  return map
}

// ── Fetch directory listing once, return map of dateStr→zipUrl ───────────────
async function fetchDirIndex(): Promise<Record<string, string>> {
  const dirUrl = 'https://www.nemweb.com.au/REPORTS/CURRENT/Public_Prices/'
  const res    = await fetch(dirUrl, { cache: 'no-store' })
  const html   = await res.text()
  const index: Record<string, string> = {}
  // Filenames: PUBLIC_PRICES_YYYYMMDD0000_timestamp.zip
  const re = /PUBLIC_PRICES_(\d{8})0000_[^"<\s]+\.zip/g
  let m
  while ((m = re.exec(html)) !== null) {
    index[m[1]] = dirUrl + m[0]
  }
  return index
}

// ── Fetch & parse a Public_Prices zip for one day ─────────────────────────────
async function fetchDayPriceSetters(zipUrl: string): Promise<{
  settlementDate: string; regionId: string; duid: string
  increase: number; periodId: number
}[]> {
  const zipRes = await fetch(zipUrl, { cache: 'no-store' })
  if (!zipRes.ok) return []

  const zipBuf = await zipRes.arrayBuffer()
  const zip    = await JSZip.loadAsync(zipBuf)

  // The zip contains one CSV file
  const csvFile = Object.values(zip.files).find(
    f => !f.dir && (f.name.toUpperCase().endsWith('.CSV'))
  )
  if (!csvFile) return []

  const csv = await csvFile.async('string')
  return parsePriceSetterCsv(csv)
}

// ── Parse NEM CSV format for DISPATCH,PRICE_SETTER table ─────────────────────
function parsePriceSetterCsv(csv: string): {
  settlementDate: string; regionId: string; duid: string
  increase: number; periodId: number
}[] {
  const results: { settlementDate: string; regionId: string; duid: string; increase: number; periodId: number }[] = []
  let headers: string[] = []
  let inTable = false

  for (const rawLine of csv.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const cols = splitCsvLine(line)
    const recType = cols[0]?.toUpperCase()

    // NEM CSV format: first col is record type (I=header, D=data, C=comment)
    if (recType === 'I') {
      // Check if this is the PRICE_SETTER table header
      if (cols[1]?.toUpperCase() === 'DISPATCH' && cols[2]?.toUpperCase() === 'PRICE_SETTER') {
        headers = cols.slice(4).map(h => h.toUpperCase())
        inTable = true
      } else {
        inTable = false
      }
      continue
    }

    if (recType === 'D' && inTable) {
      const row = cols.slice(4)
      const get = (name: string) => row[headers.indexOf(name)] ?? ''

      const bidtype = get('BIDTYPE').toUpperCase()
      if (bidtype !== BIDTYPE) continue

      const increase = parseFloat(get('INCREASE'))
      if (isNaN(increase) || increase <= 0) continue  // only positive (price-increasing) setters

      results.push({
        settlementDate: get('SETTLEMENTDATE'),
        regionId:       get('REGIONID'),
        duid:           get('DUID'),
        increase,
        periodId:       parseInt(get('PERIODID')) || 0,
      })
      continue
    }

    if (recType === 'C') {
      inTable = false  // end of table section
    }
  }
  return results
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += ch
  }
  result.push(cur)
  return result
}

// ── Format a date as YYYYMMDD ─────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET() {
  try {
    // Build date list
    const dates = Array.from({ length: DAYS_BACK }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i - 1)
      return { iso: isoDate(d), yyyymmdd: fmtDate(d) }
    })

    // Fetch DUID map and directory index in parallel
    const [duidMap] = await Promise.all([
      buildDuidMap(),
    ])

    // Fetch directory index once, then download relevant days in parallel
    const dirIndex = await fetchDirIndex()

    const dayResults = await Promise.all(
      dates.map(async ({ iso, yyyymmdd }) => {
        const zipUrl = dirIndex[yyyymmdd]
        if (!zipUrl) return { iso, setters: [] as Awaited<ReturnType<typeof fetchDayPriceSetters>> }
        try {
          const setters = await fetchDayPriceSetters(zipUrl)
          return { iso, setters }
        } catch {
          return { iso, setters: [] as Awaited<ReturnType<typeof fetchDayPriceSetters>> }
        }
      })
    )

    // ── Aggregate: per day, per region → interval counts by fuel group + gas DUID breakdown
    const FUEL_GROUPS = ['Gas', 'Coal', 'Wind', 'Solar', 'Hydro', 'Battery', 'Liquid fuel', 'Other']
    const GAS_FUELTECHS = new Set(['gas_ccgt', 'gas_ocgt', 'gas_recip', 'gas_steam', 'gas_wcmg'])

    const byDay: Record<string, Record<string, {
      totalIntervals:  number
      byFuelGroup:     Record<string, number>
      byGasDuid:       Record<string, { intervals: number; name: string }>
      avgSetterPrice:  number | null
      priceSum:        number
      priceCount:      number
    }>> = {}

    for (const { iso, setters } of dayResults) {
      if (!byDay[iso]) byDay[iso] = {}
      for (const region of NEM_REGIONS) {
        byDay[iso][region] = {
          totalIntervals: 0,
          byFuelGroup:    Object.fromEntries(FUEL_GROUPS.map(g => [g, 0])),
          byGasDuid:      {},
          avgSetterPrice: null,
          priceSum:       0,
          priceCount:     0,
        }
      }

      // Count unique intervals per region where each fuel group was a price setter
      // (an interval can have multiple setters from different fuels — count each)
      type IntervalKey = string  // `${region}|${periodId}`
      const seen = new Set<string>()

      for (const s of setters) {
        const regionKey = s.regionId
        if (!byDay[iso]?.[regionKey]) continue

        const info = duidMap[s.duid]
        const fuelGroup = info?.fuelGroup ?? 'Other'
        const key: IntervalKey = `${regionKey}|${s.periodId}|${fuelGroup}`

        // Count each (interval, fuel group) pair once per day per region
        if (!seen.has(key)) {
          seen.add(key)
          byDay[iso][regionKey].byFuelGroup[fuelGroup] = (byDay[iso][regionKey].byFuelGroup[fuelGroup] ?? 0) + 1
          byDay[iso][regionKey].totalIntervals = Math.max(
            byDay[iso][regionKey].totalIntervals,
            ...Object.values(byDay[iso][regionKey].byFuelGroup)
          )
        }

        // Gas DUID breakdown
        if (info && GAS_FUELTECHS.has(info.fueltech)) {
          const duidKey = `${regionKey}|${s.periodId}|${s.duid}`
          if (!seen.has(duidKey)) {
            seen.add(duidKey)
            if (!byDay[iso][regionKey].byGasDuid[s.duid]) {
              byDay[iso][regionKey].byGasDuid[s.duid] = { intervals: 0, name: info.name }
            }
            byDay[iso][regionKey].byGasDuid[s.duid].intervals += 1
          }
        }
      }

      // Compute total intervals per region (= number of distinct periodIds that had a setter)
      for (const region of NEM_REGIONS) {
        const periodSet = new Set(setters.filter(s => s.regionId === region).map(s => s.periodId))
        byDay[iso][region].totalIntervals = periodSet.size
        const rd = byDay[iso][region]
        rd.avgSetterPrice = rd.priceCount > 0 ? rd.priceSum / rd.priceCount : null
      }
    }

    // Shape output: sorted dates + per-region series arrays
    const sortedDates = Object.keys(byDay).sort()

    const regionData: Record<string, {
      dates:          string[]
      totalIntervals: (number | null)[]
      byFuelGroup:    Record<string, (number | null)[]>
      byGasDuid:      Record<string, { intervals: (number | null)[]; name: string }>
    }> = {}

    for (const region of NEM_REGIONS) {
      const label = region.replace('1', '')
      regionData[label] = {
        dates:          sortedDates,
        totalIntervals: sortedDates.map(d => byDay[d]?.[region]?.totalIntervals ?? null),
        byFuelGroup:    Object.fromEntries(
          FUEL_GROUPS.map(g => [
            g,
            sortedDates.map(d => byDay[d]?.[region]?.byFuelGroup[g] ?? null)
          ])
        ),
        byGasDuid: {},
      }

      // Collect all gas DUIDs seen for this region
      const allGasDuids = new Set<string>()
      for (const d of sortedDates) {
        for (const duid of Object.keys(byDay[d]?.[region]?.byGasDuid ?? {})) {
          allGasDuids.add(duid)
        }
      }
      for (const duid of allGasDuids) {
        const firstName = sortedDates.map(d => byDay[d]?.[region]?.byGasDuid[duid]?.name).find(Boolean) ?? duid
        regionData[label].byGasDuid[duid] = {
          name:      firstName,
          intervals: sortedDates.map(d => byDay[d]?.[region]?.byGasDuid[duid]?.intervals ?? null),
        }
      }
    }

    return NextResponse.json({ ok: true, data: regionData })
  } catch (err: any) {
    console.error('pricesetter error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
