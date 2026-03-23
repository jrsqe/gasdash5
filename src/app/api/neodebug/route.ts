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

export async function GET() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10) + ' 00:00'

  const tests = await Promise.all([
    // Gladstone - confirmed working - full sample to see column format
    probe('Gladstone station bids - Daily', {
      f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
      from, period: 'Daily', instances: 'GEN;Gladstone', section: '-1' }),

    // Station bids with different periods
    probe('Gladstone - Three Days', {
      f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
      from, period: 'Three Days', instances: 'GEN;Gladstone', section: '-1' }),
    probe('Gladstone - Weekly', {
      f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
      from, period: 'Weekly', instances: 'GEN;Gladstone', section: '-1' }),

    // Region bids with different periods
    probe('Region bids NSW1 - Weekly', {
      f: '104 Bids - Energy\\Region Bids at Actual Prices 5min',
      from, period: 'Weekly', instances: 'GEN;NSW1', section: '-1' }),

    // Price setter with different periods - try each
    probe('PS fueltype - Daily', {
      f: '108 Price Setter\\Pricesetter fueltype 30min',
      from, period: 'Daily', instances: 'NSW1', section: '-1' }),
    probe('PS fueltype - Weekly', {
      f: '108 Price Setter\\Pricesetter fueltype 30min',
      from, period: 'Weekly', instances: 'NSW1', section: '-1' }),
    probe('PS fueltype - Three Days', {
      f: '108 Price Setter\\Pricesetter fueltype 30min',
      from, period: 'Three Days', instances: 'NSW1', section: '-1' }),
    probe('PS station - Daily', {
      f: '108 Price Setter\\Pricesetter station 30min',
      from, period: 'Daily', instances: 'NSW1', section: '-1' }),
    probe('PS station - Weekly', {
      f: '108 Price Setter\\Pricesetter station 30min',
      from, period: 'Weekly', instances: 'NSW1', section: '-1' }),
    probe('PS fueltype - Monthly', {
      f: '108 Price Setter\\Pricesetter fueltype 30min',
      from, period: 'Monthly', instances: 'NSW1', section: '-1' }),
    probe('PS station - Monthly', {
      f: '108 Price Setter\\Pricesetter station 30min',
      from, period: 'Monthly', instances: 'NSW1', section: '-1' }),

    // Also try the confirmed-working station with longer periods
    probe('Loy Yang B - Weekly', {
      f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
      from, period: 'Weekly', instances: 'GEN;Loy Yang B', section: '-1' }),
    probe('Hunter Power Station - Weekly', {
      f: '104 Bids - Energy\\Station Bids at Actual Prices 5min',
      from, period: 'Weekly', instances: 'GEN;Hunter Power Station', section: '-1' }),
  ])

  return NextResponse.json({ ok: true, from, tests })
}
