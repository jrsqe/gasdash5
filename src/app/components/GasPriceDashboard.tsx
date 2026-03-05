'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area
} from 'recharts'
import type { DwgmDay, SttmDay } from '@/lib/gasPriceData'

// ── Colours ───────────────────────────────────────────────────────────────────
const DWGM_COLOUR  = '#1B5E7B'   // teal-blue for DWGM weighted avg
const BOD_COLOUR   = '#5590B8'   // scheduled prices — readable but distinct from weighted avg
const STTM_COLOUR  = '#8B6914'   // amber for STTM Sydney
const HILIGHT_CLR  = '#C0334A'   // red reference line for GBB most-recent date

// ── Data hook ─────────────────────────────────────────────────────────────────
let priceCache: { data: any; fetchedAt: number } | null = null
const CACHE_TTL = 60 * 60 * 1000

function useGasPrices() {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force && priceCache && Date.now() - priceCache.fetchedAt < CACHE_TTL) {
      setData(priceCache.data); setFetchedAt(priceCache.fetchedAt); return
    }
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/gasprices')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      priceCache = { data: json.data, fetchedAt: Date.now() }
      setData(json.data); setFetchedAt(Date.now())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  return { data, loading, error, fetchedAt, load }
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function PriceTooltip({ active, payload, label, unit = '$/GJ' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '0.65rem 0.85rem',
      fontFamily: 'var(--font-data)', fontSize: '0.72rem',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 160,
    }}>
      <div style={{ fontWeight: 700, color: '#111009', marginBottom: '0.4rem' }}>{label}</div>
      {payload.map((p: any) => p.value != null && (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ color: '#2D2920' }}>{p.name}</span>
          </span>
          <span style={{ fontWeight: 600, color: '#111009' }}>
            ${p.value.toFixed(4)} {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour?: string }) {
  return (
    <div className="sq-stat" style={{ borderLeft: `3px solid ${colour ?? 'var(--accent)'}` }}>
      <div className="sq-stat-label">{label}</div>
      <div className="sq-stat-value" style={{ color: colour ?? 'var(--text)' }}>{value}</div>
      {sub && <div className="sq-stat-sub">{sub}</div>}
    </div>
  )
}

// ── DWGM Panel ────────────────────────────────────────────────────────────────
function DwgmPanel({ dwgm, gbbDate }: { dwgm: DwgmDay[]; gbbDate: string }) {
  const latest = dwgm[dwgm.length - 1]
  const gbbRow = dwgm.find(d => d.gasDate === gbbDate)

  // Build chart rows — show scheduled prices as individual dots + weighted avg as line
  const chartData = dwgm.map(d => ({
    label:  d.label,
    gasDate: d.gasDate,
    'Wtd Avg':  d.wdAvg,
    'BOD':      d.bod,
    '10am':     d.am10,
    '2pm':      d.pm2,
    '6pm':      d.pm6,
    '10pm':     d.pm10,
  }))

  // Price range for axis
  const allPrices = dwgm.flatMap(d => [d.wdAvg, d.bod, d.am10, d.pm2, d.pm6, d.pm10]).filter((v): v is number => v !== null)
  const minP = Math.floor(Math.min(...allPrices) - 0.5)
  const maxP = Math.ceil(Math.max(...allPrices) + 0.5)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#111009' }}>
          DWGM — Victorian Declared Wholesale Gas Market
        </h3>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: '#5A5448' }}>
          $/GJ · GST exclusive
        </span>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {latest && (
          <StatCard
            label={`Latest (${latest.label})`}
            value={`$${latest.wdAvg?.toFixed(4) ?? '—'}`}
            sub="Wtd avg imbalance price"
            colour={DWGM_COLOUR}
          />
        )}
        {gbbRow && gbbRow.gasDate !== latest?.gasDate && (
          <StatCard
            label={`GBB date (${gbbRow.label})`}
            value={`$${gbbRow.wdAvg?.toFixed(4) ?? '—'}`}
            sub="Wtd avg imbalance price"
            colour={HILIGHT_CLR}
          />
        )}
        {gbbRow && (
          <>
            <StatCard label="BOD" value={`$${gbbRow.bod?.toFixed(4) ?? '—'}`} sub={gbbRow.label} colour={BOD_COLOUR} />
            <StatCard label="10am" value={`$${gbbRow.am10?.toFixed(4) ?? '—'}`} sub={gbbRow.label} colour={BOD_COLOUR} />
            <StatCard label="2pm" value={`$${gbbRow.pm2?.toFixed(4) ?? '—'}`} sub={gbbRow.label} colour={BOD_COLOUR} />
            <StatCard label="6pm" value={`$${gbbRow.pm6?.toFixed(4) ?? '—'}`} sub={gbbRow.label} colour={BOD_COLOUR} />
            <StatCard label="10pm" value={`$${gbbRow.pm10?.toFixed(4) ?? '—'}`} sub={gbbRow.label} colour={BOD_COLOUR} />
          </>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 40, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label"
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#5A5448' }}
            tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis domain={[minP, maxP]}
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#5A5448' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={v => `$${v}`} />
          <Tooltip content={<PriceTooltip />} />
          <Legend verticalAlign="top" align="left" wrapperStyle={{ fontFamily: 'var(--font-data)', fontSize: '0.68rem', color: '#2D2920', paddingBottom: '0.5rem' }} />

          {/* Scheduled price dots */}
          <Line dataKey="BOD"  type="monotone" stroke={BOD_COLOUR} strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" name="BOD" />
          <Line dataKey="10am" type="monotone" stroke={BOD_COLOUR} strokeWidth={1}   dot={{ r: 2 }} strokeDasharray="2 2" name="10am" />
          <Line dataKey="2pm"  type="monotone" stroke={BOD_COLOUR} strokeWidth={1}   dot={{ r: 2 }} strokeDasharray="2 2" name="2pm" />
          <Line dataKey="6pm"  type="monotone" stroke={BOD_COLOUR} strokeWidth={1}   dot={{ r: 2 }} strokeDasharray="2 2" name="6pm" />
          <Line dataKey="10pm" type="monotone" stroke={BOD_COLOUR} strokeWidth={1}   dot={{ r: 2 }} strokeDasharray="2 2" name="10pm" />
          {/* Weighted average — bold headline */}
          <Line dataKey="Wtd Avg" type="monotone" stroke={DWGM_COLOUR} strokeWidth={2.5} dot={{ r: 4, fill: DWGM_COLOUR }} name="Wtd Avg" />

          {/* GBB most-recent date highlight */}
          {gbbRow && (
            <ReferenceLine x={gbbRow.label} stroke={HILIGHT_CLR} strokeWidth={2} strokeDasharray="4 2"
              label={{ value: 'GBB', position: 'top', fontSize: 9, fill: HILIGHT_CLR, fontFamily: 'var(--font-data)' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── STTM Sydney Panel ─────────────────────────────────────────────────────────
function SttmPanel({ sttm, gbbDate }: { sttm: SttmDay[]; gbbDate: string }) {
  const latest = sttm[sttm.length - 1]
  const gbbRow = sttm.find(d => d.gasDate === gbbDate)

  const chartData = sttm.map(d => ({
    label:   d.label,
    gasDate: d.gasDate,
    'Ex-Post Price': d.price,
  }))

  const allPrices = sttm.map(d => d.price).filter((v): v is number => v !== null)
  const minP = Math.floor(Math.min(...allPrices) - 0.5)
  const maxP = Math.ceil(Math.max(...allPrices) + 0.5)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#111009' }}>
          STTM — Sydney Hub
        </h3>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: '#5A5448' }}>
          Ex-post imbalance price · $/GJ · GST exclusive
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {latest && (
          <StatCard
            label={`Latest (${latest.label})`}
            value={`$${latest.price?.toFixed(4) ?? '—'}`}
            sub="Ex-post imbalance price"
            colour={STTM_COLOUR}
          />
        )}
        {gbbRow && (
          <StatCard
            label={`GBB date (${gbbRow.label})`}
            value={`$${gbbRow.price?.toFixed(4) ?? '—'}`}
            sub="Ex-post imbalance price"
            colour={HILIGHT_CLR}
          />
        )}

      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 40, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label"
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#5A5448' }}
            tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis domain={[minP, maxP]}
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#5A5448' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={v => `$${v}`} />
          <Tooltip content={<PriceTooltip />} />
          <Legend verticalAlign="top" align="left" wrapperStyle={{ fontFamily: 'var(--font-data)', fontSize: '0.68rem', color: '#2D2920', paddingBottom: '0.5rem' }} />
          <Area dataKey="Ex-Post Price" type="monotone"
            stroke={STTM_COLOUR} strokeWidth={2.5}
            fill={STTM_COLOUR} fillOpacity={0.12}
            dot={{ r: 4, fill: STTM_COLOUR }} name="Ex-Post Price" />
          {gbbRow && (
            <ReferenceLine x={gbbRow.label} stroke={HILIGHT_CLR} strokeWidth={2} strokeDasharray="4 2"
              label={{ value: 'GBB', position: 'top', fontSize: 9, fill: HILIGHT_CLR, fontFamily: 'var(--font-data)' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function GasPriceDashboard({ gbbMostRecentDate }: { gbbMostRecentDate?: string }) {
  const { data, loading, error, fetchedAt, load } = useGasPrices()
  const [gbbDate, setGbbDate] = useState(gbbMostRecentDate ?? '')

  useEffect(() => {
    load()
    // Fetch GBB most-recent date if not passed in
    if (!gbbMostRecentDate) {
      fetch('/api/gbb').then(r => r.json()).then(j => {
        const dates: string[] = j?.data?.dates ?? []
        if (dates.length) setGbbDate(dates[dates.length - 1])
      }).catch(() => {})
    }
  }, [])

  const lastFetched = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    : null

  const dwgm:    DwgmDay[] = data?.dwgm    ?? []
  const sttmSyd: SttmDay[] = data?.sttmSyd ?? []

  // Use state gbbDate (set from GBB API) or fallback to latest DWGM date
  const effectiveGbbDate = gbbDate || data?.latestDwgmDate || ''

  return (
    <div>
      {/* Sub-header */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0.6rem 1.75rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: '#5A5448' }}>
          {effectiveGbbDate && <>GBB most recent gas date: <strong style={{ color: '#111009' }}>
            {dwgm.find(d => d.gasDate === effectiveGbbDate)?.label ?? effectiveGbbDate}
          </strong> — highlighted with red dashed line</>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {lastFetched && (
            <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: '#5A5448' }}>
              Updated {lastFetched}
            </span>
          )}
          <button onClick={() => load(true)} disabled={loading} style={{
            padding: '0.3rem 0.75rem', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', background: 'transparent',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: '0.72rem', color: '#5A5448',
          }}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        {error ? (
          <div style={{ color: '#B02A3E', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            Error loading price data: {error}
          </div>
        ) : loading && !data ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#5A5448', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            Fetching gas price data…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="sq-card" style={{ padding: '1.5rem' }}>
              <DwgmPanel dwgm={dwgm} gbbDate={effectiveGbbDate} />
            </div>
            <div className="sq-card" style={{ padding: '1.5rem' }}>
              <SttmPanel sttm={sttmSyd} gbbDate={effectiveGbbDate} />
            </div>

            <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: '#5A5448' }}>
              DWGM: {dwgm[0]?.label} – {dwgm[dwgm.length-1]?.label} ({dwgm.length} days) ·
              STTM Sydney: {sttmSyd[0]?.label} – {sttmSyd[sttmSyd.length-1]?.label} ({sttmSyd.length} days)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
