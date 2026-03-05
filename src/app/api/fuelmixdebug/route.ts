import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN not set')
  return { Authorization: `Bearer ${token}` }
}

export async function GET() {
  try {
    const url = `${BASE_URL}/data/network/NEM?metrics=power&network_region=NSW1&interval=1h&fueltech_id=coal_black`
    const res = await fetch(url, { headers: getHeaders(), cache: 'no-store' })
    const json = await res.json()
    const d0 = json.data?.[0]
    return NextResponse.json({
      url,
      topKeys: Object.keys(json),
      dataLen: json.data?.length,
      item0Keys: d0 ? Object.keys(d0) : [],
      hasResults: !!d0?.results,
      hasHistory: !!d0?.history,
      resultsLen: d0?.results?.length,
      result0: d0?.results?.[0],
      histStart: d0?.history?.start,
      histInterval: d0?.history?.interval,
      histDataLen: d0?.history?.data?.length,
      histFirst5: d0?.history?.data?.slice(0,5),
      raw0: d0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
