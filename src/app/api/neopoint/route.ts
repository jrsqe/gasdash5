import { NextResponse, NextRequest } from 'next/server'

const NEO_BASE = 'https://www.neopoint.com.au/Service/Json'
const NEO_KEY  = process.env.NEO_KEY

// Simple in-memory cache
const cache = new Map<string, { data: any; at: number }>()
const TTL   = 60 * 60 * 1000  // 1 hour

// Queue to enforce max 1 concurrent request to NEOpoint
let inFlight = 0
const queue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  return new Promise(resolve => {
    if (inFlight === 0) { inFlight++; resolve() }
    else queue.push(() => { inFlight++; resolve() })
  })
}

function releaseSlot() {
  inFlight--
  if (queue.length > 0) {
    const next = queue.shift()!
    next()
  }
}

export const revalidate = 0

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const report    = searchParams.get('report') ?? ''
  const from      = searchParams.get('from')   ?? ''
  const instances = searchParams.get('instances') ?? ''
  const period    = searchParams.get('period') ?? 'Daily'
  const section   = searchParams.get('section') ?? '-1'

  if (!NEO_KEY) return NextResponse.json({ ok: false, error: 'NEO_KEY environment variable not set' }, { status: 500 })
  if (!report) return NextResponse.json({ ok: false, error: 'Missing report' }, { status: 400 })

  const cacheKey = `${report}|${from}|${instances}|${period}|${section}`
  const cached   = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ ok: true, data: cached.data, cached: true })
  }

  await acquireSlot()
  try {
    const qs = new URLSearchParams({ f: report, from, period, instances, section, key: NEO_KEY! })
    const res = await fetch(`${NEO_BASE}?${qs}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, error: `NEOpoint ${res.status}`, detail: text.slice(0, 300) },
        { status: 502 }
      )
    }

    const data = await res.json()
    cache.set(cacheKey, { data, at: Date.now() })
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    releaseSlot()
  }
}
