import { NextResponse } from 'next/server'

const NEO_KEY = process.env.NEO_KEY ?? 'squshe10'

async function probe(name: string, url: string) {
  try {
    const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    const text = await res.text()
    if (!res.ok) return { name, status: res.status, error: text.slice(0, 200) }

    // Try JSON parse first
    try {
      const json = JSON.parse(text)
      const rows = Array.isArray(json) ? json : []
      return { name, format: 'json', status: res.status, rows: rows.length,
        keys: rows[0] ? Object.keys(rows[0]) : [], sample: rows.slice(0, 2) }
    } catch {
      // CSV — count lines, show first 3
      const lines = text.trim().split('\n').filter(Boolean)
      return { name, format: 'csv', status: res.status, lines: lines.length,
        preview: lines.slice(0, 4) }
    }
  } catch (e: any) {
    return { name, error: e.message }
  }
}

const BASE_JSON = 'https://www.neopoint.com.au/Service/Json'
const BASE_CSV  = 'https://www.neopoint.com.au/Service/Csv'
const KEY = `key=${NEO_KEY}`

// The working CSV URL uses from=2025-03-23, period=Three Days
// Test JSON with same params, and also test various historical dates
const PS = '108%20Price%20Setter%5CEnergy%20Pricesetting%20by%20Station'

export async function GET() {
  const tests = await Promise.all([
    // Replicate the exact working CSV URL but as JSON
    probe('PS by Station NSW1 - exact working params (JSON)',
      `${BASE_JSON}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=-1&${KEY}`),

    // Same but CSV to confirm it still works
    probe('PS by Station NSW1 - exact working params (CSV)',
      `${BASE_CSV}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=-1&${KEY}`),

    // Try other regions with same date
    probe('PS by Station VIC1 - Three Days from 2025-03-23',
      `${BASE_JSON}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=VIC1&section=-1&${KEY}`),
    probe('PS by Station QLD1 - Three Days from 2025-03-23',
      `${BASE_JSON}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=QLD1&section=-1&${KEY}`),
    probe('PS by Station SA1 - Three Days from 2025-03-23',
      `${BASE_JSON}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=SA1&section=-1&${KEY}`),

    // Try Weekly period from a year ago
    probe('PS by Station NSW1 - Weekly from 2025-03-17',
      `${BASE_JSON}?f=${PS}&from=2025-03-17%2000%3A00&period=Weekly&instances=NSW1&section=-1&${KEY}`),

    // Try with different section numbers
    probe('PS by Station NSW1 - Three Days section=0',
      `${BASE_JSON}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=0&${KEY}`),
    probe('PS by Station NSW1 - Three Days section=1',
      `${BASE_JSON}?f=${PS}&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=1&${KEY}`),

    // Try other PS report names with historical date
    probe('PS Plant Bandcost NSW1 - Three Days from 2025-03-23',
      `${BASE_JSON}?f=108%20Price%20Setter%5CEnergy%20Pricesetter%20Plant%20Bandcost&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=-1&${KEY}`),
    probe('PS fueltype 30min NSW1 - Three Days from 2025-03-23',
      `${BASE_JSON}?f=108%20Price%20Setter%5CPricesetter%20fueltype%2030min&from=2025-03-23%2000%3A00&period=Three%20Days&instances=NSW1&section=-1&${KEY}`),
  ])

  return NextResponse.json({ ok: true, tests })
}
