import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.openelectricity.org.au/v4'

async function apiFetch(url: string, params: Record<string, string>) {
  const qs  = new URLSearchParams(params).toString()
  const res = await fetch(`${url}?${qs}`, {
    headers: { 'Authorization': `Bearer ${process.env.OE_API_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

export async function GET() {
  const resp = await apiFetch(`${BASE_URL}/data/network/NEM`, {
    metrics:            'power',
    network_region:     'NSW1',
    interval:           '1h',
    primary_grouping:   'network_region',
    secondary_grouping: 'fueltech_group',
  })

  // Summarise structure: for each item show columns + fueltech_groups found + sample values
  const summary = (resp.data ?? []).map((item: any) => ({
    item_columns:    item.columns,
    result_count:    item.results?.length,
    fueltechs:       item.results?.map((r: any) => ({
      columns:       r.columns,
      data_length:   r.data?.length,
      first_3_rows:  r.data?.slice(0, 3),
      last_row:      r.data?.slice(-1)[0],
      // Check for negative values
      has_negatives: r.data?.some((d: any) => Array.isArray(d) && d[1] < 0),
      min_val:       r.data?.reduce((m: number, d: any) => Array.isArray(d) ? Math.min(m, d[1]) : m, Infinity),
      max_val:       r.data?.reduce((m: number, d: any) => Array.isArray(d) ? Math.max(m, d[1]) : m, -Infinity),
    })),
  }))

  return NextResponse.json({ item_count: resp.data?.length, summary })
}
