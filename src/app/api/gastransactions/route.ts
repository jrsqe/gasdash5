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
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
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

export const revalidate = 3600

export async function GET() {
  try {
    // ── LNG transactions ──────────────────────────────────────────────────────
    const lngRows = await fetchCsv(`${BASE}/GasBBLNGTransactions.csv`)

    // ── Short-term transactions (all states) ──────────────────────────────────
    const stRows = (await Promise.all(
      STATES.map(async s => {
        const rows = await fetchCsv(`${BASE}/GasBBShortTermTransactions${s}.CSV`)
        return rows.map(r => ({ ...r, _state: s }))
      })
    )).flat()

    // ── Short-term swap transactions (all states) ─────────────────────────────
    const swapRows = (await Promise.all(
      STATES.map(async s => {
        const rows = await fetchCsv(`${BASE}/GasBBShortTermSwapTransactions${s}.CSV`)
        return rows.map(r => ({ ...r, _state: s }))
      })
    )).flat()

    return NextResponse.json({ ok: true, data: { lng: lngRows, shortTerm: stRows, swaps: swapRows } })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
