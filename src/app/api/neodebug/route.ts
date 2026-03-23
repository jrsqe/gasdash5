import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function probe(name: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: NEO_KEY }).toString()
  try {
    const res  = await fetch(`${NEO_BASE}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const json = await res.json()
    const rows = Array.isArray(json) ? json : []
    return { name, rows: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], sample: rows.slice(0, 2) }
  } catch (e: any) {
    return { name, rows: 0, error: e.message }
  }
}

function weeksAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n * 7)
  return d.toISOString().slice(0, 10) + ' 00:00'
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10) + ' 00:00'
}

export async function GET() {
  const tests = await Promise.all([
    // Price setter - using from = past date so period covers completed data
    probe('PS by Station SA1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Energy Pricesetting by Station',
      from: weeksAgo(2), period: 'Weekly', instances: 'SA1', section: '-1' }),
    probe('PS by Station NSW1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Energy Pricesetting by Station',
      from: weeksAgo(2), period: 'Weekly', instances: 'NSW1', section: '-1' }),
    probe('PS by Station VIC1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Energy Pricesetting by Station',
      from: weeksAgo(2), period: 'Weekly', instances: 'VIC1', section: '-1' }),
    probe('PS by Station QLD1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Energy Pricesetting by Station',
      from: weeksAgo(2), period: 'Weekly', instances: 'QLD1', section: '-1' }),

    // Try the other price setter report too
    probe('PS Plant Bandcost SA1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Energy Pricesetter Plant Bandcost',
      from: weeksAgo(2), period: 'Weekly', instances: 'SA1', section: '-1' }),
    probe('PS Plant Bandcost NSW1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Energy Pricesetter Plant Bandcost',
      from: weeksAgo(2), period: 'Weekly', instances: 'NSW1', section: '-1' }),

    // Also try Daily from further back
    probe('PS by Station NSW1 Daily (from 8d ago)', {
      f: '108 Price Setter\\Energy Pricesetting by Station',
      from: daysAgo(8), period: 'Daily', instances: 'NSW1', section: '-1' }),
    probe('PS fueltype NSW1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Pricesetter fueltype 30min',
      from: weeksAgo(2), period: 'Weekly', instances: 'NSW1', section: '-1' }),
    probe('PS station 30min NSW1 Weekly (from 2w ago)', {
      f: '108 Price Setter\\Pricesetter station 30min',
      from: weeksAgo(2), period: 'Weekly', instances: 'NSW1', section: '-1' }),

    // Region bids with Weekly period from 2w ago
    probe('Region bids NSW1 Weekly (from 2w ago)', {
      f: '104 Bids - Energy\\Region Bids at Actual Prices 5min',
      from: weeksAgo(2), period: 'Weekly', instances: 'GEN;NSW1', section: '-1' }),
    probe('Station bids Gladstone Weekly (from 2w ago)', {
      f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
      from: weeksAgo(2), period: 'Weekly', instances: 'GEN;Gladstone', section: '-1' }),
  ])

  return NextResponse.json({ ok: true, tests })
}
