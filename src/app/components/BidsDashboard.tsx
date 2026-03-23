'use client'
import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type NemRegion = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'

const REGIONS: NemRegion[] = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const RLABEL: Record<NemRegion, string> = { NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA' }
const RCOL:   Record<NemRegion, string> = {
  NSW1: '#0071E3', VIC1: '#30C254', QLD1: '#FF9F0A', SA1: '#AF52DE',
}

// from must be a completed past window — default 3 weeks ago
function defaultFrom(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 21)
  return d.toISOString().slice(0, 10)
}

function offsetDate(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function stationFuel(name: string): 'gas' | 'coal' | 'other' {
  const n = name.toLowerCase()
  const gas  = ['colongra','tallawarra','uranquinty','hunter','smithfield','mortlake',
    'jeeralang','laverton','somerton','newport','bairnsdale','valley power',
    'darling downs','condamine','braemar','oakey','swanbank','townsville',
    'yarwun','roma','torrens','osborne','pelican','quarantine','ladbroke',
    'dry creek','mintaro','hallett','barker']
  const coal = ['bayswater','eraring','mt piper','vales','loy yang','yallourn',
    'callide','millmerran','kogan','stanwell','tarong','gladstone']
  if (gas.some(g  => n.includes(g))) return 'gas'
  if (coal.some(c => n.includes(c))) return 'coal'
  return 'other'
}

async function fetchPriceSetter(region: NemRegion, from: string): Promise<any[]> {
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

interface PsRow { station: string; pct: number; fuel: 'gas' | 'coal' | 'other' }

function parseRows(rows: any[], region: NemRegion): PsRow[] {
  const key = `${region}.PercentSetting`
  return rows
    .map(r => {
      const raw = Number(r[key] ?? 0)
      // Values may be fraction (0–1) or already percent (0–100)
      const pct = Math.round((raw > 1 ? raw : raw * 100) * 10) / 10
      return { station: String(r.DateTime ?? ''), pct, fuel: stationFuel(String(r.DateTime ?? '')) }
    })
    .filter(r => r.station && r.pct > 0.05)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 30)
}

function Pills({ value, onChange, opts }: {
  value: string
  onChange: (v: string) => void
  opts: { v: string; label: string }[]
}) {
  return (
    <div style={{ display: 'flex', background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
      {opts.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '0.25rem 0.65rem', borderRadius: 6, border: 'none',
          cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.72rem',
          transition: 'all 0.15s', fontWeight: value === v ? 600 : 400,
          background: value === v ? 'var(--accent)' : 'transparent',
          color:      value === v ? '#fff' : 'var(--muted)',
        }}>{label}</button>
      ))}
    </div>
  )
}

export default function BidsDashboard() {
  const [region,  setRegion]  = useState<NemRegion>('NSW1')
  const [from,    setFrom]    = useState(defaultFrom)
  const [rawRows, setRawRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setRawRows([])
    fetchPriceSetter(region, from)
      .then(data  => { if (!cancelled) { setRawRows(data); setLoading(false) } })
      .catch(e    => { if (!cancelled) { setError(String(e?.message || e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [region, from])

  const data = useMemo(() => parseRows(rawRows, region), [rawRows, region])

  const fuelColour = (f: 'gas' | 'coal' | 'other') =>
    f === 'gas' ? '#FF9F0A' : f === 'coal' ? '#636366' : '#64D2FF'

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
          NEOpoint · 108 Price Setter · % of dispatch intervals as price setter · 3-day window
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        alignItems: 'center', marginBottom: '1.25rem' }}>

        {/* Region */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
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

        {/* Quick date presets */}
        <Pills
          value={from}
          onChange={setFrom}
          opts={[
            { v: offsetDate(4),  label: 'Last 3 days' },
            { v: offsetDate(10), label: '~1 week ago' },
            { v: offsetDate(21), label: '~3 weeks ago' },
            { v: offsetDate(35), label: '~5 weeks ago' },
          ]}
        />

        {/* Manual date input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '0.25rem 0.6rem' }}>
          <label style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem',
            color: 'var(--muted)', whiteSpace: 'nowrap' }}>Period start</label>
          <input type="date" value={from} max={offsetDate(3)}
            onChange={e => setFrom(e.target.value)}
            style={{ fontFamily: 'var(--font-data)', fontSize: '0.7rem',
              color: 'var(--text)', background: 'transparent',
              border: 'none', outline: 'none', cursor: 'pointer' }} />
        </div>

        {loading && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem',
            color: 'var(--muted)' }}>Loading…</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '1rem', marginBottom: '1rem',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--negative)',
          fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
          Error: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)',
          fontFamily: 'var(--font-data)', fontSize: '0.75rem',
          background: 'var(--surface-2)', borderRadius: 12,
          border: '1px solid var(--border)' }}>
          Loading price setter data…
        </div>
      )}

      {/* Chart */}
      {!loading && data.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '1.25rem' }}>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem',
            marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem',
              color: 'var(--text)' }}>
              {RLABEL[region]} · {from}
            </h3>
            <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)',
              fontSize: '0.62rem' }}>
              3-day window · {data.length} stations
            </span>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
            {(['gas', 'coal', 'other'] as const)
              .filter(f => data.some(d => d.fuel === f))
              .map(f => (
                <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2,
                    background: fuelColour(f), display: 'inline-block' }} />
                  {f}
                </span>
              ))}
          </div>

          <ResponsiveContainer width="100%" height={Math.max(250, data.length * 24)}>
            <BarChart data={data} layout="vertical"
              margin={{ top: 4, right: 80, bottom: 4, left: 160 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number"
                tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 'dataMax']}
              />
              <YAxis type="category" dataKey="station" width={155}
                tick={{ fill: 'var(--text)', fontSize: 9, fontFamily: 'var(--font-data)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
                formatter={(v: any, _: any, p: any) => [
                  `${v}%`,
                  `${p?.payload?.station || ''} (${p?.payload?.fuel || ''})`,
                ]}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {data.map(d => (
                  <Cell key={d.station} fill={fuelColour(d.fuel)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* No data */}
      {!loading && !error && data.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)',
          fontFamily: 'var(--font-data)', fontSize: '0.75rem',
          background: 'var(--surface-2)', borderRadius: 12,
          border: '1px solid var(--border)' }}>
          No data for {RLABEL[region]} starting {from}.
          Try a different date — the 3-day window must be fully completed.
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
        marginTop: '1rem', fontFamily: 'var(--font-data)', fontSize: '0.62rem',
        color: 'var(--muted)', display: 'flex', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>Source: NEOpoint · 108 Price Setter · Energy Pricesetting by Station</span>
        <span>Period start date must be at least 3 days in the past for completed data</span>
      </div>
    </div>
  )
}
