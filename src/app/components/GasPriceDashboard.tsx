'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area
} from 'recharts'
import type { DwgmDay, SttmDay, SttmHub } from '@/lib/gasPriceData'

// ── Colours ───────────────────────────────────────────────────────────────────
const DWGM_COLOUR  = '#0071E3'   // Apple blue for DWGM weighted avg
const BOD_COLOUR   = '#5AC8FA'   // Apple light blue — scheduled prices
const HILIGHT_CLR  = '#FF375F'   // Apple red — GBB most-recent date
const STTM_HUB_COLOURS: Record<SttmHub, string> = {
  SYD: '#FF9F0A',   // Apple amber — Sydney
  BRI: '#FF6B35',   // vivid orange — Brisbane
  ADE: '#AF52DE',   // Apple purple — Adelaide
}
const STTM_HUB_LABELS: Record<SttmHub, string> = {
  SYD: 'Sydney',
  BRI: 'Brisbane',
  ADE: 'Adelaide',
}

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

      {/* HTML legend — in normal doc flow, never overlaps */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem 1rem', padding:'0.5rem 0', marginBottom:'0.5rem', borderBottom:'1px solid var(--border)' }}>
        {([
          { label:'Wtd Avg', colour: DWGM_COLOUR, dash: false },
          { label:'BOD',     colour: BOD_COLOUR,  dash: true  },
          { label:'10am',    colour: BOD_COLOUR,  dash: true  },
          { label:'2pm',     colour: BOD_COLOUR,  dash: true  },
          { label:'6pm',     colour: BOD_COLOUR,  dash: true  },
          { label:'10pm',    colour: BOD_COLOUR,  dash: true  },
        ] as const).map(({ label, colour, dash }) => (
          <span key={label} style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'#333' }}>
            <span style={{ display:'inline-block', width:20, height:2,
              background: dash ? 'transparent' : colour,
              borderTop: dash ? `2px dashed ${colour}` : 'none',
              flexShrink:0 }} />
            {label}
          </span>
        ))}
      </div>
      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label"
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#555' }}
            tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis domain={[minP, maxP]}
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#555' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={v => `$${v}`} />
          <Tooltip content={<PriceTooltip />} />

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

// ── STTM Hub Panel (Sydney / Brisbane / Adelaide) ─────────────────────────────
function SttmPanel({ sttm, hub, gbbDate }: { sttm: SttmDay[]; hub: SttmHub; gbbDate: string }) {
  const colour  = STTM_HUB_COLOURS[hub]
  const hubName = STTM_HUB_LABELS[hub]
  const latest  = sttm[sttm.length - 1]
  const gbbRow  = sttm.find(d => d.gasDate === gbbDate)

  const chartData = sttm.map(d => ({
    label:   d.label,
    gasDate: d.gasDate,
    'Ex-Post Price': d.price,
  }))

  const allPrices = sttm.map(d => d.price).filter((v): v is number => v !== null)
  const minP = allPrices.length ? Math.floor(Math.min(...allPrices) - 0.5) : 0
  const maxP = allPrices.length ? Math.ceil(Math.max(...allPrices) + 0.5)  : 20

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#111009' }}>
          STTM — {hubName} Hub
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
            colour={colour}
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

      {/* HTML legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem 1rem', padding:'0.5rem 0', marginBottom:'0.5rem', borderBottom:'1px solid var(--border)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'#333' }}>
          <span style={{ display:'inline-block', width:20, height:3, background:colour, borderRadius:2, flexShrink:0 }} />
          Ex-Post Price
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label"
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#555' }}
            tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis domain={[minP, maxP]}
            tick={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: '#555' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={v => `$${v}`} />
          <Tooltip content={<PriceTooltip />} />
          <Area dataKey="Ex-Post Price" type="monotone"
            stroke={colour} strokeWidth={2.5}
            fill={colour} fillOpacity={0.12}
            dot={{ r: 4, fill: colour }} name="Ex-Post Price" />
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
// ── Transactions hook ──────────────────────────────────────────────────────────
let txCache: { data: any; fetchedAt: number } | null = null

function useTransactions() {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (txCache && Date.now() - txCache.fetchedAt < 60 * 60 * 1000) {
      setData(txCache.data); return
    }
    setLoading(true)
    fetch('/api/gastransactions')
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error)
        txCache = { data: j.data, fetchedAt: Date.now() }
        setData(j.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}

// ── Shared table styles ────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: '0.6rem', fontWeight: 700,
  color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  padding: '0.4rem 0.6rem', textAlign: 'left', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
  position: 'sticky', top: 0,
}
const TD: React.CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: '0.68rem', color: 'var(--text)',
  padding: '0.35rem 0.6rem', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const STATE_COLOURS: Record<string, string> = {
  NSW: '#0071E3', VIC: '#30C254', QLD: '#FF9F0A', SA: '#AF52DE',
  TAS: '#5AC8FA', NT: '#FF6B35',
}

function StateBadge({ state }: { state: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4,
      fontFamily: 'var(--font-data)', fontSize: '0.6rem', fontWeight: 700,
      background: STATE_COLOURS[state] ?? '#888', color: '#fff',
      letterSpacing: '0.03em',
    }}>{state}</span>
  )
}

// ── Normalise a row to a display-friendly key→value list ─────────────────────
function normaliseKeys(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_state') continue
    const pretty = k.replace(/_/g, ' ').replace(/\w/g, c => c.toUpperCase())
    out[pretty] = v
  }
  return out
}

// ── Generic transaction table ─────────────────────────────────────────────────
function TxTable({ rows, stateCol }: { rows: Record<string,string>[]; stateCol?: boolean }) {
  const [filter, setFilter] = useState<string>('ALL')
  const states = useMemo(() => {
    const s = new Set(rows.map(r => r._state).filter(Boolean))
    return ['ALL', ...Array.from(s).sort()]
  }, [rows])

  const visible = useMemo(() =>
    filter === 'ALL' ? rows : rows.filter(r => r._state === filter),
    [rows, filter]
  )

  if (!rows.length) return (
    <div style={{ padding: '1.5rem', color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.72rem', textAlign: 'center' }}>
      No data available
    </div>
  )

  // Build display columns from first row (excluding _state)
  const firstRow = normaliseKeys(rows[0])
  const cols = Object.keys(firstRow)

  return (
    <div>
      {stateCol && states.length > 2 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {states.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '0.2rem 0.55rem', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-data)', fontSize: '0.65rem', fontWeight: s === filter ? 700 : 400,
              background: s === filter ? (STATE_COLOURS[s] ?? 'var(--accent)') : 'var(--surface-2)',
              color: s === filter ? '#fff' : 'var(--muted)',
              transition: 'all 0.12s',
            }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ maxHeight: 340, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {stateCol && <th style={TH}>State</th>}
              {cols.map(c => <th key={c} style={TH}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const display = normaliseKeys(row)
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                  {stateCol && <td style={TD}><StateBadge state={row._state ?? ''} /></td>}
                  {cols.map(c => <td key={c} style={TD}>{display[c] ?? ''}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '0.4rem', fontFamily: 'var(--font-data)', fontSize: '0.58rem', color: 'var(--muted)' }}>
        {visible.length} transaction{visible.length !== 1 ? 's' : ''}
        {filter !== 'ALL' ? ` in ${filter}` : ''}
      </div>
    </div>
  )
}

// ── Transactions panel ────────────────────────────────────────────────────────
function TransactionsPanel() {
  const { data, loading, error } = useTransactions()
  const [tab, setTab] = useState<'shortterm' | 'swaps' | 'lng'>('shortterm')

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'shortterm', label: 'Short-Term Transactions' },
    { key: 'swaps',     label: 'Swap Transactions' },
    { key: 'lng',       label: 'LNG Transactions' },
  ]

  return (
    <div className="sq-card" style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', margin: '0 0 0.25rem' }}>
          Recent Gas Transactions
        </h3>
        <p style={{ margin: 0, fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)' }}>
          AEMO Gas Bulletin Board · nemweb.com.au
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '0.4rem 1rem', border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
            fontWeight: t.key === tab ? 600 : 400,
            color: t.key === tab ? 'var(--accent)' : 'var(--muted)',
            borderBottom: t.key === tab ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}>
          Loading transactions…
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--negative)', fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}>
          Error: {error}
        </div>
      )}
      {data && !loading && (
        <>
          {tab === 'shortterm' && <TxTable rows={data.shortTerm ?? []} stateCol />}
          {tab === 'swaps'     && <TxTable rows={data.swaps     ?? []} stateCol />}
          {tab === 'lng'       && <TxTable rows={data.lng       ?? []} stateCol={false} />}
        </>
      )}
    </div>
  )
}


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
  const sttmBri: SttmDay[] = data?.sttmBri ?? []
  const sttmAde: SttmDay[] = data?.sttmAde ?? []

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
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:'1rem' }}>
              <div className="sq-card" style={{ padding: '1.5rem' }}>
                <SttmPanel sttm={sttmSyd} hub="SYD" gbbDate={effectiveGbbDate} />
              </div>
              <div className="sq-card" style={{ padding: '1.5rem' }}>
                <SttmPanel sttm={sttmBri} hub="BRI" gbbDate={effectiveGbbDate} />
              </div>
              <div className="sq-card" style={{ padding: '1.5rem' }}>
                <SttmPanel sttm={sttmAde} hub="ADE" gbbDate={effectiveGbbDate} />
              </div>
            </div>

            <TransactionsPanel />

            <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: '#5A5448' }}>
              DWGM: {dwgm[0]?.label} – {dwgm[dwgm.length-1]?.label} ({dwgm.length} days) ·
              STTM Syd: {sttmSyd[0]?.label} – {sttmSyd[sttmSyd.length-1]?.label} ({sttmSyd.length} days) ·
              STTM Bri: {sttmBri[0]?.label} – {sttmBri[sttmBri.length-1]?.label} ({sttmBri.length} days) ·
              STTM Ade: {sttmAde[0]?.label} – {sttmAde[sttmAde.length-1]?.label} ({sttmAde.length} days)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
