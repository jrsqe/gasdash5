import { NextResponse } from 'next/server'

const NEO_KEY = process.env.NEO_KEY
const BASE    = 'https://www.neopoint.com.au/Service/Json'

export async function GET() {
  // Use the exact params from the working CSV link, just swap to JSON
  // from=2025-03-23, period=Three Days, instances=NSW1
  const urls = [
    `${BASE}?f=108%20Price%20Setter%5CEnergy%20Pricesetting%20by%20Station&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=-1&key=${NEO_KEY}`,
    `${BASE}?f=108%20Price%20Setter%5CEnergy%20Pricesetting%20by%20Station&from=2025-03-23%2000%3A00&period=Three%20Days&instances=VIC1&section=-1&key=${NEO_KEY}`,
  ]

  const results = []
  for (const url of urls) {
    try {
      const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      const json = await res.json()
      const rows = Array.isArray(json) ? json : []
      results.push({ url, rows: rows.length, allKeys: rows[0] ? Object.keys(rows[0]) : [], allRows: rows })
    } catch (e: any) {
      results.push({ url, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, results })
}
