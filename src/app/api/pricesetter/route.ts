import { NextResponse } from 'next/server'
import JSZip from 'jszip'

// ── Uses DispatchIS_Reports: 5-min dispatch prices per region ─────────────────
// We confirmed this endpoint works and contains DISPATCH,PRICE table with RRP.
// We show price spike analysis as a proxy for price setter behaviour:
// high prices (>$300) correlate strongly with gas/peaker price setting.

const DAYS_BACK   = 7
const NEM_REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const THRESHOLDS  = [100, 300, 1000]  // $/MWh

export const revalidate = 3600

// ── Directory index ───────────────────────────────────────────────────────────
async function fetchDirIndex(): Promise<{ ymdhhmi: string; url: string }[]> {
  const dirUrl = "https://www.nemweb.com.au/REPORTS/CURRENT/DispatchIS_Reports/"
  const res    = await fetch(dirUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) })
  const html   = await res.text()
  const files: { ymdhhmi: string; url: string }[] = []
  const re = /PUBLIC_DISPATCHIS_(\d{12})_[\w]+\.zip/g
  let m
  while ((m = re.exec(html)) !== null) {
    files.push({ ymdhhmi: m[1], url: dirUrl + m[0] })
  }
  return files
}

// ── Parse DISPATCH,PRICE rows from a DispatchIS CSV ──────────────────────────
type PriceRow = { regionId: string; rrp: number; settlementDate: string }

async function fetchPriceRows(zipUrl: string): Promise<PriceRow[]> {
  const res = await fetch(zipUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) })
  if (!res.ok) return []
  const buf  = await res.arrayBuffer()
  const zip  = await JSZip.loadAsync(buf)
  const file = Object.values(zip.files).find(f => !f.dir && f.name.toUpperCase().endsWith(".CSV"))
  if (!file) return []
  const csv  = await file.async("string")
  const results: PriceRow[] = []
  let headers: string[] = []
  let inPrice = false

  for (const raw of csv.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const cols = splitLine(line)
    const rt   = cols[0]?.toUpperCase()
    if (rt === "I") {
      inPrice = cols[1]?.toUpperCase() === "DISPATCH" && cols[2]?.toUpperCase() === "PRICE"
      if (inPrice) headers = cols.slice(4).map(h => h.toUpperCase().trim())
      continue
    }
    if (rt === "D" && inPrice && headers.length) {
      const row = cols.slice(4)
      const g   = (n: string) => (row[headers.indexOf(n)] ?? "").trim()
      if (g("INTERVENTION") !== "0") continue  // skip intervention runs
      const rrp = parseFloat(g("RRP"))
      if (isNaN(rrp)) continue
      results.push({ regionId: g("REGIONID"), rrp, settlementDate: g("SETTLEMENTDATE") })
    }
  }
  return results
}

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = "", inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "\"") { if (inQ && line[i+1] === "\"") { cur += "\""; i++ } else inQ = !inQ }
    else if (c === "," && !inQ) { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur); return out
}

function toIso(ymdhhmi: string): string {
  // ymdhhmi = YYYYMMDDHHMI (12 chars)
  const y = ymdhhmi.slice(0,4), mo = ymdhhmi.slice(4,6), d = ymdhhmi.slice(6,8)
  return `${y}-${mo}-${d}`
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const allFiles = await fetchDirIndex()
    if (!allFiles.length) return NextResponse.json({ ok: false, error: "No files found" })

    // Group files by day, keep last 7 days
    const byDay: Record<string, { ymdhhmi: string; url: string }[]> = {}
    for (const f of allFiles) {
      const day = toIso(f.ymdhhmi)
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(f)
    }
    const allDays = Object.keys(byDay).sort().slice(-DAYS_BACK)

    // For each day: fetch every 12th interval (~hourly sample) to stay within timeout
    // 288 intervals/day × 7 days = 2016 zips — too many. Sample ~24/day instead.
    type DayAgg = Record<string, { sum: number; count: number; above: number[] }>
    const dailyAgg: Record<string, DayAgg> = {}

    for (const day of allDays) {
      dailyAgg[day] = {}
      for (const reg of NEM_REGIONS) {
        dailyAgg[day][reg] = { sum: 0, count: 0, above: THRESHOLDS.map(() => 0) }
      }
      // Sample every 12th file (288 per day → ~24 samples → one per hour)
      const files = byDay[day] ?? []
      const sampled = files.filter((_, i) => i % 12 === 0)

      for (const { url } of sampled) {
        try {
          const rows = await fetchPriceRows(url)
          for (const r of rows) {
            if (!dailyAgg[day][r.regionId]) continue
            dailyAgg[day][r.regionId].sum   += r.rrp
            dailyAgg[day][r.regionId].count += 1
            THRESHOLDS.forEach((t, ti) => {
              if (r.rrp >= t) dailyAgg[day][r.regionId].above[ti]++
            })
          }
        } catch { /* skip failed intervals */ }
      }
    }

    // Shape output
    const out: Record<string, {
      dates:    string[]
      avgPrice: (number | null)[]
      pctAbove: Record<number, (number | null)[]>
    }> = {}

    for (const reg of NEM_REGIONS) {
      const label = reg.replace("1", "")
      out[label] = {
        dates:    allDays,
        avgPrice: allDays.map(d => {
          const a = dailyAgg[d]?.[reg]
          return a && a.count > 0 ? Math.round(a.sum / a.count * 100) / 100 : null
        }),
        pctAbove: Object.fromEntries(THRESHOLDS.map((t, ti) => [
          t,
          allDays.map(d => {
            const a = dailyAgg[d]?.[reg]
            return a && a.count > 0 ? Math.round(a.above[ti] / a.count * 1000) / 10 : null
          })
        ])),
      }
    }

    return NextResponse.json({ ok: true, data: out })
  } catch (err: any) {
    console.error("pricesetter error:", err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
