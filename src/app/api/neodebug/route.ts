import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function probe(name: string, params: Record<string, string>) {
  const qs  = new URLSearchParams({ ...params, key: NEO_KEY }).toString()
  try {
    const res  = await fetch(`${NEO_BASE}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const json = await res.json()
    const rows = Array.isArray(json) ? json : []
    return { name, rows: rows.length, keys: rows[0] ? Object.keys(rows[0]).slice(0, 8) : [], sample: rows[0] ?? null }
  } catch (e: any) {
    return { name, rows: 0, error: e.message }
  }
}

export async function GET() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10) + ' 00:00'

  const base = { from, period: 'Daily', section: '-1' }

  const tests = await Promise.all([
    // Station bid PRICES (not volumes) - what price did each station bid?
    probe('Region Bids NSW1 (confirmed working)', {
      ...base, f: '104 Bids - Energy\\Region Bids at Actual Prices 5min', instances: 'GEN;NSW1' }),

    // Try station-level price reports
    probe('Station Dispatch Prices NSW1', {
      ...base, f: '104 Bids - Energy\\Station Dispatch Prices 5min', instances: 'GEN;NSW1' }),
    probe('Region Dispatch Price NSW1', {
      ...base, f: '101 Prices\\Region Dispatch, P5min and Predispatch Prices 5min', instances: 'NSW1' }),

    // Price setter - try ALL section numbers to find non-empty ones
    probe('PS fueltype s=0', {
      ...base, f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1', section: '0' }),
    probe('PS fueltype s=1', {
      ...base, f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1', section: '1' }),
    probe('PS fueltype s=2', {
      ...base, f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1', section: '2' }),
    probe('PS fueltype s=3', {
      ...base, f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1', section: '3' }),

    // Try different period types
    probe('PS fueltype period=5min', {
      from, period: '5min', section: '-1', f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1' }),
    probe('PS fueltype period=Weekly', {
      from, period: 'Weekly', section: '-1', f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1' }),
    probe('PS fueltype period=Monthly', {
      from, period: 'Monthly', section: '-1', f: '108 Price Setter\\Pricesetter fueltype 30min', instances: 'NSW1' }),

    // Try the exact URLs from the user's original links
    probe('PS Plant Bandcost (original URL)', {
      ...base, f: '108 Price Setter\\Energy Pricesetter Plant Bandcost', instances: 'VIC1' }),
    probe('PS Pricesetting by Station (original URL)', {
      ...base, f: '108 Price Setter\\Energy Pricesetting by Station', instances: 'VIC1' }),

    // What does the region bids look like for confirmed working station?
    probe('Gladstone station bids', {
      ...base, f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', instances: 'GEN;Gladstone' }),
  ])

  return NextResponse.json({ ok: true, from, tests })
}
