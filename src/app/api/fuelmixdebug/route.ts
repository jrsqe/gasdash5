import { NextResponse } from 'next/server'

export async function GET() {
  // Fetch the STTM CSV and report all unique hub_identifier values
  const STTM_URL = 'https://www.nemweb.com.au/Reports/CURRENT/STTM/int657_v2_ex_post_market_data_rpt_1.csv'
  const res  = await fetch(STTM_URL, { cache: 'no-store' })
  const text = await res.text()

  const lines   = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  const hubIdx  = headers.indexOf('hub_identifier')

  const hubCounts: Record<string, number> = {}
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const hub  = cols[hubIdx] ?? 'MISSING'
    hubCounts[hub] = (hubCounts[hub] ?? 0) + 1
  }

  // Also show first 3 rows raw so we can see column names
  const first3 = lines.slice(1, 4).map(l => {
    const cols = l.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, cols[i]]))
  })

  return NextResponse.json({ headers, hubCounts, first3 })
}
