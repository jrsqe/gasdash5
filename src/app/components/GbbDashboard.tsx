'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY    = '#0B1F3A'
const TEAL    = '#00A878'
const MUTED   = '#7A8FA6'
const BORDER  = '#DDE2EA'
const SURFACE  = '#FFFFFF'
const SURFACE2 = '#F0F3F7'
const BG       = '#F4F6F9'

const PALETTE = [
  '#1D6FD4','#00A878','#E07B2A','#9B3FCF','#D4281D',
  '#0891B2','#65A30D','#B45309','#6D28D9','#0E7490',
  '#4D7C0F','#92400E','#5B21B6','#BE185D','#0369A1',
]
const PIPE_COLOURS: Record<string, string> = {
  'EGP':     '#1D6FD4', 'MSP':     '#00A878', 'MAPS':    '#E07B2A',
  'CGP':     '#9B3FCF', 'SWQP':    '#D4281D', 'QGP':     '#0891B2',
  'RBP':     '#65A30D', 'VTS-LMP': '#B45309', 'VTS-SWP': '#6D28D9',
  'VTS-VNI': '#0E7490', 'TGP':     '#4D7C0F', 'PCA':     '#92400E',
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface GbbTimeseries {
  dates: string[]
  gpgByState:   Record<string, Record<string, (number|null)[]>>
  prodByState:  Record<string, Record<string, (number|null)[]>>
  storageByFacility: Record<string, {
    state: string
    heldInStorage: (number|null)[]
    supply: (number|null)[]
    demand: (number|null)[]
  }>
  pipelineFlows: Record<string, { flow: (number|null)[]; direction: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt1 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmt0 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-AU', { maximumFractionDigits: 0 })

function fmtDateShort(d: string) {
  const [, mm, dd] = d.split('-')
  return `${dd}/${mm}`
}

// Last non-null value in an array
function lastVal(arr: (number|null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i]
  }
  return null
}

// Build recharts rows from date array + series map
function buildRows(dates: string[], series: Record<string, (number|null)[]>) {
  return dates.map((d, i) => ({
    date: fmtDateShort(d),
    rawDate: d,
    ...Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v[i] ?? null])),
  }))
}

// ── Date range window (same pattern as electricity dashboard) ─────────────────
type DateRangeOption = 'all' | '14d' | '7d' | '3d'
const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '14d', label: '14 days' },
  { value: '7d',  label: '7 days' },
  { value: '3d',  label: '3 days' },
]

function useWindowedDates(dates: string[], dateRange: DateRangeOption) {
  const windowSize = useMemo(() => {
    if (dateRange === 'all' || dates.length === 0) return dates.length
    const days = dateRange === '14d' ? 14 : dateRange === '7d' ? 7 : 3
    return Math.min(days, dates.length)
  }, [dateRange, dates])

  const maxEnd = dates.length - 1
  const minEnd = Math.max(0, windowSize - 1)
  const [windowEnd, setWindowEnd] = useState(maxEnd)

  // Reset to latest when range or dates change
  useEffect(() => { setWindowEnd(dates.length - 1) }, [dateRange, dates])

  const slicedDates = useMemo(() => {
    if (dateRange === 'all') return dates
    const start = Math.max(0, windowEnd - windowSize + 1)
    return dates.slice(start, windowEnd + 1)
  }, [dates, dateRange, windowSize, windowEnd])

  const sliceStart = dateRange === 'all' ? 0 : Math.max(0, windowEnd - windowSize + 1)

  return { slicedDates, sliceStart, windowEnd, setWindowEnd, windowSize, minEnd, maxEnd }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GbbTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '0.75rem 1rem', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace',
      minWidth: 200, boxShadow: '0 4px 16px rgba(11,31,58,0.10)',
    }}>
      <div style={{ color: MUTED, marginBottom: '0.5rem', fontSize: '0.68rem' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: 3 }}>
          <span style={{ color: p.color ?? p.fill, fontWeight: 500 }}>{p.name}</span>
          <span style={{ color: NAVY, fontWeight: 600 }}>{fmt1(p.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}

function StateTabs({ states, active, onChange }: { states: string[]; active: string; onChange: (s: string) => void }) {
  const colours: Record<string,string> = { NSW:'#1D6FD4', VIC:'#00A878', SA:'#E07B2A', QLD:'#9B3FCF', TAS:'#D4281D' }
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: '1.25rem' }}>
      {states.map(s => {
        const isActive = s === active
        const colour = colours[s] ?? NAVY
        return (
          <button key={s} onClick={() => onChange(s)} style={{
            padding: '0.5rem 1rem', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? colour : MUTED,
            borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{s}</button>
        )
      })}
    </div>
  )
}

function PillGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {label && <span style={{ color: MUTED, fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ display: 'flex', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 2, gap: 2 }}>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{
              padding: '0.28rem 0.65rem', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: '0.75rem',
              fontWeight: active ? 600 : 400,
              background: active ? NAVY : 'transparent',
              color: active ? '#fff' : MUTED, transition: 'all 0.15s',
            }}>{opt.label}</button>
          )
        })}
      </div>
    </div>
  )
}

// Slider to scroll the view window — identical pattern to electricity dashboard
function WindowSlider({
  totalRows, windowSize, windowEnd, onChange,
  firstLabel, lastLabel, windowStartLabel, windowEndLabel,
}: {
  totalRows: number; windowSize: number; windowEnd: number; onChange: (n: number) => void
  firstLabel: string; lastLabel: string; windowStartLabel: string; windowEndLabel: string
}) {
  if (totalRows === 0 || windowSize >= totalRows) return null
  const min = windowSize - 1
  const max = totalRows - 1
  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: MUTED }}>{firstLabel}</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.72rem', color: NAVY, background: SURFACE2, border: `1px solid ${BORDER}`, padding: '2px 10px', borderRadius: 6, fontWeight: 500 }}>
          {windowStartLabel} → {windowEndLabel}
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: MUTED }}>{lastLabel}</span>
      </div>
      <div style={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 6, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 3 }} />
        <div style={{
          position: 'absolute',
          left:  `${((windowEnd - windowSize + 1) / (totalRows - 1)) * 100}%`,
          right: `${((totalRows - 1 - windowEnd) / (totalRows - 1)) * 100}%`,
          height: 6, background: TEAL, borderRadius: 3, opacity: 0.7, transition: 'left 0.1s, right 0.1s',
        }} />
        <input type="range" min={min} max={max} value={windowEnd} onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', left: 0, right: 0, width: '100%', opacity: 0, cursor: 'pointer', height: 28, margin: 0 }}
        />
        <div style={{
          position: 'absolute', left: `calc(${((windowEnd - min) / (max - min)) * 100}% - 8px)`,
          width: 16, height: 16, borderRadius: '50%', background: NAVY, border: `2px solid ${TEAL}`,
          boxShadow: '0 1px 4px rgba(11,31,58,0.2)', pointerEvents: 'none', transition: 'left 0.1s',
        }} />
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: MUTED, marginTop: '0.25rem' }}>
        drag to scroll
      </div>
    </div>
  )
}

// Range controls + optional slider, rendered below a chart
function ChartRangeControls({
  dates, dateRange, onDateRangeChange, windowEnd, setWindowEnd, windowSize, sliceStart, slicedDates,
}: {
  dates: string[]; dateRange: DateRangeOption; onDateRangeChange: (v: DateRangeOption) => void
  windowEnd: number; setWindowEnd: (n: number) => void; windowSize: number
  sliceStart: number; slicedDates: string[]
}) {
  const fmtLabel = (d: string) => { const [,mm,dd] = d.split('-'); return `${dd}/${mm}` }
  return (
    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <PillGroup label="View" options={DATE_RANGE_OPTIONS} value={dateRange} onChange={onDateRangeChange} />
        {dateRange !== 'all' && (
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: MUTED }}>
            {slicedDates.length} of {dates.length} days
          </span>
        )}
      </div>
      {dateRange !== 'all' && dates.length > windowSize && (
        <WindowSlider
          totalRows={dates.length} windowSize={windowSize} windowEnd={windowEnd} onChange={setWindowEnd}
          firstLabel={dates.length > 0 ? fmtLabel(dates[0]) : ''}
          lastLabel={dates.length > 0 ? fmtLabel(dates[dates.length - 1]) : ''}
          windowStartLabel={slicedDates.length > 0 ? fmtLabel(slicedDates[0]) : ''}
          windowEndLabel={slicedDates.length > 0 ? fmtLabel(slicedDates[slicedDates.length - 1]) : ''}
        />
      )}
    </div>
  )
}

// ── GPG Panel ─────────────────────────────────────────────────────────────────
function GpgPanel({ dates, gpgByState }: { dates: string[]; gpgByState: Record<string, Record<string, (number|null)[]>> }) {
  const states = Object.keys(gpgByState).sort()
  const [activeState, setActiveState] = useState(states[0] ?? 'NSW')
  const [dateRange, setDateRange] = useState<DateRangeOption>('all')
  const { slicedDates, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindowedDates(dates, dateRange)

  useEffect(() => { if (!states.includes(activeState)) setActiveState(states[0] ?? '') }, [states])

  const facilities = Object.keys(gpgByState[activeState] ?? {})
  const series = gpgByState[activeState] ?? {}

  const rows = slicedDates.map((d, i) => {
    const gi = sliceStart + i
    return { date: fmtDateShort(d), ...Object.fromEntries(facilities.map(f => [f, series[f]?.[gi] ?? null])) }
  })

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', color: NAVY, margin: 0 }}>GPG Gas Demand</h3>
        <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>TJ/day</span>
      </div>
      {states.length > 1 && <StateTabs states={states} active={activeState} onChange={setActiveState} />}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<GbbTooltip unit="TJ" />} />
          <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
          {facilities.map((f, i) => (
            <Bar key={f} dataKey={f} stackId="gpg" fill={PALETTE[i % PALETTE.length]}
              radius={i === facilities.length - 1 ? [2,2,0,0] : [0,0,0,0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartRangeControls dates={dates} dateRange={dateRange} onDateRangeChange={(v) => { setDateRange(v) }}
        windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize}
        sliceStart={sliceStart} slicedDates={slicedDates} />
    </div>
  )
}

// ── Production Panel ──────────────────────────────────────────────────────────
function ProductionPanel({ dates, prodByState }: { dates: string[]; prodByState: Record<string, Record<string, (number|null)[]>> }) {
  const states = Object.keys(prodByState).sort()
  const [activeState, setActiveState] = useState(states[0] ?? 'VIC')
  const [dateRange, setDateRange] = useState<DateRangeOption>('all')
  const { slicedDates, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindowedDates(dates, dateRange)
  const [showFilter, setShowFilter] = useState(false)

  useEffect(() => { if (!states.includes(activeState)) setActiveState(states[0] ?? '') }, [states])

  const allFacilities = Object.keys(prodByState[activeState] ?? {})
  const [selectedFacilities, setSelectedFacilities] = useState<Set<string>>(new Set())

  // When state changes, reset selection to all
  useEffect(() => { setSelectedFacilities(new Set()) }, [activeState])

  const activeFacilities = selectedFacilities.size > 0 ? allFacilities.filter(f => selectedFacilities.has(f)) : allFacilities
  const series = prodByState[activeState] ?? {}

  const rows = slicedDates.map((d, i) => {
    const gi = sliceStart + i
    return { date: fmtDateShort(d), ...Object.fromEntries(activeFacilities.map(f => [f, series[f]?.[gi] ?? null])) }
  })

  const toggleFacility = (f: string) => {
    setSelectedFacilities(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }
  const selectAll  = () => setSelectedFacilities(new Set())
  const selectNone = () => setSelectedFacilities(new Set(allFacilities))  // select all = deselect all (show none), invert

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem', color: NAVY, margin: 0 }}>Gas Production</h3>
          <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>TJ/day</span>
        </div>
        <button onClick={() => setShowFilter(v => !v)} style={{
          padding: '0.28rem 0.75rem', borderRadius: 6, border: `1px solid ${BORDER}`,
          background: showFilter ? NAVY : SURFACE2, color: showFilter ? '#fff' : MUTED,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', fontWeight: 500,
        }}>
          {selectedFacilities.size > 0 ? `${activeFacilities.length} / ${allFacilities.length} facilities` : 'Filter facilities'}
        </button>
      </div>

      {showFilter && (
        <div style={{
          background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '0.75rem', marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button onClick={selectAll} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, cursor: 'pointer' }}>All</button>
            <button onClick={selectNone} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, cursor: 'pointer' }}>None</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: 160, overflowY: 'auto' }}>
            {allFacilities.map((f, i) => {
              const isActive = selectedFacilities.size === 0 || selectedFacilities.has(f)
              return (
                <button key={f} onClick={() => toggleFacility(f)} style={{
                  padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', fontWeight: isActive ? 600 : 400,
                  background: isActive ? PALETTE[i % PALETTE.length] : BORDER,
                  color: isActive ? '#fff' : MUTED, transition: 'all 0.12s',
                }}>{f}</button>
              )
            })}
          </div>
        </div>
      )}

      {states.length > 1 && <StateTabs states={states} active={activeState} onChange={setActiveState} />}

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<GbbTooltip unit="TJ" />} />
          <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
          {activeFacilities.map((f, i) => (
            <Line key={f} type="monotone" dataKey={f}
              stroke={PALETTE[allFacilities.indexOf(f) % PALETTE.length]}
              strokeWidth={1.75} dot={false} connectNulls activeDot={{ r: 3, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartRangeControls dates={dates} dateRange={dateRange} onDateRangeChange={setDateRange}
        windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize}
        sliceStart={sliceStart} slicedDates={slicedDates} />
    </div>
  )
}

// ── Storage Panel ─────────────────────────────────────────────────────────────
function StoragePanel({ dates, storageByFacility }: {
  dates: string[]
  storageByFacility: Record<string, { state: string; heldInStorage: (number|null)[]; supply: (number|null)[]; demand: (number|null)[] }>
}) {
  const facilities = Object.keys(storageByFacility).sort()
  const stateOf    = (f: string) => storageByFacility[f]?.state ?? ''
  const stateGroups = ['NSW','VIC','SA'].filter(s => facilities.some(f => stateOf(f) === s))
  const [activeState,  setActiveState]  = useState(stateGroups[0] ?? 'VIC')
  const [activeMetric, setActiveMetric] = useState<'level'|'flow'>('level')
  const [dateRange,    setDateRange]    = useState<DateRangeOption>('all')
  const { slicedDates, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindowedDates(dates, dateRange)

  const stateFacilities = facilities.filter(f => stateOf(f) === activeState)

  const levelRows = slicedDates.map((d, i) => {
    const gi = sliceStart + i
    return {
      date: fmtDateShort(d),
      ...Object.fromEntries(stateFacilities.map(f => [f, storageByFacility[f].heldInStorage[gi] ?? null]))
    }
  })
  const flowRows = slicedDates.map((d, i) => {
    const gi = sliceStart + i
    const row: Record<string,any> = { date: fmtDateShort(d) }
    stateFacilities.forEach(f => {
      row[`${f} inject`]    = storageByFacility[f].demand[gi]  ?? null
      row[`${f} withdraw`]  = storageByFacility[f].supply[gi]  ?? null
    })
    return row
  })

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem', color: NAVY, margin: 0 }}>Gas Storage</h3>
          <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>TJ</span>
        </div>
        <div style={{ display: 'flex', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 2, gap: 2 }}>
          {(['level','flow'] as const).map(m => (
            <button key={m} onClick={() => setActiveMetric(m)} style={{
              padding: '0.25rem 0.75rem', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', fontWeight: activeMetric === m ? 600 : 400,
              background: activeMetric === m ? NAVY : 'transparent',
              color: activeMetric === m ? '#fff' : MUTED,
            }}>{m === 'level' ? 'Storage Level' : 'Inject / Withdraw'}</button>
          ))}
        </div>
      </div>

      {stateGroups.length > 1 && <StateTabs states={stateGroups} active={activeState} onChange={setActiveState} />}

      {activeMetric === 'level' ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={levelRows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={56} tickFormatter={v => fmt0(v)} />
            <Tooltip content={<GbbTooltip unit="TJ" />} />
            <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
            {stateFacilities.map((f, i) => (
              <Line key={f} type="monotone" dataKey={f} stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2} dot={false} connectNulls activeDot={{ r: 3, strokeWidth: 0 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={flowRows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} />
            <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={48} />
            <ReferenceLine y={0} stroke={BORDER} />
            <Tooltip content={<GbbTooltip unit="TJ" />} />
            <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
            {stateFacilities.flatMap((f, i) => [
              <Bar key={`${f}-in`}  dataKey={`${f} inject`}   fill={PALETTE[i % PALETTE.length]}       radius={[2,2,0,0]} />,
              <Bar key={`${f}-out`} dataKey={`${f} withdraw`} fill={PALETTE[(i+5) % PALETTE.length]}   radius={[2,2,0,0]} />,
            ])}
          </BarChart>
        </ResponsiveContainer>
      )}
      <ChartRangeControls dates={dates} dateRange={dateRange} onDateRangeChange={setDateRange}
        windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize}
        sliceStart={sliceStart} slicedDates={slicedDates} />
    </div>
  )
}

// ── Pipeline Panel ────────────────────────────────────────────────────────────
function PipelinePanel({ dates, pipelineFlows }: {
  dates: string[]
  pipelineFlows: Record<string, { flow: (number|null)[]; direction: string }>
}) {
  const pipelines = Object.keys(pipelineFlows).sort()
  const groups = [
    { label: 'Interconnectors', pipes: pipelines.filter(p => ['EGP','MSP','MAPS','TGP','PCA'].includes(p)) },
    { label: 'VTS',             pipes: pipelines.filter(p => p.startsWith('VTS')) },
    { label: 'Queensland',      pipes: pipelines.filter(p => ['CGP','SWQP','QGP','RBP'].includes(p)) },
  ].filter(g => g.pipes.length > 0)

  const [activeGroup, setActiveGroup] = useState(groups[0]?.label ?? '')
  const [dateRange,   setDateRange]   = useState<DateRangeOption>('all')
  const { slicedDates, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindowedDates(dates, dateRange)

  const activePipes = groups.find(g => g.label === activeGroup)?.pipes ?? []

  const chartRows = slicedDates.map((d, i) => {
    const gi = sliceStart + i
    return { date: fmtDateShort(d), ...Object.fromEntries(activePipes.map(p => [p, pipelineFlows[p]?.flow[gi] ?? null])) }
  })

  // Latest values for summary table (all pipelines, not just current group)
  const latestByPipeline = useMemo(() =>
    Object.fromEntries(pipelines.map(p => [p, lastVal(pipelineFlows[p]?.flow ?? [])])),
    [pipelines, pipelineFlows]
  )

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', color: NAVY, margin: 0 }}>Pipeline Flows</h3>
        <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>TJ/day · GBB system</span>
      </div>

      {/* Most recent flows summary table */}
      <div style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', color: MUTED, fontWeight: 500 }}>Pipeline</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem', color: MUTED, fontWeight: 500 }}>Flow (TJ/day)</th>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', color: MUTED, fontWeight: 500 }}>Direction</th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p, i) => {
              const val = latestByPipeline[p]
              const dir = pipelineFlows[p]?.direction ?? '—'
              return (
                <tr key={p} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? 'transparent' : SURFACE2 }}>
                  <td style={{ padding: '0.45rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIPE_COLOURS[p] ?? NAVY, flexShrink: 0 }} />
                    <span style={{ color: NAVY, fontWeight: 600 }}>{p}</span>
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: NAVY, fontWeight: 700 }}>
                    {val != null ? val.toLocaleString('en-AU', { maximumFractionDigits: 1 }) : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: MUTED }}>→ {dir}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Direction legend for active group */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {activePipes.map(p => (
          <div key={p} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 8px',
            fontFamily: 'DM Mono, monospace', fontSize: '0.68rem',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIPE_COLOURS[p] ?? NAVY }} />
            <span style={{ color: NAVY, fontWeight: 600 }}>{p}</span>
            <span style={{ color: MUTED }}>→ {pipelineFlows[p]?.direction}</span>
          </div>
        ))}
      </div>

      <StateTabs states={groups.map(g => g.label)} active={activeGroup} onChange={setActiveGroup} />

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartRows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<GbbTooltip unit="TJ" />} />
          <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
          {activePipes.map(p => (
            <Line key={p} type="monotone" dataKey={p}
              stroke={PIPE_COLOURS[p] ?? NAVY} strokeWidth={1.75}
              dot={false} connectNulls activeDot={{ r: 3, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <ChartRangeControls dates={dates} dateRange={dateRange} onDateRangeChange={setDateRange}
        windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize}
        sliceStart={sliceStart} slicedDates={slicedDates} />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GbbDashboard() {
  const [data,    setData]    = useState<GbbTimeseries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/gbb').then(r => r.json())
      .then(j => { if (!j.ok) throw new Error(j.error); setData(j.data) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0', gap: '1rem' }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: TEAL, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.8rem' }}>Fetching GBB data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  if (error) return (
    <div className="card" style={{ padding: '1.5rem', color: '#D4281D', fontFamily: 'DM Mono, monospace', fontSize: '0.82rem' }}>
      GBB Error: {error}
    </div>
  )
  if (!data) return null

  return (
    <div>
      <GpgPanel       dates={data.dates} gpgByState={data.gpgByState} />
      <StoragePanel   dates={data.dates} storageByFacility={data.storageByFacility} />
      <ProductionPanel dates={data.dates} prodByState={data.prodByState} />
      <PipelinePanel  dates={data.dates} pipelineFlows={data.pipelineFlows} />
    </div>
  )
}
