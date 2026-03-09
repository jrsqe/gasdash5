import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'

async function apiFetch(url: string, params: Record<string, string>) {
  const token = process.env.OE_API_TOKEN ?? ''
  const qs  = '?' + new URLSearchParams(params).toString()
  const res = await fetch(`${url}${qs}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  })
  const text = await res.text()
  return { status: res.status, text }
}

export async function GET() {
  // Test 1: same call as fetchFuelMix
  const { status, text } = await apiFetch(`${BASE_URL}/data/network/NEM`, {
    metrics:            'power',
    network_region:     'NSW1',
    interval:           '1h',
    primary_grouping:   'network_region',
    secondary_grouping: 'fueltech_group',
  })

  let parsed: any = null
  try { parsed = JSON.parse(text) } catch {}

  const topKeys      = parsed ? Object.keys(parsed) : []
  const dataLen      = parsed?.data?.length ?? 'n/a'
  const firstItem    = parsed?.data?.[0]
  const firstItemKeys = firstItem ? Object.keys(firstItem) : []
  const resultsLen   = firstItem?.results?.length ?? 'n/a'
  const firstResult  = firstItem?.results?.[0]

  return NextResponse.json({
    http_status:      status,
    top_keys:         topKeys,
    data_length:      dataLen,
    first_item_keys:  firstItemKeys,
    first_item_cols:  firstItem?.columns,
    results_count:    resultsLen,
    first_result:     firstResult ? {
      columns:        firstResult.columns,
      data_length:    firstResult.data?.length,
      first_3:        firstResult.data?.slice(0, 3),
    } : null,
    // all fueltech_group values present
    all_fueltechs:    firstItem?.results?.map((r: any) => r.columns?.fueltech_group),
    // raw snippet if parsing failed
    raw_snippet:      parsed ? undefined : text.slice(0, 500),
  })
}
