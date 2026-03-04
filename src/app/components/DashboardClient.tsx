'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useElecData } from './MainDashboard'

type IntervalOption  = '5m' | '1h' | '1d'
type DateRangeOption = 'default' | '7d' | '3d' | '1d'

const FACILITY_COLOURS = [
  '#00B4A0','#3DDC84','#FF6B35','#7B9FF9','#E8425A',
  '#00D4FF','#A8E063','#FFB347','#CF9FFF','#FF6B9D',
  '#4ECDC4','#45B7D1','#96CEB4',
]
const PRICE_COLOUR = '#FF6B35'

function rowToMs(dt: string) {
  return new Date(dt.replace(' ', 'T') + ':00+10:00').getTime()
}

function filterRows(rows: Record<string,any>[], dateRange: DateRangeOption) {
  if (dateRange === 'default' || rows.length === 0) return rows
  const days    = dateRange === '7d' ? 7 : dateRange === '3d' ? 3 : 1
  const lastMs  = rowToMs(rows[rows.length - 1].datetime)
  const startMs = lastMs - days * 86400000
  return rows.filter(r => rowToMs(r.datetime) >= startMs)
}

function computeSummary(rows: Record<string,any>[], facilities: string[]) {
  const pv  = rows.map(r => r.price).filter((v): v is number => v != null)
  const tg  = rows.map(r => facilities.reduce((s, f) => s + (r[f] ?? 0), 0)).filter(v => v > 0)
  return {
    avgPrice:    pv.length ? pv.reduce((a,b) => a+b, 0) / pv.length : null,
    maxPrice:    pv.length ? Math.max(...pv) : null,
    minPrice:    pv.length ? Math.min(...pv) : null,
    avgTotalGen: tg.length ? tg.reduce((a,b) => a+b, 0) / tg.length : null,
    peakTotalGen:tg.length ? Math.max(...tg) : null,
    facilityCount: facilities.length,
  }
}

const fmt = (v: number|null, d=0) =>
  v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtP = (v: number|null) => v == null ? '—' : `$${fmt(v,2)}`


function downloadCsv(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const csv  = [cols.join(','), ...rows.map(r => cols.map(c => r[c] ?? '').join(','))].join('\n')
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Download CSV" style={{
      display: 'flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.25rem 0.65rem', borderRadius: 6,
      border: '1px solid var(--sq-border)', background: 'var(--sq-surface-2)',
      color: 'var(--sq-muted)', cursor: 'pointer',
      fontFamily: 'var(--font-data)', fontSize: '0.65rem', fontWeight: 500,
      transition: 'border-color 0.15s, color 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--sq-teal)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--sq-teal)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--sq-border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--sq-muted)' }}
    >
      ↓ CSV
    </button>
  )
}

function tickFmt(val: string) {
  if (!val) return ''
  const [date, time] = val.split(' ')
  if (!date || !time) return val
  const [yyyy,mm,dd] = date.split('-')
  const yy = yyyy?.slice(2) ?? ''
  return `${dd}/${mm}/${yy} ${time}`
}

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function SqTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--sq-surface)', border: '1px solid var(--sq-border)',
      borderRadius: 8, padding: '0.65rem 0.9rem',
      boxShadow: '0 4px 16px rgba(13,27,42,0.12)',
      fontFamily: 'var(--font-data)', fontSize: '0.75rem',
      minWidth: 200,
    }}>
      <div style={{ color: 'var(--sq-muted)', marginBottom: '0.4rem', fontSize: '0.65rem', letterSpacing: '0.04em' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.25rem', marginBottom: 2 }}>
          <span style={{ color: p.color ?? p.fill }}>{p.name}</span>
          <span style={{ color: 'var(--sq-text)', fontWeight: 600 }}>
            {p.name === 'Spot Price ($/MWh)' ? `$${Number(p.value).toFixed(2)}` : `${Number(p.value).toFixed(1)} MW`}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="sq-stat">
      <div className="sq-stat-label">{label}</div>
      <div className="sq-stat-value">{value}</div>
      {sub && <div className="sq-stat-sub">{sub}</div>}
    </div>
  )
}

function PillGroup<T extends string>({
  label, options, value, onChange, disabled = false,
}: { label: string; options: {value:T; label:string}[]; value: T; onChange:(v:T)=>void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {label && <span style={{ color: 'var(--sq-muted)', fontSize: '0.65rem', fontFamily: 'var(--font-data)', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>}
      <div style={{ display: 'flex', background: 'var(--sq-surface-2)', border: '1px solid var(--sq-border)', borderRadius: 8, padding: 2, gap: 2 }}>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button key={opt.value} onClick={() => !disabled && onChange(opt.value)} disabled={disabled} style={{
              padding: '0.28rem 0.7rem', borderRadius: 6, border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: '0.75rem', fontWeight: active ? 600 : 400,
              background: active ? 'var(--sq-teal)' : 'transparent',
              color: active ? '#fff' : 'var(--sq-muted)',
              transition: 'all 0.15s', opacity: disabled ? 0.4 : 1,
            }}>{opt.label}</button>
          )
        })}
      </div>
    </div>
  )
}

function WindowSlider({ totalRows, windowSize, windowEnd, onChange, firstLabel, lastLabel, windowStartLabel, windowEndLabel }: any) {
  if (totalRows === 0 || windowSize >= totalRows) return null
  const min = windowSize - 1, max = totalRows - 1
  return (
    <div style={{ marginTop: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--sq-muted)' }}>{firstLabel}</span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.68rem', color: 'var(--sq-teal)', background: 'var(--sq-surface-2)', border: '1px solid var(--sq-border)', padding: '1px 8px', borderRadius: 5, fontWeight: 600 }}>
          {windowStartLabel} → {windowEndLabel}
        </span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--sq-muted)' }}>{lastLabel}</span>
      </div>
      <div style={{ position: 'relative', height: 24, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: 'var(--sq-surface-2)', border: '1px solid var(--sq-border)', borderRadius: 2 }} />
        <div style={{
          position: 'absolute',
          left:  `${((windowEnd - windowSize + 1) / (totalRows - 1)) * 100}%`,
          right: `${((totalRows - 1 - windowEnd) / (totalRows - 1)) * 100}%`,
          height: 4, background: 'var(--sq-teal)', borderRadius: 2, opacity: 0.8, transition: 'left 0.08s, right 0.08s',
        }} />
        <input type="range" min={min} max={max} value={windowEnd} onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', left: 0, right: 0, width: '100%', opacity: 0, cursor: 'pointer', height: 24, margin: 0 }} />
        <div style={{
          position: 'absolute', left: `calc(${((windowEnd - min) / (max - min)) * 100}% - 7px)`,
          width: 14, height: 14, borderRadius: '50%',
          background: 'var(--sq-surface)', border: '2px solid var(--sq-teal)',
          boxShadow: '0 0 6px var(--sq-teal-glow)', pointerEvents: 'none', transition: 'left 0.08s',
        }} />
      </div>
    </div>
  )
}

// ── Region panel ───────────────────────────────────────────────────────────────
function RegionPanel({ region, data, dateRange, onDateRangeChange }: {
  region: 'NSW'|'VIC'; data: any; dateRange: DateRangeOption; onDateRangeChange: (v: DateRangeOption) => void
}) {
  const [showTable, setShowTable] = useState(false)
  const { facilities, rows } = data

  const windowSize = useMemo(() => {
    if (dateRange === 'default' || rows.length === 0) return rows.length
    const days = dateRange === '7d' ? 7 : dateRange === '3d' ? 3 : 1
    const totalMs = rowToMs(rows[rows.length-1].datetime) - rowToMs(rows[0].datetime)
    const msPerRow = totalMs / (rows.length - 1 || 1)
    return Math.max(1, Math.round((days * 86400000) / msPerRow))
  }, [dateRange, rows])

  const [windowEnd, setWindowEnd] = useState(rows.length - 1)
  useEffect(() => { setWindowEnd(rows.length - 1) }, [dateRange, rows])

  const visibleRows = useMemo(() => {
    if (dateRange === 'default') return rows
    return rows.slice(Math.max(0, windowEnd - windowSize + 1), windowEnd + 1)
  }, [rows, dateRange, windowSize, windowEnd])

  const summary = useMemo(() => computeSummary(visibleRows, facilities), [visibleRows, facilities])
  const chartRows = visibleRows.length > 500 ? visibleRows.filter((_: any, i: number) => i % 2 === 0) : visibleRows

  const fmtLabel = (d: string) => { const [,mm,dd] = d.split(' ')[0].split('-'); return `${dd}/${mm}` }

  const DATE_RANGE_OPTIONS: {value: DateRangeOption; label: string}[] = [
    { value:'default', label:'All' }, { value:'7d', label:'7d' },
    { value:'3d', label:'3d' }, { value:'1d', label:'1d' },
  ]

  const regionColour = region === 'NSW' ? '#7B9FF9' : 'var(--sq-teal)'

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: regionColour, boxShadow: `0 0 6px ${regionColour}` }} />
        <h2 style={{ fontSize:'1rem', fontWeight:700, color:'var(--sq-text)', margin:0, letterSpacing:'-0.01em' }}>
          {region === 'NSW' ? 'New South Wales' : 'Victoria'}
        </h2>
        <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.65rem', letterSpacing:'0.04em' }}>
          {summary.facilityCount} facilities · {visibleRows.length} intervals
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'0.6rem', marginBottom:'1.25rem' }}>
        <StatCard label="Avg Spot Price" value={fmtP(summary.avgPrice)} sub="$/MWh" />
        <StatCard label="Max Price" value={fmtP(summary.maxPrice)} sub="Peak" />
        <StatCard label="Min Price" value={fmtP(summary.minPrice)} sub="Floor" />
        <StatCard label="Avg Generation" value={`${fmt(summary.avgTotalGen)} MW`} sub="All facilities" />
        <StatCard label="Peak Generation" value={`${fmt(summary.peakTotalGen)} MW`} sub="Max interval" />
      </div>

      <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
            <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--sq-text)', margin:0 }}>Gas Generation by Facility</h3>
            <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.65rem' }}>avg MW per interval</span>
          </div>
          <CsvButton onClick={() => downloadCsv(visibleRows.map((r: any) => ({ datetime: r.datetime, price: r.price, ...Object.fromEntries(facilities.map((f: string) => [f, r[f]])) })), `generation-${region}-${interval}.csv`)} />
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartRows} margin={{ top:5, right:20, left:0, bottom:5 }}>
            <defs>
              {facilities.map((name: string, i: number) => (
                <linearGradient key={name} id={`elecGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={FACILITY_COLOURS[i % FACILITY_COLOURS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={FACILITY_COLOURS[i % FACILITY_COLOURS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--sq-border)" />
            <XAxis dataKey="datetime" tickFormatter={tickFmt}
              tick={{ fill:'var(--sq-muted)', fontSize:9, fontFamily:'var(--font-data)' }}
              tickLine={false} axisLine={{ stroke:'var(--sq-border)' }} interval="preserveStartEnd" />
            <YAxis yAxisId="gen"
              tick={{ fill:'var(--sq-muted)', fontSize:9, fontFamily:'var(--font-data)' }}
              tickLine={false} axisLine={false} width={54} tickFormatter={v => `${v} MW`} />
            <YAxis yAxisId="price" orientation="right"
              tick={{ fill: PRICE_COLOUR, fontSize:9, fontFamily:'var(--font-data)' }}
              tickLine={false} axisLine={false} width={58} tickFormatter={v => `$${v}`} />
            <Tooltip content={<SqTooltip />} />
            <Legend wrapperStyle={{ fontSize:'0.65rem', fontFamily:'var(--font-data)', paddingTop:'0.5rem', color:'var(--sq-text-2)' }} />
            {facilities.map((name: string, i: number) => (
              <Area key={name} yAxisId="gen" type="monotone" dataKey={name}
                stroke={FACILITY_COLOURS[i % FACILITY_COLOURS.length]} strokeWidth={1.5}
                fill={`url(#elecGrad${i})`} stackId="gen"
                dot={false} activeDot={{ r:3, strokeWidth:0 }} connectNulls />
            ))}
            <Line yAxisId="price" type="monotone" dataKey="price" name="Spot Price ($/MWh)"
              stroke={PRICE_COLOUR} strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} activeDot={{ r:3, strokeWidth:0 }} connectNulls />
          </AreaChart>
        </ResponsiveContainer>

        {/* Range controls below chart */}
        <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--sq-border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
          <PillGroup label="View" options={DATE_RANGE_OPTIONS} value={dateRange} onChange={onDateRangeChange} />
          {dateRange !== 'default' && rows.length > windowSize && (
            <WindowSlider
              totalRows={rows.length} windowSize={windowSize} windowEnd={windowEnd} onChange={setWindowEnd}
              firstLabel={rows.length > 0 ? fmtLabel(rows[0].datetime) : ''}
              lastLabel={rows.length > 0 ? fmtLabel(rows[rows.length-1].datetime) : ''}
              windowStartLabel={visibleRows.length > 0 ? fmtLabel(visibleRows[0].datetime) : ''}
              windowEndLabel={visibleRows.length > 0 ? fmtLabel(visibleRows[visibleRows.length-1].datetime) : ''}
            />
          )}
        </div>
      </div>

      {/* Data table */}
      <div className="sq-card" style={{ overflow:'hidden', marginBottom:'1rem' }}>
        <button onClick={() => setShowTable(v => !v)} style={{
          width:'100%', padding:'0.75rem 1.25rem', display:'flex',
          justifyContent:'space-between', alignItems:'center',
          background:'transparent', border:'none', cursor:'pointer',
        }}>
          <span style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--sq-text)' }}>Raw Data</span>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--sq-muted)' }}>
            {visibleRows.length} rows · {showTable ? '▲' : '▼'}
          </span>
        </button>
        {showTable && (
          <div style={{ maxHeight:320, overflowY:'auto', borderTop:'1px solid var(--sq-border)' }}>
            <table className="sq-table">
              <thead><tr>
                <th>Datetime</th><th>Price $/MWh</th>
                {facilities.map((f: string) => <th key={f}>{f}</th>)}
              </tr></thead>
              <tbody>
                {visibleRows.map((row: any, i: number) => (
                  <tr key={i}>
                    <td>{row.datetime}</td>
                    <td>{row.price != null ? `$${Number(row.price).toFixed(2)}` : '—'}</td>
                    {facilities.map((f: string) => <td key={f}>{row[f] != null ? Number(row[f]).toFixed(1) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main electricity dashboard ─────────────────────────────────────────────────
export default function DashboardClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const [activeTab,  setActiveTab]  = useState<'NSW'|'VIC'>('NSW')
  const [interval,   setInterval]   = useState<IntervalOption>('1h')
  const [dateRange,  setDateRange]  = useState<DateRangeOption>('default')
  const { payload, loading, error, fetchedAt, fetch: fetchData } = useElecData(interval)

  const INTERVAL_OPTIONS: {value: IntervalOption; label: string}[] = [
    { value:'5m', label:'5 min' }, { value:'1h', label:'1 hr' }, { value:'1d', label:'1 day' },
  ]

  useEffect(() => { fetchData(interval) }, [])

  const handleInterval = (iv: IntervalOption) => {
    setInterval(iv); setDateRange('default'); fetchData(iv, true)
  }

  const activeData = payload?.data?.[activeTab]
  const lastFetched = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' }) : null

  return (
    <div style={{ background:'var(--sq-bg)' }}>
      {/* Sub-header: region tabs + interval */}
      <div style={{
        background:'var(--sq-surface)', borderBottom:'1px solid var(--sq-border)',
        boxShadow:'0 1px 3px rgba(13,27,42,0.05)',
        padding:'0 1.75rem', display:'flex', alignItems:'center',
        justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem',
      }}>
        <div style={{ display:'flex' }}>
          {(['NSW','VIC'] as const).map(tab => {
            const isActive = activeTab === tab
            const colour   = tab === 'NSW' ? '#7B9FF9' : 'var(--sq-teal)'
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding:'0.75rem 1.25rem', border:'none', background:'transparent',
                cursor:'pointer', fontFamily:'var(--font-ui)', fontWeight: isActive ? 600 : 400,
                fontSize:'0.82rem', color: isActive ? colour : 'var(--sq-muted)',
                borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
                marginBottom:-1, transition:'all 0.15s',
              }}>{tab === 'NSW' ? 'New South Wales' : 'Victoria'}</button>
            )
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.4rem 0' }}>
          {lastFetched && !loading && (
            <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--sq-muted)' }}>
              Updated {lastFetched}
            </span>
          )}
          {loading && <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--sq-teal)' }}>Loading…</span>}
          <PillGroup label="Interval" options={INTERVAL_OPTIONS} value={interval} onChange={handleInterval} disabled={loading} />
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>
        {error ? (
          <div className="sq-card" style={{ padding:'1.5rem', maxWidth:480 }}>
            <div style={{ color:'var(--sq-red)', fontFamily:'var(--font-data)', fontSize:'0.75rem', marginBottom:'0.4rem', fontWeight:600 }}>ERROR</div>
            <div style={{ color:'var(--sq-text)', fontSize:'0.82rem' }}>{error}</div>
          </div>
        ) : loading && !payload ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'5rem 0', gap:'1rem' }}>
            <div style={{ width:32, height:32, border:'2px solid var(--sq-border)', borderTopColor:'var(--sq-teal)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Fetching generation data…</span>
            <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
          </div>
        ) : activeData ? (
          <div style={{ opacity: loading ? 0.5 : 1, transition:'opacity 0.2s' }}>
            <RegionPanel
              key={`${activeTab}-${interval}`}
              region={activeTab} data={activeData}
              dateRange={dateRange} onDateRangeChange={setDateRange}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
