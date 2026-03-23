'use client'
import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type NemRegion = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'
const REGIONS: NemRegion[] = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const RLABEL: Record<NemRegion, string> = { NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA' }
const RCOL:   Record<NemRegion, string> = {
  NSW1: '#0071E3', VIC1: '#30C254', QLD1: '#FF9F0A', SA1: '#AF52DE',
}

// from = 4 days ago so the 3-day window is fully completed
function getFrom(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 4)
  return d.toISOString().slice(0, 10)
}

// Fuel classification based on exact station names from the data
function stationFuel(name: string): 'gas' | 'coal' | 'renewable' | 'battery' | 'other' {
  const n = name.toLowerCase()

  // Battery first — catches "Torrens Island BESS", "Hazelwood Battery...", etc.
  // Must run before gas/coal checks since some battery names contain gas station names
  if (n.includes('bess') || n.includes('battery') || n.includes('big battery') ||
      n.includes('power reserve') || n.includes('hornsdale') ||
      n.includes('rangebank') || n.includes('koorangie') || n.includes('tarong bess') ||
      n.includes('wandoan bess')) return 'battery'

  // Coal — exact station names from AEMO registration
  if (['bayswater','eraring','mt piper','vales pt','loy yang a','loy yang b','yallourn',
       'callide b','callide c','millmerran','kogan creek','stanwell','tarong north',
       'tarong','gladstone'].some(s => n === s)) return 'coal'

  // Gas — exact station names from AEMO registration
  if (['colongra','tallawarra','uranquinty','hunter power station','smithfield energy facility',
       'mortlake','jeeralang a','jeeralang b','laverton north','somerton','newport',
       'bairnsdale','valley power peaking facility','darling downs','condamine a',
       'braemar power','braemar 2 power','oakey','swanbank e','townsville gas turbine',
       'yarwun','roma','torrens island b','torrens island a','osborne','pelican point',
       'quarantine','ladbroke grove','dry creek gas turbine','mintaro gas turbine',
       'hallett','barker inlet'].some(s => n === s)) return 'gas'

  // Renewable — hydro, wind, solar
  if (n.includes('wind') || n.includes('solar') || n.includes('farm') ||
      n.includes('murray') || n.includes('tumut') || n.includes('gordon') ||
      n.includes('wivenhoe') || n.includes('poatina') || n.includes('reece') ||
      n.includes('tribute') || n.includes('fisher') || n.includes('cethana') ||
      n.includes('john butters') || n.includes('tungatinah') || n.includes('liapootah') ||
      n.includes('hydro') || n.includes('dartmouth') || n.includes('eildon') ||
      n.includes('kiewa') || n.includes('blowering') || n.includes('guthega') ||
      n.includes('hume') || n.includes('kareeya') || n.includes('barron') ||
      n.includes('mackintosh') || n.includes('meadowbank') || n.includes('bastyan') ||
      n.includes('gordon') || n.includes('tarralea') || n.includes('trevallyn') ||
      n.includes('pump')) return 'renewable'

  return 'other'
}

const FUEL_COL: Record<string, string> = {
  gas:       '#FF9F0A',
  coal:      '#636366',
  battery:   '#AF52DE',
  renewable: '#30C254',
  other:     '#64D2FF',
}

async function fetchPS(region: NemRegion, from: string): Promise<any[]> {
  const p = new URLSearchParams({
    report:    '108 Price Setter\\Energy Pricesetting by Station',
    from:      `${from} 00:00`,
    period:    'Three Days',
    instances: region,
    section:   '-1',
  })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || 'fetch failed')
  if (Array.isArray(j.data))       return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

export default function BidsDashboard() {
  const [region,  setRegion]  = useState<NemRegion>('NSW1')
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const from = getFrom()

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setRows([])
    fetchPS(region, from)
      .then(data => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch(e   => { if (!cancelled) { setError(String(e?.message || e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [region])

  const data = useMemo(() => {
    const key = `${region}.PercentSetting`
    return rows
      .map(r => ({
        station: String(r.DateTime ?? ''),
        // Values are already percentages (e.g. 13.12 = 13.12%)
        pct:     Math.round(Number(r[key] ?? 0) * 100) / 100,
        fuel:    stationFuel(String(r.DateTime ?? '')),
      }))
      .filter(r => r.station && r.pct > 0)
      .sort((a, b) => b.pct - a.pct)
  }, [rows, region])

  const total = useMemo(() => Math.round(data.reduce((s, d) => s + d.pct, 0) * 10) / 10, [data])

  // Date range label
  const toDate = new Date(); toDate.setUTCDate(toDate.getUTCDate() - 1)
  const fromDate = new Date(); fromDate.setUTCDate(fromDate.getUTCDate() - 4)
  const dateLabel = `${fromDate.toLocaleDateString('en-AU', { day:'numeric', month:'short' })} – ${toDate.toLocaleDateString('en-AU', { day:'numeric', month:'short' })}`

  const fuelsPresent = ['gas','coal','battery','renewable','other'].filter(
    f => data.some(d => d.fuel === f)
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>
          Price Setter by Station
        </h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)',
          fontFamily: 'var(--font-data)', fontSize: '0.65rem' }}>
          NEOpoint · % of 5-min dispatch intervals as price setter · {dateLabel}
        </p>
      </div>

      {/* Region tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)',
        marginBottom: '1.25rem' }}>
        {REGIONS.map(r => (
          <button key={r} onClick={() => setRegion(r)} style={{
            padding: '0.4rem 0.9rem', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
            fontWeight: r === region ? 600 : 400,
            color: r === region ? RCOL[r] : 'var(--muted)',
            borderBottom: r === region ? `2px solid ${RCOL[r]}` : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{RLABEL[r]}</button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--negative)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
          Error: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)',
          fontFamily: 'var(--font-data)', fontSize: '0.75rem',
          background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
          Loading…
        </div>
      )}

      {/* Chart */}
      {!loading && data.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '1.25rem' }}>

          {/* Chart header */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                {RLABEL[region]} Price Setting · {dateLabel}
              </h3>
              <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
                {data.length} stations · {total}% total
              </span>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', marginBottom: '0.75rem' }}>
            {fuelsPresent.map(f => (
              <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2,
                  background: FUEL_COL[f], display: 'inline-block' }} />
                {f}
              </span>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={Math.max(300, data.length * 22)}>
            <BarChart data={data} layout="vertical"
              margin={{ top: 4, right: 70, bottom: 4, left: 175 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number"
                tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 'dataMax']}
              />
              <YAxis type="category" dataKey="station" width={170}
                tick={{ fill: 'var(--text)', fontSize: 9, fontFamily: 'var(--font-data)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
                formatter={(v: any, _: any, p: any) => [
                  `${v}% of intervals`,
                  `${p?.payload?.station || ''} · ${p?.payload?.fuel || ''}`,
                ]}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {data.map(d => (
                  <Cell key={d.station} fill={FUEL_COL[d.fuel]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)',
          fontFamily: 'var(--font-data)', fontSize: '0.75rem',
          background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
          No data returned for {RLABEL[region]}.
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '1rem',
        fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>Source: NEOpoint · 108 Price Setter · Energy Pricesetting by Station</span>
        <span>All stations that set price in {RLABEL[region]} over the 3-day window</span>
      </div>
    </div>
  )
}
