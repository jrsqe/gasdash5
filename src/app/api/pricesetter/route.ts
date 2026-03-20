import { NextResponse } from 'next/server'
import JSZip from 'jszip'

const DAYS_BACK   = 5   // Next_Day_Dispatch zips are ~8MB each — keep it tight
const NEM_REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const FUEL_GROUPS = ['Gas', 'Coal', 'Wind', 'Solar', 'Hydro', 'Battery', 'Liquid fuel', 'Other']

export const revalidate = 3600

// ── Static DUID → fuel group (pattern-based, no API call needed) ──────────────
const PATTERNS: [RegExp, string][] = [
  [/OCGT|CCGT|_GT\d|GAS|NGAS|TORRENS|MORTLAKE|JEERALANG|LAVERTON|BARCALD|BRAEMAR|CONDAMINE|OAKEY|SWANBANK|URANQ|PELICAN|OSBORNE|AGLHAL|AGLSOM|VPGS|PPCCGT|LBBP/i, 'Gas'],
  [/COAL|ERARING|BAYSW|VALES|CALLIDE|TARONG|GLADST|STANW|MILLMERR|LOYYB/i, 'Coal'],
  [/WIND|WF\d|WPWF|_WF$/i, 'Wind'],
  [/SOLAR|_PV|NYNGAN|BROKENHLL/i, 'Solar'],
  [/HYDRO|TUMUT|MURRAY|HUME|DARTM|EILDON|GORDON|CATAGUNYA|POATINA|LIAPVALE/i, 'Hydro'],
  [/BATT|BATTERY|HORNSD|MEGAPACK|VPP|WANDOAN/i, 'Battery'],
  [/DISTIL|DIESEL|OPEN_|KEMERTON/i, 'Liquid fuel'],
]

function fuelGroup(duid: string): string {
  for (const [re, fg] of PATTERNS) if (re.test(duid)) return fg
  return 'Other'
}

// ── Directory index: date string YYYYMMDD → zip URL ───────────────────────────
async function fetchDirIndex(): Promise<Record<string, string>> {
  const dirUrl = 'https://www.nemweb.com.au/REPORTS/CURRENT/Next_Day_Dispatch/'
  const res    = await fetch(dirUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  const html   = await res.text()
  const index: Record<string, string> = {}
  // Pattern: PUBLIC_NEXT_DAY_DISPATCH_YYYYMMDD_0000000123456789.zip
  const re = /PUBLIC_NEXT_DAY_DISPATCH_(\d{8})_[\w]+\.zip/g
  let m
  while ((m = re.exec(html)) !== null) index[m[1]] = dirUrl + m[0]
  return index
}

// ── Fetch one zip and extract PRICE_SETTER rows ───────────────────────────────
type SetterRow = { regionId: string; duid: string; periodId: number }

async function fetchDaySetters(zipUrl: string): Promise<SetterRow[]> {
  const res = await fetch(zipUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
  if (!res.ok) return []
  const buf = await res.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const f   = Object.values(zip.files).find(f => !f.dir && f.name.toUpperCase().endsWith('.CSV'))
  if (!f) return []
  return parsePriceSetter(await f.async('string'))
}

// ── NEM CSV parser — stops after PRICE_SETTER table ──────────────────────────
function parsePriceSetter(csv: string): SetterRow[] {
  const results: SetterRow[] = []
  let headers: string[] = []
  let inPS = false

  for (const raw of csv.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const cols = splitLine(line)
    const rt   = cols[0]?.toUpperCase()

    if (rt === 'I') {
      const tbl = cols[2]?.toUpperCase()  // cols: I, reporttype, subtype, version, ...
      inPS = tbl === 'PRICE_SETTER'
      if (inPS) headers = cols.slice(4).map(h => h.toUpperCase().trim())
      continue
    }

    if (rt === 'D' && inPS && headers.length) {
      const row = cols.slice(4)
      const g   = (n: string) => (row[headers.indexOf(n)] ?? '').trim()
      // Only ENERGY bids, only positive increase (this unit is raising the price)
      if (g('BIDTYPE').toUpperCase() !== 'ENERGY') continue
      const inc = parseFloat(g('INCREASE'))
      if (isNaN(inc) || inc <= 0) continue
      results.push({
        regionId: g('REGIONID'),
        duid:     g('DUID'),
        periodId: parseInt(g('PERIODID')) || 0,
      })
    }
  }
  return results
}

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}

function toIso(d: Date) { return d.toISOString().slice(0, 10) }
function toYMD(d: Date) { return d.toISOString().slice(0, 10).replace(/-/g, '') }

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const dates = Array.from({ length: DAYS_BACK }, (_, i) => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - i - 1)
      return { iso: toIso(d), ymd: toYMD(d) }
    })

    const dirIndex = await fetchDirIndex()

    // Fetch sequentially to avoid timeouts — 5 × 8MB = 40MB total
    const dayResults: { iso: string; rows: SetterRow[] }[] = []
    for (const { iso, ymd } of dates) {
      const url = dirIndex[ymd]
      if (!url) { dayResults.push({ iso, rows: [] }); continue }
      try {
        dayResults.push({ iso, rows: await fetchDaySetters(url) })
      } catch {
        dayResults.push({ iso, rows: [] })
      }
    }

    // ── Aggregate ─────────────────────────────────────────────────────────────
    type DayReg = { fuelCount: Record<string, number>; duidCount: Record<string, number>; periods: Set<number> }
    const byDay: Record<string, Record<string, DayReg>> = {}

    for (const { iso, rows } of dayResults) {
      byDay[iso] = {}
      for (const reg of NEM_REGIONS) byDay[iso][reg] = { fuelCount: {}, duidCount: {}, periods: new Set() }

      const seen = new Set<string>()
      for (const r of rows) {
        if (!byDay[iso][r.regionId]) continue
        byDay[iso][r.regionId].periods.add(r.periodId)

        const fg  = fuelGroup(r.duid)
        const fk  = `${r.regionId}|${r.periodId}|${fg}`
        if (!seen.has(fk)) {
          seen.add(fk)
          byDay[iso][r.regionId].fuelCount[fg] = (byDay[iso][r.regionId].fuelCount[fg] ?? 0) + 1
        }
        if (fg === 'Gas') {
          const dk = `${r.regionId}|${r.periodId}|${r.duid}`
          if (!seen.has(dk)) {
            seen.add(dk)
            byDay[iso][r.regionId].duidCount[r.duid] = (byDay[iso][r.regionId].duidCount[r.duid] ?? 0) + 1
          }
        }
      }
    }

    // ── Shape output ──────────────────────────────────────────────────────────
    const sortedDates = Object.keys(byDay).sort()
    const out: Record<string, {
      dates: string[]
      totalIntervals: (number | null)[]
      byFuelGroup: Record<string, (number | null)[]>
      byGasDuid: Record<string, (number | null)[]>
    }> = {}

    for (const reg of NEM_REGIONS) {
      const label = reg.replace('1', '')
      const allDuids = new Set<string>()
      for (const d of sortedDates) Object.keys(byDay[d]?.[reg]?.duidCount ?? {}).forEach(du => allDuids.add(du))

      out[label] = {
        dates:          sortedDates,
        totalIntervals: sortedDates.map(d => byDay[d]?.[reg]?.periods.size ?? null),
        byFuelGroup:    Object.fromEntries(
          FUEL_GROUPS.map(g => [g, sortedDates.map(d => byDay[d]?.[reg]?.fuelCount[g] ?? null)])
        ),
        byGasDuid: Object.fromEntries(
          Array.from(allDuids).map(du => [
            du, sortedDates.map(d => byDay[d]?.[reg]?.duidCount[du] ?? null)
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
