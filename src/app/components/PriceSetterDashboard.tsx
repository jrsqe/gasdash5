'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
interface RegionData {
  dates:          string[]
  totalIntervals: (number | null)[]
  byFuelGroup:    Record<string, (number | null)[]>
  byGasDuid:      Record<string, { intervals: (number | null)[]; name: string }>
}

// ── Colours ───────────────────────────────────────────────────────────────────
const FUEL_COLOURS: Record<string, string> = {
  Gas:          '#FF9F0A',
  Coal:         '#636366',
  Wind:         '#30C254',
  Solar:        '#FFD60A',
  Hydro:        '#0071E3',
  Battery:      '#AF52DE',
  'Liquid fuel':'#FF453A',
  Other:        '#98989D',
}
const FUEL_ORDER = ['Gas', 'Coal', 'Wind', 'Solar', 'Hydro', 'Battery', 'Liquid fuel', 'Other']

const GAS_DUID_PALETTE = [
  '#FF9F0A','#FFCC02','#FF6B35','#FF453A',
  '#FF9F0A','#FFD60A','#E8602C','#FF8C00',
]

const REGIONS = ['NSW', 'VIC', 'QLD', 'SA']

function fmtDate(iso: string) {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

// ── Stacked bar: % of intervals by fuel group ─────────────────────────────────
function FuelShareChart({ regionData, region }: { regionData: RegionData; region: string }) {
  const rows = useMemo(() => {
    return regionData.dates.map((date, i) => {
      const total = regionData.totalIntervals[i] ?? 0
      const row: Record<string, any> = { date: fmtDate(date), rawDate: date, total }
      for (const fg of FUEL_ORDER) {
        const count = regionData.byFuelGroup[fg]?.[i] ?? 0
        row[fg] = total > 0 ? Math.round(count / total * 1000) / 10 : 0
      }
      return row
    })
  }, [regionData])

  const presentFuels = FUEL_ORDER.filter(fg =>
    rows.some(r => (r[fg] ?? 0) > 0)
  )

  // Gas stats
  const gasVals = rows.map(r => r['Gas'] ?? 0).filter(v => v > 0)
  const avgGas  = gasVals.length ? Math.round(gasVals.reduce((a, b) => a + b, 0) / gasVals.length * 10) / 10 : null
  const maxGas  = gasVals.length ? Math.max(...gasVals) : null
  const recentGas = rows[rows.length - 1]?.['Gas'] ?? null

  return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
            Price Setter by Fuel Type · {region}
          </h3>
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
            % of dispatch intervals
          </span>
        </div>
      </div>

      {/* Gas stat pills */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Recent gas share', value: recentGas != null ? `${recentGas}%` : '—' },
          { label: 'Avg gas share',    value: avgGas    != null ? `${avgGas}%`    : '—' },
          { label: 'Peak gas share',   value: maxGas    != null ? `${maxGas}%`    : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            padding: '0.35rem 0.7rem', background: 'var(--bg)',
            border: `1px solid var(--border)`,
            borderLeft: `3px solid ${FUEL_COLOURS['Gas']}`,
            borderRadius: 5,
          }}>
            <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.58rem', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-data)', fontSize: '1rem', fontWeight: 700,
              color: FUEL_COLOURS['Gas'] }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.9rem', marginBottom: '0.75rem' }}>
        {presentFuels.map(fg => (
          <span key={fg} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text)' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2,
              background: FUEL_COLOURS[fg] ?? '#999' }} />
            {fg}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            interval={Math.max(0, Math.floor(rows.length / 10) - 1)} />
          <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            domain={[0, 100]} tickFormatter={v => `${v}%`} width={32} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
            formatter={(v: any, name: string) => [`${v}%`, name]}
            labelFormatter={label => `${label} · ${rows.find(r => r.date === label)?.total ?? 0} intervals`}
          />
          {presentFuels.map((fg, i) => (
            <Bar key={fg} dataKey={fg} stackId="a" fill={FUEL_COLOURS[fg] ?? '#999'}
              radius={i === presentFuels.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Gas DUID breakdown ─────────────────────────────────────────────────────────
function GasDuidChart({ regionData, region }: { regionData: RegionData; region: string }) {
  const duids = Object.entries(regionData.byGasDuid)
    .filter(([, v]) => v.intervals.some(x => x != null && x > 0))
    .sort(([, a], [, b]) => {
      const sumA = a.intervals.reduce((s: number, v) => s + (v ?? 0), 0)
      const sumB = b.intervals.reduce((s: number, v) => s + (v ?? 0), 0)
      return sumB - sumA
    })

  const rows = useMemo(() => {
    return regionData.dates.map((date, i) => {
      const total = regionData.totalIntervals[i] ?? 0
      const row: Record<string, any> = { date: fmtDate(date), total }
      for (const [duid, { intervals }] of duids) {
        const count = intervals[i] ?? 0
        row[duid] = total > 0 ? Math.round(count / total * 1000) / 10 : 0
      }
      return row
    })
  }, [regionData, duids])

  if (duids.length === 0) return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem', margin: 0 }}>
        No gas price setter activity in {region} for this period.
      </p>
    </div>
  )

  return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
          Gas Price Setters by Unit · {region}
        </h3>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
          % of dispatch intervals
        </span>
      </div>

      {/* DUID summary table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.4rem', marginBottom: '1rem' }}>
        {duids.slice(0, 8).map(([duid, { intervals, name }], i) => {
          const total = intervals.reduce((s, v) => s + (v ?? 0), 0)
          const recent = intervals[intervals.length - 1] ?? null
          const recentTotal = regionData.totalIntervals[regionData.totalIntervals.length - 1] ?? 0
          const recentPct = recent != null && recentTotal > 0 ? Math.round(recent / recentTotal * 1000) / 10 : null
          return (
            <div key={duid} style={{
              padding: '0.4rem 0.6rem', background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${GAS_DUID_PALETTE[i % GAS_DUID_PALETTE.length]}`,
              borderRadius: 5,
            }}>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', fontWeight: 700,
                color: GAS_DUID_PALETTE[i % GAS_DUID_PALETTE.length] }}>{duid}</div>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)',
                marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
              </div>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.75rem', color: 'var(--text)' }}>
                {total} intervals total
              </div>
              {recentPct != null && (
                <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)' }}>
                  {recentPct}% most recent day
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.9rem', marginBottom: '0.75rem' }}>
        {duids.slice(0, 8).map(([duid, { name }], i) => (
          <span key={duid} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text)' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2,
              background: GAS_DUID_PALETTE[i % GAS_DUID_PALETTE.length] }} />
            {duid}
            <span style={{ color: 'var(--muted)', fontSize: '0.58rem' }}>({name.split(' ').slice(-1)[0]})</span>
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            interval={Math.max(0, Math.floor(rows.length / 10) - 1)} />
          <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickFormatter={v => `${v}%`} width={32} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
            formatter={(v: any, name: string) => [`${v}%`, name]}
          />
          {duids.slice(0, 8).map(([duid], i) => (
            <Bar key={duid} dataKey={duid} stackId="a"
              fill={GAS_DUID_PALETTE[i % GAS_DUID_PALETTE.length]}
              radius={i === Math.min(duids.length, 8) - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Region section ─────────────────────────────────────────────────────────────
function RegionSection({ region, data }: { region: string; data: RegionData }) {
  const REGION_COLOURS: Record<string, string> = {
    NSW: '#0071E3', VIC: '#30C254', QLD: '#FF9F0A', SA: '#AF52DE'
  }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%',
          background: REGION_COLOURS[region] ?? 'var(--accent)',
          boxShadow: `0 0 6px ${REGION_COLOURS[region] ?? 'var(--accent)'}` }} />
        <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', margin: 0 }}>
          {{ NSW:'New South Wales', VIC:'Victoria', QLD:'Queensland', SA:'South Australia' }[region] ?? region}
        </h2>
      </div>
      <FuelShareChart regionData={data} region={region} />
      <GasDuidChart  regionData={data} region={region} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PriceSetterDashboard() {
  const [data,    setData]    = useState<Record<string, RegionData> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [region,  setRegion]  = useState<string>('NSW')

  useEffect(() => {
    fetch('/api/pricesetter')
      .then(r => r.json())
      .then(j => {
        if (j.ok) setData(j.data)
        else setError(j.error ?? 'Unknown error')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-data)',
      fontSize: '0.75rem', color: 'var(--muted)' }}>
      Loading price setter data… (fetching last 14 days)
    </div>
  )

  if (error) return (
    <div style={{ padding: '2rem', color: 'var(--negative)', fontFamily: 'var(--font-data)' }}>
      Error: {error}
    </div>
  )

  if (!data) return null

  const regionData = data[region]

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>NEM Price Setter Analysis</h2>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)',
          fontSize: '0.65rem', marginTop: '0.25rem' }}>
          Which fuel type &amp; unit set the dispatch price each interval · AEMO Public_Prices · last 14 days
        </div>
      </div>

      {/* Explainer */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem',
        fontFamily: 'var(--font-data)', fontSize: '0.7rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
        <strong>How to read this:</strong> In each 5-minute dispatch interval, AEMO's NEMDE solver identifies which
        unit&apos;s offer band set the marginal price for each region. A unit with a positive <em>Increase</em> factor
        is &quot;price setting&quot; — it is the marginal generator whose cost determines the spot price.
        Gas generators setting the price indicates they are the highest-cost unit needed to meet demand.
      </div>

      {/* Region tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {REGIONS.map(r => {
          const active = r === region
          return (
            <button key={r} onClick={() => setRegion(r)} style={{
              padding: '0.4rem 1rem', border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--accent)' : 'var(--muted)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}>{r}</button>
          )
        })}
      </div>

      {regionData ? (
        <RegionSection region={region} data={regionData} />
      ) : (
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
          No data available for {region}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
        fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)' }}>
        Source: AEMO NEMWeb Public_Prices · DISPATCH_PRICE_SETTER table · nemweb.com.au
      </div>
    </div>
  )
}
