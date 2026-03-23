import { NextResponse } from 'next/server'

const NEO_KEY = process.env.NEO_KEY ?? 'squshe10'
const BASE    = 'https://www.neopoint.com.au/Service/Json'

async function probe(name: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: NEO_KEY })
  try {
    const res  = await fetch(`${BASE}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    const json = await res.json()
    const rows = Array.isArray(json) ? json : []
    return { name, rows: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], sample: rows.slice(0, 3) }
  } catch (e: any) {
    return { name, rows: 0, error: e.message }
  }
}

export async function GET() {
  // Test sequentially to avoid concurrent request limit
  const results = []

  // The exact URL from user - Merit Order Stack
  results.push(await probe('Merit Order Stack NSW1 Gas Daily', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;NSW1;Gas', section: '-1',
  }))

  // Try other regions
  results.push(await probe('Merit Order Stack VIC1 Gas Daily', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;VIC1;Gas', section: '-1',
  }))

  results.push(await probe('Merit Order Stack QLD1 Gas Daily', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;QLD1;Gas', section: '-1',
  }))

  results.push(await probe('Merit Order Stack SA1 Gas Daily', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;SA1;Gas', section: '-1',
  }))

  // Try different sections
  results.push(await probe('Merit Order Stack NSW1 Gas section=0', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;NSW1;Gas', section: '0',
  }))
  results.push(await probe('Merit Order Stack NSW1 Gas section=1', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;NSW1;Gas', section: '1',
  }))
  results.push(await probe('Merit Order Stack NSW1 Gas section=2', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: '2025-03-23 00:00', period: 'Daily', instances: 'GEN;NSW1;Gas', section: '2',
  }))

  // Try recent date too
  const yesterday = new Date(); yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10) + ' 00:00'
  results.push(await probe('Merit Order Stack NSW1 Gas yesterday', {
    f: '104 Bids - Energy\\Merit Order Stack by Region & Fuel',
    from: yStr, period: 'Daily', instances: 'GEN;NSW1;Gas', section: '-1',
  }))

  return NextResponse.json({ ok: true, results })
}
