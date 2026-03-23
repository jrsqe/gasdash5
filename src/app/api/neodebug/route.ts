import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function neoFetch(params: Record<string, string>) {
  const qs  = new URLSearchParams({ ...params, key: NEO_KEY }).toString()
  const url = `${NEO_BASE}?${qs}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  const text = await res.text()
  if (!res.ok) return { error: `HTTP ${res.status}`, url, body: text.slice(0, 200) }
  try {
    const json = JSON.parse(text)
    const rows = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [])
    return {
      url, status: res.status, rows: rows.length,
      keys: rows[0] ? Object.keys(rows[0]).slice(0, 6) : [],
      sample: rows.slice(0, 1)
    }
  } catch { return { url, status: res.status, parseError: 'Not JSON', preview: text.slice(0, 200) } }
}

export async function GET() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10) + ' 00:00'

  // We know region bids works. Now hunt for:
  // 1. Correct price setter report names in this subscription
  // 2. Correct station name format for station bids
  const tests = await Promise.all([

    // ── Price setter candidates ──────────────────────────────────────────────
    neoFetch({ f: '108 Price Setter\\Pricesetter fueltype 30min',          from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: Pricesetter fueltype 30min', ...r })),
    neoFetch({ f: '108 Price Setter\\Pricesetter fueltype and region demand 30min', from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: fueltype and region demand 30min', ...r })),
    neoFetch({ f: '108 Price Setter\\Pricesetter station 30min',           from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: station 30min', ...r })),
    neoFetch({ f: '108 Price Setter\\Pricesetter All Data Table',          from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: All Data Table', ...r })),
    neoFetch({ f: '108 Price Setter\\Pricesetter Data Table - no FCAS',    from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: Data Table no FCAS', ...r })),
    neoFetch({ f: '108 Price Setter\\Pricesetter unit and fuel by region',  from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: unit and fuel by region', ...r })),
    neoFetch({ f: '108 Price Setter\\Pricesetter fueltype and system demand 30min', from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS: fueltype and system demand 30min', ...r })),

    // ── Station bids: try DUID formats directly ──────────────────────────────
    // From the region bids we know NSW coal DUIDs: ER01-04, ERB01, BW01-04, MP1-2
    // NSW gas DUIDs: CG1-4, TALWA1, TALWB1, URANQ11-14, HEZ1, HUNTER1, HUNTER2, SITHE01
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;ER01', section: '-1' })
      .then(r => ({ name: 'Station Bids DUID=ER01', ...r })),
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;CG1', section: '-1' })
      .then(r => ({ name: 'Station Bids DUID=CG1 (Colongra gas)', ...r })),
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;TALWA1', section: '-1' })
      .then(r => ({ name: 'Station Bids DUID=TALWA1 (Tallawarra)', ...r })),
    // Try station name variants
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;Eraring Power Station', section: '-1' })
      .then(r => ({ name: 'Station Bids name="Eraring Power Station"', ...r })),
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;Bayswater', section: '-1' })
      .then(r => ({ name: 'Station Bids name="Bayswater"', ...r })),
  ])

  return NextResponse.json({ ok: true, from, tests })
}
