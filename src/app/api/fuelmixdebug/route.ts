import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

export async function GET() {
  const results: Record<string, any> = {}

  // Test 3 different query approaches with 1d interval (small response)
  const tests = [
    { key: 'A_primaryGroupingFueltech', url: `${BASE_URL}/data/network/NEM?metrics=power&network_region=NSW1&interval=1d&primary_grouping=fueltech` },
    { key: 'B_fueltechIdCoal',          url: `${BASE_URL}/data/network/NEM?metrics=power&network_region=NSW1&interval=1d&fueltech_id=coal_black` },
    { key: 'C_noFilter',                url: `${BASE_URL}/data/network/NEM?metrics=power&network_region=NSW1&interval=1d` },
  ]

  for (const { key, url } of tests) {
    try {
      const res  = await fetch(url, { headers: getHeaders(), cache: 'no-store' })
      const json = await res.json()

      // Return the FULL raw response so we can see exactly what comes back
      results[key] = { url, status: res.status, raw: json }
    } catch (e: any) {
      results[key] = { url, error: e.message }
    }
  }

  return NextResponse.json(results, {
    headers: { 'Content-Type': 'application/json' }
  })
}
