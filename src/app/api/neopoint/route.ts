import { NextResponse, NextRequest } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY ?? 'squshe10'

// Lightweight cache: report key → { data, at }
const cache = new Map<string, { data: any; at: number }>()
const TTL   = 60 * 60 * 1000  // 1 hour

export const revalidate = 0  // no static caching — use our own TTL

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const report    = searchParams.get('report') ?? ''
  const from      = searchParams.get('from')   ?? ''
  const instances = searchParams.get('instances') ?? ''
  const period    = searchParams.get('period') ?? 'Daily'
  const section   = searchParams.get('section') ?? '-1'

  if (!report) return NextResponse.json({ ok: false, error: 'Missing report param' }, { status: 400 })

  const cacheKey = `${report}|${from}|${instances}|${period}`
  const cached   = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ ok: true, data: cached.data, cached: true })
  }

  try {
    const qs = new URLSearchParams({
      f:        report,
      from,
      period,
      instances,
      section,
      key:      NEO_KEY,
    }).toString()

    const res = await fetch(`${NEO_BASE}?${qs}`, {
      cache:  'no-store',
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, error: `NEOpoint returned ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      )
    }

    const data = await res.json()
    cache.set(cacheKey, { data, at: Date.now() })
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
