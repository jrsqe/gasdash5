import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function probe(name: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: NEO_KEY }).toString()
  try {
    const res  = await fetch(`${NEO_BASE}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const json = await res.json()
    const rows = Array.isArray(json) ? json : []
    return { name, rows: rows.length, keys: rows[0] ? Object.keys(rows[0]).slice(0, 6) : [], sample: rows.slice(0, 1) }
  } catch (e: any) {
    return { name, rows: 0, error: e.message }
  }
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10) + ' 00:00'
}

export async function GET() {
  const from = daysAgo(1)

  // Exhaustive search of 108 Price Setter report names using Daily period
  // Names come from the NEOpoint All Reports page (section 10 of user guide)
  const psNames = [
    'Pricesetter fueltype 30min',
    'Pricesetter fueltype 5min',
    'Pricesetter fueltype and region demand 30min',
    'Pricesetter fueltype and system demand 30min',
    'Pricesetter station 30min',
    'Pricesetter station 5min',
    'Pricesetter All Data Table',
    'Pricesetter Data Table - no FCAS',
    'Pricesetter unit and fuel by region',
    'Energy Pricesetting by Station',
    'Energy Pricesetter Plant Bandcost',
    'Pricesetter fueltype and region demand 5min',
    'Region Pricesetter fueltype',
    'Region Pricesetter station',
    'Dispatch Pricesetter fueltype',
  ]

  const tests = await Promise.all(
    psNames.map(n => probe(`108 PS: ${n}`, {
      f: `108 Price Setter\\${n}`,
      from, period: 'Daily', instances: 'NSW1', section: '-1',
    }))
  )

  return NextResponse.json({ ok: true, from, working: tests.filter(t => t.rows > 0), all: tests })
}
