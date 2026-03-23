import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function neoFetch(name: string, params: Record<string, string>) {
  const qs  = new URLSearchParams({ ...params, key: NEO_KEY }).toString()
  const url = `${NEO_BASE}?${qs}`
  try {
    const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    if (!res.ok) return { name, rows: 0, error: `HTTP ${res.status}` }
    const json = JSON.parse(text)
    const rows = Array.isArray(json) ? json : []
    return { name, rows: rows.length, keys: rows[0] ? Object.keys(rows[0]).slice(0, 5) : [] }
  } catch (e: any) {
    return { name, rows: 0, error: e.message }
  }
}

const STATION_NAMES = [
  // NSW coal
  'Bayswater', 'Eraring', 'Eraring Power Station', 'Mt Piper', 'Mount Piper',
  'Vales Point B', 'Vales Point',
  // NSW gas
  'Colongra', 'Tallawarra', 'Tallawarra A', 'Tallawarra B',
  'Uranquinty', 'Hunter Valley Energy Centre', 'Hunter Energy',
  'Marulan', 'Smithfield Energy Facility', 'Smithfield',
  // VIC coal
  'Loy Yang A', 'Loy Yang B', 'Yallourn',
  // VIC gas
  'Mortlake Power Station', 'Mortlake',
  'Jeeralang', 'Laverton North', 'Somerton', 'Newport Power Station',
  'Bairnsdale Power Station', 'Valley Power Peaker', 'Valley Power',
  // QLD coal
  'Tarong', 'Tarong North', 'Callide B', 'Callide C',
  'Stanwell', 'Millmerran', 'Gladstone', 'Kogan Creek',
  // QLD gas
  'Darling Downs Power Station', 'Darling Downs',
  'Condamine Power Station', 'Condamine',
  'Braemar Power Station', 'Braemar 2 Power Station',
  'Oakey Power Station',
  'Swanbank E Gas Turbine', 'Swanbank E',
  // SA gas
  'Torrens Island Power Station A', 'Torrens Island Power Station B',
  'Torrens Island A', 'Torrens Island B', 'Torrens Island',
  'Osborne Power Station', 'Osborne',
  'Pelican Point Power Station', 'Pelican Point',
  'Quarantine Power Station', 'Quarantine',
  'Snuggery Power Station', 'Snuggery',
  'Ladbroke Grove Power Station', 'Ladbroke Grove',
]

export async function GET() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10) + ' 00:00'

  const results = await Promise.all(
    STATION_NAMES.map(station =>
      neoFetch(station, {
        f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
        from, period: 'Daily',
        instances: `GEN;${station}`,
        section: '-1',
      })
    )
  )

  const working = results.filter(r => r.rows > 0)
  const failing = results.filter(r => r.rows === 0)

  return NextResponse.json({
    ok: true, from,
    working_stations: working.map(r => r.name),
    failing_stations: failing.map(r => r.name),
    detail: results,
  })
}
