import { NextResponse } from 'next/server'
import JSZip from 'jszip'

const DAYS_BACK = 7
const NEM_REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const FUEL_GROUPS  = ['Gas', 'Coal', 'Wind', 'Solar', 'Hydro', 'Battery', 'Liquid fuel', 'Other']
const GAS_FUELTECHS = new Set(['gas_ccgt', 'gas_ocgt', 'gas_recip', 'gas_steam', 'gas_wcmg'])

export const revalidate = 3600

// ── Static DUID → fuel type map ───────────────────────────────────────────────
// Gas DUIDs follow recognisable patterns; everything else is mapped via keywords.
// This avoids an OE API call at request time.
const GAS_DUID_PATTERNS = [
  /OCGT/i, /CCGT/i, /GAS/i, /NGAS/i,
  /LBBP/i,  // Loy Yang B
  /VPGS/i,  // Victorian Power Gen Station
  /AGLHAL/i, /AGLSOM/i, /TORRENS/i, /OSBORNE/i,
  /PELICAN/i, /BARKER/i, /MORTLAKE/i, /JEERALANG/i,
  /LAVERTON/i, /BARCALD/i, /BRAEMAR/i, /CONDAMINE/i,
  /DARLING/i, /URANQ/i, /SWANBANK/i, /OAKEY/i,
  /KWINANA/i, /PINJAR/i, /PJBTON/i,
]
const COAL_DUID_PATTERNS = [/COAL/i, /LOYYB/i, /ERARING/i, /BAYSW/i, /VALES/i, /CALLIDE/i, /TARONG/i, /GLADSTONE/i, /STANWELL/i, /MILLMERR/i]
const WIND_DUID_PATTERNS = [/WIND/i, /WF\d/i, /WPWF/i]
const SOLAR_DUID_PATTERNS = [/SOLAR/i, /PV/i, /NYNGAN/i, /BROKEN/i]
const HYDRO_DUID_PATTERNS = [/HYDRO/i, /TUMUT/i, /MURRAY/i, /HUME/i, /DARTMOUTH/i, /EILDON/i, /GORDON/i]
const BATTERY_DUID_PATTERNS = [/BATT/i, /BATTERY/i, /HORNSDALE/i, /MEGAPACK/i, /VPP/i]

function duidFuelGroup(duid: string): string {
  if (GAS_DUID_PATTERNS.some(p => p.test(duid)))     return 'Gas'
  if (COAL_DUID_PATTERNS.some(p => p.test(duid)))    return 'Coal'
  if (WIND_DUID_PATTERNS.some(p => p.test(duid)))    return 'Wind'
  if (SOLAR_DUID_PATTERNS.some(p => p.test(duid)))   return 'Solar'
  if (HYDRO_DUID_PATTERNS.some(p => p.test(duid)))   return 'Hydro'
  if (BATTERY_DUID_PATTERNS.some(p => p.test(duid))) return 'Battery'
  return 'Other'
}

// ── Fetch directory listing → dateStr → zipUrl ────────────────────────────────
async function fetchDirIndex(): Promise<Record<string, string>> {
  const dirUrl = 'https://www.nemweb.com.au/REPORTS/CURRENT/Public_Prices/'
  const res    = await fetch(dirUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  const html   = await res.text()
  const index: Record<string, string> = {}
  const re = /PUBLIC_PRICES_(\d{8})0000_[\w]+\.zip/g
  let m
  while ((m = re.exec(html)) !== null) {
    index[m[1]] = dirUrl + m[0]
  }
  return index
}

// ── Fetch + parse one day's zip ────────────────────────────────────────────────
type PriceSetterRow = { regionId: string; duid: string; periodId: number; increase: number }

async function fetchDaySetters(zipUrl: string): Promise<PriceSetterRow[]> {
  const res = await fetch(zipUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) return []
  const buf  = await res.arrayBuffer()
  const zip  = await JSZip.loadAsync(buf)
  const file = Object.values(zip.files).find(f => !f.dir && f.name.toUpperCase().endsWith('.CSV'))
  if (!file) return []
  return parseCsv(await file.async('string'))
}

function parseCsv(csv: string): PriceSetterRow[] {
  const results: PriceSetterRow[] = []
  let headers: string[] = []
  let inTable = false

  for (const raw of csv.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const cols = splitLine(line)
    const rt   = cols[0]?.toUpperCase()

    if (rt === 'I') {
      // NEM CSV: I,reporttype,subtype,version,col1,col2,...
      inTable = cols[1]?.toUpperCase() === 'DISPATCH' && cols[2]?.toUpperCase() === 'PRICE_SETTER'
      if (inTable) headers = cols.slice(4).map(h => h.toUpperCase().trim())
      continue
    }

    if (rt === 'D' && inTable && headers.length) {
      const row = cols.slice(4)
      const g   = (name: string) => (row[headers.indexOf(name)] ?? '').trim()
      if (g('BIDTYPE').toUpperCase() !== 'ENERGY') continue
      const inc = parseFloat(g('INCREASE'))
      if (isNaN(inc) || inc <= 0) continue
      results.push({
        regionId: g('REGIONID'),
        duid:     g('DUID'),
        periodId: parseInt(g('PERIODID')) || 0,
        increase: inc,
      })
    }
  }
  return results
}

function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

function toIso(d: Date) { return d.toISOString().slice(0, 10) }
function toYMD(d: Date) { return d.toISOString().slice(0, 10).replace(/-/g, '') }

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    // Date list: yesterday back DAYS_BACK days
    const dates = Array.from({ length: DAYS_BACK }, (_, i) => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i - 1)
      return { iso: toIso(d), ymd: toYMD(d) }
    })

    // Fetch dir index + first zip in parallel to warm things up
    const dirIndex = await fetchDirIndex()

    // Fetch each day's zip sequentially to avoid hammering NEMweb / timing out
    // (260KB × 7 = 1.8MB total — fine sequentially)
    const dayResults: { iso: string; rows: PriceSetterRow[] }[] = []
    for (const { iso, ymd } of dates) {
      const url = dirIndex[ymd]
      if (!url) { dayResults.push({ iso, rows: [] }); continue }
      try {
        const rows = await fetchDaySetters(url)
        dayResults.push({ iso, rows })
      } catch {
        dayResults.push({ iso, rows: [] })
      }
    }

    // ── Aggregate ──────────────────────────────────────────────────────────────
    type DayRegion = {
      byFuelGroup: Record<string, number>
      byGasDuid:   Record<string, number>
      totalPeriods: number
    }
    const byDay: Record<string, Record<string, DayRegion>> = {}

    for (const { iso, rows } of dayResults) {
      byDay[iso] = {}
      for (const reg of NEM_REGIONS) {
        byDay[iso][reg] = {
          byFuelGroup:  Object.fromEntries(FUEL_GROUPS.map(g => [g, 0])),
          byGasDuid:    {},
          totalPeriods: 0,
        }
      }

      // Count distinct (region, periodId, fuelGroup) triples
      const seen = new Set<string>()
      for (const r of rows) {
        if (!byDay[iso][r.regionId]) continue
        const fg  = duidFuelGroup(r.duid)
        const key = `${r.regionId}|${r.periodId}|${fg}`
        if (!seen.has(key)) {
          seen.add(key)
          byDay[iso][r.regionId].byFuelGroup[fg] = (byDay[iso][r.regionId].byFuelGroup[fg] ?? 0) + 1
        }
        // Gas DUID detail
        if (fg === 'Gas') {
          const dk = `${r.regionId}|${r.periodId}|${r.duid}`
          if (!seen.has(dk)) {
            seen.add(dk)
            byDay[iso][r.regionId].byGasDuid[r.duid] = (byDay[iso][r.regionId].byGasDuid[r.duid] ?? 0) + 1
          }
        }
      }
      // Total periods = unique periodIds per region
      for (const reg of NEM_REGIONS) {
        const periods = new Set(rows.filter(r => r.regionId === reg).map(r => r.periodId))
        byDay[iso][reg].totalPeriods = periods.size
      }
    }

    // ── Shape output ──────────────────────────────────────────────────────────
    const sortedDates = Object.keys(byDay).sort()
    const out: Record<string, {
      dates: string[]
      totalIntervals: (number | null)[]
      byFuelGroup: Record<string, (number | null)[]>
      byGasDuid:   Record<string, (number | null)[]>
    }> = {}

    for (const reg of NEM_REGIONS) {
      const label = reg.replace('1', '')

      // Collect all gas DUIDs seen
      const allDuids = new Set<string>()
      for (const d of sortedDates) Object.keys(byDay[d]?.[reg]?.byGasDuid ?? {}).forEach(du => allDuids.add(du))

      out[label] = {
        dates:          sortedDates,
        totalIntervals: sortedDates.map(d => byDay[d]?.[reg]?.totalPeriods ?? null),
        byFuelGroup:    Object.fromEntries(
          FUEL_GROUPS.map(g => [g, sortedDates.map(d => byDay[d]?.[reg]?.byFuelGroup[g] ?? null)])
        ),
        byGasDuid: Object.fromEntries(
          Array.from(allDuids).map(du => [
            du,
            sortedDates.map(d => byDay[d]?.[reg]?.byGasDuid[du] ?? null)
          ])
        ),
      }
    }

    return NextResponse.json({ ok: true, data: out })
  } catch (err: any) {
    console.error('pricesetter error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
