import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

export async function GET() {
  const url = `${BASE_URL}/data/network/NEM?metrics=power&network_region=NSW1&interval=1d&primary_grouping=network_region&secondary_grouping=fueltech_group`
  const res  = await fetch(url, { headers: getHeaders(), cache: 'no-store' })
  const json = await res.json()

  // Show the shape: how many results, what fueltech_group labels, sample data
  const results = (json.data?.[0]?.results ?? []).map((r: any) => ({
    name:          r.name,
    fueltech_group: r.columns?.fueltech_group,
    columns:       r.columns,
    dataLen:       r.data?.length,
    first2:        r.data?.slice(0, 2),
  }))

  return NextResponse.json({ url, status: res.status, resultCount: results.length, results })
}
