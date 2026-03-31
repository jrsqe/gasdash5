import { NextResponse } from 'next/server'

const STATES = ['NSW', 'VIC', 'SA', 'QLD', 'TAS', 'NT']
const BASE   = 'https://nemweb.com.au/Reports/Current/GBB'

// ── CSV helpers ───────────────────────────────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      result.push(cur.trim()); cur = ''
    } else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return { headers: [], rows: [] }
  // Lowercase and strip spaces — but keep original capitalisation accessible via raw headers
  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, ''))
  const rows    = lines.slice(1).map(l => splitCsvLine(l))
  return { headers, rows }
}

function rowToObj(headers: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const text = await res.text()
    const { headers, rows } = parseCsv(text)
    if (!headers.length) return []
    return rows.map(r => rowToObj(headers, r))
  } catch { return [] }
}

// ── Convert any AEMO date format to a sortable timestamp ─────────────────────
// Handles: "YYYY/MM/DD", "YYYY-MM-DD", "DD/MM/YYYY", all optionally with " HH:MM" suffix
function toSortable(val: string): number {
  const s = val.trim()
  if (!s) return 0
  // Split off optional time part
  const [datePart, timePart] = s.split(' ')
  const [a, b, c] = (datePart ?? '').split(/[\/\-]/)
  let iso: string
  if ((a?.length ?? 0) === 4) {
    // YYYY/MM/DD or YYYY-MM-DD
    iso = `${a}-${b}-${c}`
  } else {
    // DD/MM/YYYY
    iso = `${c}-${b}-${a}`
  }
  const full = timePart ? `${iso}T${timePart}:00` : iso
  const ts = Date.parse(full)
  return isNaN(ts) ? 0 : ts
}

// ── Sort rows by most recent supply period first ───────────────────────────────
function sortByDateDesc(rows: Record<string, string>[], dateKey: string): Record<string, string>[] {
  if (!rows.length) return rows
  return [...rows].sort((a, b) => toSortable(b[dateKey] ?? '') - toSortable(a[dateKey] ?? ''))
}

export const revalidate = 3600

export async function GET() {
  try {
    // ── LNG transactions — sort by SupplyStartDate ────────────────────────────
    const lngRows = sortByDateDesc(
      await fetchCsv(`${BASE}/GasBBLNGTransactions.csv`),
      'supplystartdate'
    )

    // ── Short-term transactions — sort by SupplyPeriodStart ───────────────────
    const stRows = sortByDateDesc(
      (await Promise.all(
        STATES.map(async s => {
          const rows = await fetchCsv(`${BASE}/GasBBShortTermTransactions${s}.CSV`)
          return rows.map(r => ({ ...r, _state: s }))
        })
      )).flat(),
      'supplyperiodstart'
    )

    // ── Short-term swap transactions — sort by SupplyPeriodStart ──────────────
    const swapRows = sortByDateDesc(
      (await Promise.all(
        STATES.map(async s => {
          const rows = await fetchCsv(`${BASE}/GasBBShortTermSwapTransactions${s}.CSV`)
          return rows.map(r => ({ ...r, _state: s }))
        })
      )).flat(),
      'supplyperiodstart'
    )

    return NextResponse.json({ ok: true, data: { lng: lngRows, shortTerm: stRows, swaps: swapRows } })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
