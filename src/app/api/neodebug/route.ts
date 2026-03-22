import { NextResponse } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

async function neoFetch(params: Record<string, string>) {
  const qs  = new URLSearchParams({ ...params, key: NEO_KEY }).toString()
  const url = `${NEO_BASE}?${qs}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  const text = await res.text()
  if (!res.ok) return { error: `HTTP ${res.status}`, url, body: text.slice(0, 500) }
  try {
    const json = JSON.parse(text)
    const rows = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [])
    return { url, status: res.status, rows: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], sample: rows.slice(0, 3) }
  } catch {
    return { url, status: res.status, parseError: 'Not JSON', preview: text.slice(0, 500) }
  }
}

export async function GET() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10) + ' 00:00'

  const tests = await Promise.all([
    neoFetch({ f: '104 Bids - Energy\\Region Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;NSW1', section: '-1' })
      .then(r => ({ name: 'Region Bids NSW1', ...r })),
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;Eraring', section: '-1' })
      .then(r => ({ name: 'Station Bids - Eraring (coal)', ...r })),
    neoFetch({ f: '104 Bids - Energy\\Station Bids at Actual Prices 5min', from, period: 'Daily', instances: 'GEN;Tallawarra', section: '-1' })
      .then(r => ({ name: 'Station Bids - Tallawarra (gas)', ...r })),
    neoFetch({ f: '108 Price Setter\\Energy Pricesetter Plant Bandcost', from, period: 'Daily', instances: 'VIC1', section: '-1' })
      .then(r => ({ name: 'PS Plant Bandcost VIC1', ...r })),
    neoFetch({ f: '108 Price Setter\\Energy Pricesetting by Station', from, period: 'Daily', instances: 'VIC1', section: '-1' })
      .then(r => ({ name: 'PS by Station VIC1', ...r })),
    neoFetch({ f: '108 Price Setter\\Energy Pricesetter Plant Bandcost', from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS Plant Bandcost NSW1', ...r })),
    neoFetch({ f: '108 Price Setter\\Energy Pricesetting by Station', from, period: 'Daily', instances: 'NSW1', section: '-1' })
      .then(r => ({ name: 'PS by Station NSW1', ...r })),
  ])

  return NextResponse.json({ ok: true, from, tests })
}
