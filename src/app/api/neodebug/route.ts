import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function probe(station: string, from: string) {
  const qs = new URLSearchParams({
    f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
    from, period: 'Daily', instances: `GEN;${station}`, section: '-1', key: NEO_KEY,
  }).toString()
  try {
    const res  = await fetch(`${NEO_BASE}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(7000) })
    const json = await res.json()
    const rows = Array.isArray(json) ? json : []
    return { station, ok: rows.length > 0, rows: rows.length }
  } catch (e: any) {
    return { station, ok: false, rows: 0, error: e.message }
  }
}

// All stations from AEMO registration list with exact names
const STATIONS = [
  // NSW
  'Eraring', 'Bayswater', 'Mt Piper', 'Vales Pt',
  'Tallawarra', 'Colongra', 'Uranquinty', 'Hunter Power Station', 'Smithfield Energy Facility',
  // VIC
  'Loy Yang A', 'Loy Yang B', 'Yallourn',
  'Mortlake', 'Jeeralang A', 'Jeeralang B', 'Laverton North',
  'Somerton', 'Newport', 'Bairnsdale', 'Valley Power Peaking Facility',
  // QLD
  'Gladstone', 'Tarong', 'Tarong North', 'Callide B', 'Callide C',
  'Stanwell', 'Millmerran', 'Kogan Creek',
  'Darling Downs', 'Condamine A', 'Braemar Power', 'Braemar 2 Power',
  'Oakey', 'Swanbank E', 'Townsville Gas Turbine', 'Yarwun', 'Roma',
  // SA
  'Torrens Island B', 'Osborne', 'Pelican Point', 'Quarantine',
  'Ladbroke Grove', 'Dry Creek Gas Turbine', 'Mintaro Gas Turbine',
  'Hallett', 'Barker Inlet',
]

export async function GET() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10) + ' 00:00'

  const results = []
  for (let i = 0; i < STATIONS.length; i += 10) {
    const batch = await Promise.all(STATIONS.slice(i, i + 10).map(s => probe(s, from)))
    results.push(...batch)
  }

  return NextResponse.json({
    ok: true, from,
    working: results.filter(r => r.ok).map(r => r.station),
    failing: results.filter(r => !r.ok).map(r => r.station),
  })
}
