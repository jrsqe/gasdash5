import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

export async function GET() {
  // Test /data/facilities/NEM?fueltech_id=coal_black — the approach now used in fetchFuelMix
  const url = `${BASE_URL}/data/facilities/NEM?metrics=power&network_region=NSW1&interval=1d&fueltech_id=coal_black`
  const res  = await fetch(url, { headers: getHeaders(), cache: 'no-store' })
  const json = await res.json()

  const d0 = json.data?.[0]
  return NextResponse.json({
    url, status: res.status,
    dataLen: json.data?.length,
    item0Keys: d0 ? Object.keys(d0) : [],
    hasResults: !!d0?.results,
    resultsLen: d0?.results?.length,
    result0: d0?.results?.[0] ? {
      keys: Object.keys(d0.results[0]),
      columns: d0.results[0].columns,
      dataLen: d0.results[0].data?.length,
      first3: d0.results[0].data?.slice(0, 3),
    } : null,
    // How many distinct unit series came back?
    allResultNames: (d0?.results ?? []).map((r: any) => r.name ?? r.columns),
  })
}
