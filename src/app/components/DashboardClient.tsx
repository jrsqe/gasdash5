'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ComposedChart, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useElecData } from './MainDashboard'

type IntervalOption  = '5m' | '1h' | '1d'
type DateRangeOption = 'default' | '7d' | '3d' | '1d'

const FACILITY_COLOURS = [
  '#1B5E7B','#E8632A','#2E7D4F','#7B3FA0','#B5880C',
  '#C0334A','#1A6B6B','#5C5FA8','#7A4F1E','#3D8B37',
  '#A0522D','#4A7FA5','#8B6914','#5D4E6D','#2D6E6E',
]
const PRICE_COLOUR = '#C0334A'

const FUEL_MIX_ORDER  = ['Coal','Gas','Wind','Solar','Battery','Imports'] as const
type FuelCategory = typeof FUEL_MIX_ORDER[number]
const FUEL_MIX_COLOURS: Record<FuelCategory, string> = {
  Coal:    '#5C5240',   // dark warm brown
  Gas:     '#1B5E7B',   // teal-blue (matches dashboard accent)
  Wind:    '#2E7D4F',   // forest green
  Solar:   '#B5880C',   // amber gold
  Battery: '#7B3FA0',   // purple
  Imports: '#C0334A',   // red
}


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
      border: '1px solid var(--border)', background: 'var(--surface-2)',
      color: 'var(--muted)', cursor: 'pointer',
      fontFamily: 'var(--font-data)', fontSize: '0.65rem', fontWeight: 500,
      transition: 'border-color 0.15s, color 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
    >
      ↓ CSV
    </button>
  )
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function tickFmt(val: string) {
  if (!val) return ''
  const [date, time] = val.split(' ')
  if (!date || !time) return val
  const [yyyy,mm,dd] = date.split('-')
  const yy = yyyy?.slice(2) ?? ''
  return `${dd}/${mm}/${yy} ${time}`
}

// Smart tick sampler for electricity datetime strings.
// For "all" view, samples ~8 evenly-spaced ticks and formats as "DD Mon YY".
// For shorter views, keeps recharts default behaviour (pass null ticks).
function elecSmartTicks(rows: any[], dateRange: string): {
  ticks: string[] | undefined
  formatter: (v: string) => string
} {
  if (dateRange !== 'default' || rows.length === 0) {
    // Short view: use existing tickFmt (date + time)
    return { ticks: undefined, formatter: tickFmt }
  }
  // "All" view: pick ~8 evenly-spaced rows, format as "DD Mon YY"
  const n = rows.length
  const target = 8
  const step = Math.max(1, Math.floor(n / target))
  const ticks: string[] = []
  for (let i = 0; i < n; i += step) ticks.push(rows[i].datetime)
  if (ticks[ticks.length-1] !== rows[n-1].datetime) ticks.push(rows[n-1].datetime)
  const formatter = (val: string) => {
    const date = val.split(' ')[0] ?? ''
    const [yyyy, mm, dd] = date.split('-')
    const mon = MONTHS[parseInt(mm ?? '1') - 1] ?? ''
    return `${parseInt(dd ?? '0')} ${mon} ${(yyyy ?? '').slice(2)}`
  }
  return { ticks, formatter }
}

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function SqTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '0.65rem 0.9rem',
      boxShadow: '0 4px 16px rgba(13,27,42,0.12)',
      fontFamily: 'var(--font-data)', fontSize: '0.75rem',
      minWidth: 200,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: '0.4rem', fontSize: '0.65rem', letterSpacing: '0.04em' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.25rem', marginBottom: 2 }}>
          <span style={{ color: p.color ?? p.fill }}>{p.name}</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>
            {p.name === 'Elec. Spot Price ($/MWh)' ? `$${Number(p.value).toFixed(2)}` : `${Number(p.value).toFixed(1)} MW`}
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
      {label && <span style={{ color: 'var(--muted)', fontSize: '0.65rem', fontFamily: 'var(--font-data)', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>}
      <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button key={opt.value} onClick={() => !disabled && onChange(opt.value)} disabled={disabled} style={{
              padding: '0.28rem 0.7rem', borderRadius: 6, border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: '0.75rem', fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--muted)',
              transition: 'all 0.15s', opacity: disabled ? 0.4 : 1,
            }}>{opt.label}</button>
          )
        })}
      </div>
    </div>
  )
}

function WindowSlider({ totalRows, windowSize, windowEnd, onChange, firstLabel, lastLabel, windowStartLabel, windowEndLabel, allDates }: any) {
  // allDates: full array of date strings for typed input lookup
  const [editingStart, setEditingStart] = useState(false)
  const [editingEnd,   setEditingEnd]   = useState(false)
  const [startInput,   setStartInput]   = useState('')
  const [endInput,     setEndInput]     = useState('')

  if (totalRows === 0 || windowSize >= totalRows) return null
  const min = windowSize - 1, max = totalRows - 1

  // Parse a typed DD/MM date string into a row index (find closest in allDates)
  const findIdx = (txt: string): number | null => {
    if (!allDates?.length || !txt.trim()) return null
    const [dd, mm] = txt.split('/').map(Number)
    if (!dd || !mm) return null
    // Match against YYYY-MM-DD HH:MM format
    const candidates = allDates
      .map((d: string, i: number) => {
        const parts = d.split('-')
        return { i, m: parseInt(parts[1] ?? '0'), day: parseInt((parts[2] ?? '').slice(0,2)) }
      })
      .filter((x: any) => x.m === mm && x.day === dd)
    return candidates.length ? candidates[0].i : null
  }

  const commitStart = () => {
    const idx = findIdx(startInput)
    if (idx !== null) {
      // windowEnd must stay >= idx + windowSize - 1
      const newEnd = Math.max(windowEnd, idx + windowSize - 1)
      onChange(Math.min(newEnd, max))
    }
    setEditingStart(false)
    setStartInput('')
  }
  const commitEnd = () => {
    const idx = findIdx(endInput)
    if (idx !== null) onChange(Math.min(Math.max(idx, min), max))
    setEditingEnd(false)
    setEndInput('')
  }

  const inputStyle = {
    fontFamily: 'var(--font-data)', fontSize: '0.72rem', fontWeight: 600,
    color: 'var(--accent)', background: 'var(--surface)',
    border: '1px solid var(--accent)', borderRadius: 5,
    padding: '2px 6px', width: 62, outline: 'none', textAlign: 'center' as const,
  }
  const labelStyle = {
    fontFamily: 'var(--font-data)', fontSize: '0.68rem', color: 'var(--accent)',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    padding: '2px 8px', borderRadius: 5, fontWeight: 600,
    cursor: 'pointer', userSelect: 'none',
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Date range display / inputs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)' }}>{firstLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {editingStart ? (
            <input autoFocus value={startInput} onChange={e => setStartInput(e.target.value)}
              onBlur={commitStart} onKeyDown={e => e.key === 'Enter' && commitStart()}
              placeholder="DD/MM" style={inputStyle} />
          ) : (
            <span style={labelStyle} onClick={() => { setEditingStart(true); setStartInput(windowStartLabel) }}
              title="Click to type a date (DD/MM)">{windowStartLabel}</span>
          )}
          <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>→</span>
          {editingEnd ? (
            <input autoFocus value={endInput} onChange={e => setEndInput(e.target.value)}
              onBlur={commitEnd} onKeyDown={e => e.key === 'Enter' && commitEnd()}
              placeholder="DD/MM" style={inputStyle} />
          ) : (
            <span style={labelStyle} onClick={() => { setEditingEnd(true); setEndInput(windowEndLabel) }}
              title="Click to type a date (DD/MM)">{windowEndLabel}</span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)' }}>{lastLabel}</span>
      </div>

      {/* Slider track — taller hit area */}
      <div style={{ position: 'relative', height: 36, display: 'flex', alignItems: 'center' }}>
        {/* Track */}
        <div style={{ position: 'absolute', left: 0, right: 0, height: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 3 }} />
        {/* Filled range */}
        <div style={{
          position: 'absolute',
          left:  `${((windowEnd - windowSize + 1) / (totalRows - 1)) * 100}%`,
          right: `${((totalRows - 1 - windowEnd)  / (totalRows - 1)) * 100}%`,
          height: 6, background: 'var(--accent)', borderRadius: 3, opacity: 0.85,
        }} />
        {/* Native range input — full hit area */}
        <input type="range" min={min} max={max} value={windowEnd} onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', left: 0, right: 0, width: '100%', opacity: 0, cursor: 'pointer', height: 36, margin: 0 }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute', left: `calc(${((windowEnd - min) / (max - min)) * 100}% - 9px)`,
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--surface)', border: '2.5px solid var(--accent)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)', pointerEvents: 'none',
        }} />
      </div>
      <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.58rem', color: 'var(--muted)', marginTop: '0.35rem', textAlign: 'center' as const }}>
        Drag slider or click dates above to type DD/MM
      </div>
    </div>
  )
}

// ── Fuel Mix Panel ────────────────────────────────────────────────────────────
function FuelMixPanel({ fuelMix, dateRange, windowSize, onDateRangeChange }: {
  fuelMix: { dates: string[]; series: Record<string, (number|null)[]> }
  dateRange: DateRangeOption; windowSize: number
  onDateRangeChange: (v: DateRangeOption) => void
}) {
  const { dates, series } = fuelMix
  const present = FUEL_MIX_ORDER.filter(f => series[f])

  // Window slicing — mirror RegionPanel logic
  const [windowEnd, setWindowEnd] = useState(dates.length - 1)
  useEffect(() => { setWindowEnd(dates.length - 1) }, [dateRange, dates.length])

  const sliced = useMemo(() => {
    if (dateRange === 'default') return dates
    return dates.slice(Math.max(0, windowEnd - windowSize + 1), windowEnd + 1)
  }, [dates, dateRange, windowSize, windowEnd])

  const sliceStart = dateRange === 'default' ? 0 : Math.max(0, windowEnd - windowSize + 1)

  // Build chart rows as % of total
  const chartRows = useMemo(() => {
    return sliced.map((dt, i) => {
      const gi  = sliceStart + i
      const row: Record<string, any> = { datetime: dt }
      const total = present.reduce((s, f) => s + (series[f]?.[gi] ?? 0), 0)
      for (const f of present) {
        const mw = series[f]?.[gi] ?? null
        row[f] = total > 0 && mw !== null ? Math.round(mw / total * 1000) / 10 : null
      }
      return row
    })
  }, [sliced, sliceStart, series, present])

  // Summary stats — most recent and max gas share over period
  const summaryRows = useMemo(() => {
    if (dateRange === 'default') return dates.map((_, i) => i)
    return Array.from({ length: Math.min(windowSize, dates.length) },
      (_, i) => Math.max(0, windowEnd - windowSize + 1) + i)
  }, [dates, dateRange, windowSize, windowEnd])

  const gasShares = useMemo(() => summaryRows.map(gi => {
    const total = present.reduce((s, f) => s + (series[f]?.[gi] ?? 0), 0)
    const gas   = series['Gas']?.[gi] ?? 0
    return total > 0 ? gas / total * 100 : null
  }).filter((v): v is number => v !== null), [summaryRows, series, present])

  const latestGi   = summaryRows[summaryRows.length - 1] ?? 0
  const latestTotal = present.reduce((s, f) => s + (series[f]?.[latestGi] ?? 0), 0)
  const latestGas   = series['Gas']?.[latestGi] ?? 0
  const latestGasPct = latestTotal > 0 ? (latestGas / latestTotal * 100) : null
  const maxGasPct    = gasShares.length ? Math.max(...gasShares) : null
  const latestDt     = dates[latestGi] ?? ''

  const fmtLabel = (d: string) => { const [,mm,dd] = d.split(' ')[0].split('-'); return `${dd}/${mm}` }

  // Smart ticks for x-axis
  const tickDates = useMemo(() => {
    if (!chartRows.length) return []
    const n = chartRows.length, target = 8
    const step = Math.max(1, Math.floor(n / target))
    const ticks: string[] = []
    for (let i = 0; i < n; i += step) ticks.push(chartRows[i].datetime)
    if (ticks[ticks.length-1] !== chartRows[n-1].datetime) ticks.push(chartRows[n-1].datetime)
    return ticks
  }, [chartRows])

  const tickFmt = (v: string) => { const [,mm,dd] = v.split(' ')[0].split('-'); return `${dd}/${mm}` }

  if (!dates.length || !present.length) return null

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'1rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>Energy Mix</h3>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>% of total generation · {present.join(', ')}</span>
      </div>

      {/* Gas summary stats */}
      <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap', marginBottom:'1.1rem' }}>
        <div style={{ flex:'1 1 160px', padding:'0.45rem 0.7rem',
          background:'var(--bg)', border:'1px solid var(--border)',
          borderLeft:`3px solid ${FUEL_MIX_COLOURS['Gas']}`, borderRadius:5 }}>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'0.58rem', color:'#5A5448',
            textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3, fontWeight:600 }}>
            Gas share — most recent
          </div>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'1.1rem', fontWeight:700, color:FUEL_MIX_COLOURS['Gas'], lineHeight:1 }}>
            {latestGasPct != null ? `${latestGasPct.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'#777', marginTop:3 }}>{latestDt}</div>
        </div>
        <div style={{ flex:'1 1 160px', padding:'0.45rem 0.7rem',
          background:'var(--bg)', border:'1px solid var(--border)',
          borderLeft:`3px solid ${FUEL_MIX_COLOURS['Gas']}`, borderRadius:5 }}>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'0.58rem', color:'#5A5448',
            textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3, fontWeight:600 }}>
            Gas share — max for period
          </div>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'1.1rem', fontWeight:700, color:FUEL_MIX_COLOURS['Gas'], lineHeight:1 }}>
            {maxGasPct != null ? `${maxGasPct.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'#777', marginTop:3 }}>peak in view</div>
        </div>
      </div>

      {/* HTML legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem 1rem', padding:'0.5rem 0',
        marginBottom:'0.5rem', borderBottom:'1px solid var(--border)' }}>
        {present.map(f => (
          <span key={f} style={{ display:'flex', alignItems:'center', gap:'0.35rem',
            fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'#333' }}>
            <span style={{ display:'inline-block', width:14, height:14, borderRadius:3,
              background:FUEL_MIX_COLOURS[f as FuelCategory], flexShrink:0 }} />
            {f}
          </span>
        ))}
      </div>

      {/* Stacked area chart */}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartRows} margin={{ top:4, right:16, left:0, bottom:4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="datetime"
            ticks={tickDates} tickFormatter={tickFmt}
            tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            tickLine={false} axisLine={{ stroke:'var(--border)' }} />
          <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]}
            tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            tickLine={false} axisLine={false} width={38} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div style={{ background:'#fff', border:'1px solid #D4D0C8', borderRadius:6,
                  padding:'0.6rem 0.85rem', fontFamily:'var(--font-data)', fontSize:'0.72rem',
                  boxShadow:'0 4px 16px rgba(0,0,0,0.08)', minWidth:160 }}>
                  <div style={{ fontWeight:700, color:'#1A1814', marginBottom:'0.35rem' }}>{label?.split(' ')[0]}</div>
                  {payload.slice().reverse().map((p: any) => p.value != null && (
                    <div key={p.dataKey} style={{ display:'flex', justifyContent:'space-between',
                      gap:'1.25rem', marginBottom:2, alignItems:'center' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ width:9, height:9, borderRadius:2, background:p.fill, display:'inline-block', flexShrink:0 }} />
                        <span style={{ color:'#444' }}>{p.dataKey}</span>
                      </span>
                      <span style={{ fontWeight:600, color:'#1A1814' }}>{Number(p.value).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          {present.map(f => (
            <Area key={f} type="monotone" dataKey={f} stackId="mix"
              stroke={FUEL_MIX_COLOURS[f as FuelCategory]}
              fill={FUEL_MIX_COLOURS[f as FuelCategory]}
              fillOpacity={0.85} strokeWidth={0.5}
              dot={false} connectNulls />
          ))}
        </AreaChart>
      </ResponsiveContainer>
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

  const regionColour = region === 'NSW' ? '#7B9FF9' : 'var(--accent)'

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: regionColour, boxShadow: `0 0 6px ${regionColour}` }} />
        <h2 style={{ fontSize:'1rem', fontWeight:700, color:'var(--text)', margin:0, letterSpacing:'-0.01em' }}>
          {region === 'NSW' ? 'New South Wales' : 'Victoria'}
        </h2>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.65rem', letterSpacing:'0.04em' }}>
          {summary.facilityCount} facilities · {visibleRows.length} intervals
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'0.6rem', marginBottom:'1.25rem' }}>
        <StatCard label="Avg Electricity Price" value={fmtP(summary.avgPrice)} sub="$/MWh" />
        <StatCard label="Max Electricity Price" value={fmtP(summary.maxPrice)} sub="Peak" />
        <StatCard label="Min Electricity Price" value={fmtP(summary.minPrice)} sub="Floor" />
        <StatCard label="Avg Generation" value={`${fmt(summary.avgTotalGen)} MW`} sub="All facilities" />
        <StatCard label="Peak Generation" value={`${fmt(summary.peakTotalGen)} MW`} sub="Max interval" />
      </div>

      <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
            <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>Gas Generation by Facility</h3>
            <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.65rem' }}>avg MW per interval</span>
          </div>
          <CsvButton onClick={() => downloadCsv(visibleRows.map((r: any) => ({ datetime: r.datetime, price: r.price, ...Object.fromEntries(facilities.map((f: string) => [f, r[f]])) })), `generation-${region}.csv`)} />
        </div>
        {/* HTML legend — sits in normal document flow, never overlaps */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem 1rem', padding:'0.5rem 0', marginBottom:'0.5rem', borderBottom:'1px solid var(--border)' }}>
          {facilities.map((name: string, i: number) => (
            <span key={name} style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'#333' }}>
              <span style={{ display:'inline-block', width:20, height:3, background:FACILITY_COLOURS[i % FACILITY_COLOURS.length], borderRadius:2, flexShrink:0 }} />
              {name}
            </span>
          ))}
          <span style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'#333' }}>
            <span style={{ display:'inline-block', width:20, height:2, borderTop:`2px dashed ${PRICE_COLOUR}`, flexShrink:0 }} />
            Spot Price ($/MWh)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartRows} margin={{ top:8, right:20, left:0, bottom:8 }}>
            <defs>
              {facilities.map((name: string, i: number) => (
                <linearGradient key={name} id={`elecGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={FACILITY_COLOURS[i % FACILITY_COLOURS.length]} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={FACILITY_COLOURS[i % FACILITY_COLOURS.length]} stopOpacity={0.7} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="datetime"
              ticks={elecSmartTicks(chartRows, dateRange).ticks}
              tickFormatter={elecSmartTicks(chartRows, dateRange).formatter}
              tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
              tickLine={false} axisLine={{ stroke:'var(--border)' }} interval="preserveStartEnd" />
            <YAxis yAxisId="gen"
              tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
              tickLine={false} axisLine={false} width={54} tickFormatter={v => `${v} MW`} />
            <YAxis yAxisId="price" orientation="right"
              tick={{ fill: PRICE_COLOUR, fontSize:9, fontFamily:'var(--font-data)' }}
              tickLine={false} axisLine={false} width={62} tickFormatter={v => `$${v}`} />
            <Tooltip content={<SqTooltip />} />
            {facilities.map((name: string, i: number) => (
              <Area key={name} yAxisId="gen" type="monotone" dataKey={name}
                stroke={FACILITY_COLOURS[i % FACILITY_COLOURS.length]} strokeWidth={0}
                fill={`url(#elecGrad${i})`} stackId="gen"
                dot={false} activeDot={{ r:3, strokeWidth:0 }} connectNulls />
            ))}
            <Line yAxisId="price" type="monotone" dataKey="price" name="Elec. Spot Price ($/MWh)"
              stroke={PRICE_COLOUR} strokeWidth={2} strokeDasharray="5 3"
              dot={false} activeDot={{ r:4, strokeWidth:0, fill: PRICE_COLOUR }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Range controls below chart */}
        <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
          <PillGroup label="View" options={DATE_RANGE_OPTIONS} value={dateRange} onChange={onDateRangeChange} />
          {dateRange !== 'default' && rows.length > windowSize && (
            <WindowSlider
              totalRows={rows.length} windowSize={windowSize} windowEnd={windowEnd} onChange={setWindowEnd}
              firstLabel={rows.length > 0 ? fmtLabel(rows[0].datetime) : ''}
              lastLabel={rows.length > 0 ? fmtLabel(rows[rows.length-1].datetime) : ''}
              windowStartLabel={visibleRows.length > 0 ? fmtLabel(visibleRows[0].datetime) : ''}
              windowEndLabel={visibleRows.length > 0 ? fmtLabel(visibleRows[visibleRows.length-1].datetime) : ''}
              allDates={rows.map((r: any) => r.datetime)}
            />
          )}
        </div>
      </div>

      {/* Energy mix chart */}
      {data.fuelMix && data.fuelMix.dates?.length > 0 && (
        <FuelMixPanel
          fuelMix={data.fuelMix}
          dateRange={dateRange}
          windowSize={windowSize}
          onDateRangeChange={onDateRangeChange}
        />
      )}

      {/* Data table */}
      <div className="sq-card" style={{ overflow:'hidden', marginBottom:'1rem' }}>
        <button onClick={() => setShowTable(v => !v)} style={{
          width:'100%', padding:'0.75rem 1.25rem', display:'flex',
          justifyContent:'space-between', alignItems:'center',
          background:'transparent', border:'none', cursor:'pointer',
        }}>
          <span style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--text)' }}>Raw Data</span>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>
            {visibleRows.length} rows · {showTable ? '▲' : '▼'}
          </span>
        </button>
        {showTable && (
          <div style={{ maxHeight:320, overflowY:'auto', borderTop:'1px solid var(--border)' }}>
            <table className="sq-table">
              <thead><tr>
                <th>Datetime</th><th>Elec. Price $/MWh</th>
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

  // Most recent datetime in the dataset (last row of whichever region has data)
  const latestDataDate = useMemo(() => {
    const rows = payload?.data?.NSW?.rows ?? payload?.data?.VIC?.rows ?? []
    if (!rows.length) return null
    const last = rows[rows.length - 1]?.datetime as string | undefined
    if (!last) return null
    const [datePart, timePart] = last.split(' ')
    const [yyyy, mm, dd] = (datePart ?? '').split('-')
    return `${dd}/${mm}/${yyyy} ${timePart ?? ''}`
  }, [payload])

  return (
    <div style={{ background:'var(--bg)' }}>
      {/* Sub-header: region tabs + interval */}
      <div style={{
        background:'var(--surface)', borderBottom:'1px solid var(--border)',
        boxShadow:'0 1px 3px rgba(13,27,42,0.05)',
        padding:'0 1.75rem', display:'flex', alignItems:'center',
        justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem',
      }}>
        <div style={{ display:'flex' }}>
          {(['NSW','VIC'] as const).map(tab => {
            const isActive = activeTab === tab
            const colour   = tab === 'NSW' ? '#7B9FF9' : 'var(--accent)'
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding:'0.75rem 1.25rem', border:'none', background:'transparent',
                cursor:'pointer', fontFamily:'var(--font-ui)', fontWeight: isActive ? 600 : 400,
                fontSize:'0.82rem', color: isActive ? colour : 'var(--muted)',
                borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
                marginBottom:-1, transition:'all 0.15s',
              }}>{tab === 'NSW' ? 'New South Wales' : 'Victoria'}</button>
            )
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.4rem 0' }}>
          {lastFetched && !loading && (
            <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>
              Updated {lastFetched}
            </span>
          )}
          {loading && <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--accent)' }}>Loading…</span>}
          <PillGroup label="Interval" options={INTERVAL_OPTIONS} value={interval} onChange={handleInterval} disabled={loading} />
        </div>
      </div>

      {/* Latest data date banner */}
      {latestDataDate && !loading && (
        <div style={{
          background:'var(--surface-2)', borderBottom:'1px solid var(--border)',
          padding:'0.35rem 1.75rem', display:'flex', alignItems:'center', gap:'0.5rem',
        }}>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'0.04em', textTransform:'uppercase' }}>
            Most recent data:
          </span>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.68rem', fontWeight:600, color:'var(--accent)' }}>
            {latestDataDate}
          </span>
        </div>
      )}

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>
        {error ? (
          <div className="sq-card" style={{ padding:'1.5rem', maxWidth:480 }}>
            <div style={{ color:'var(--negative)', fontFamily:'var(--font-data)', fontSize:'0.75rem', marginBottom:'0.4rem', fontWeight:600 }}>ERROR</div>
            <div style={{ color:'var(--text)', fontSize:'0.82rem' }}>{error}</div>
          </div>
        ) : loading && !payload ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'5rem 0', gap:'1rem' }}>
            <div style={{ width:32, height:32, border:'2px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Fetching generation data…</span>
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
