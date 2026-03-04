'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useGbbData } from './MainDashboard'

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = [
  '#1B5E7B','#E8632A','#2E7D4F','#7B3FA0','#B5880C',
  '#C0334A','#1A6B6B','#5C5FA8','#7A4F1E','#3D8B37',
  '#A0522D','#4A7FA5','#8B6914','#5D4E6D','#2D6E6E',
]
const PIPE_COLOURS: Record<string,string> = {
  EGP:'#1B5E7B', MSP:'#2E7D4F', MAPS:'#E8632A', CGP:'#7B3FA0', SWQP:'#B5880C',
  QGP:'#1A6B6B', RBP:'#5C5FA8', 'VTS-LMP':'#C0334A', 'VTS-SWP':'#7A4F1E', 'VTS-VNI':'#3D8B37',
  TGP:'#4A7FA5', PCA:'#8B6914',
  GLNG:'#C0334A', APLNG:'#2D6E6E', WGP:'#7A4F1E',
}
const STATE_COLOURS: Record<string,string> = { NSW:'var(--nsw)', VIC:'var(--vic)', SA:'var(--sa)', QLD:'var(--qld)', TAS:'var(--tas)' }

// ── Types ─────────────────────────────────────────────────────────────────────
interface GbbData {
  dates: string[]
  gpgByState:   Record<string, Record<string,(number|null)[]>>
  largeByState: Record<string, Record<string,(number|null)[]>>
  prodByState:  Record<string, Record<string,(number|null)[]>>
  storageByFacility: Record<string, { state:string; heldInStorage:(number|null)[]; supply:(number|null)[]; demand:(number|null)[] }>
  pipelineFlows: Record<string, { flow:(number|null)[]; direction:string; nameplateCapacity:number|null; stcCapacity:number|null }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt1 = (v: number|null|undefined) =>
  v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits:1, maximumFractionDigits:1 })
const fmt0 = (v: number|null|undefined) =>
  v == null ? '—' : v.toLocaleString('en-AU', { maximumFractionDigits:0 })


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

function fmtD(d: string) { const [yyyy,mm,dd] = d.split('-'); return `${dd}/${mm}/${(yyyy??'').slice(2)}` }

function lastVal(arr: (number|null)[]): number|null {
  for (let i = arr.length-1; i >= 0; i--) if (arr[i] != null) return arr[i]
  return null
}

type DateRangeOption = 'all'|'90d'|'30d'|'7d'
const DATE_RANGE_OPTIONS: {value: DateRangeOption; label: string}[] = [
  { value:'all',  label:'All'    },
  { value:'90d',  label:'90 days' },
  { value:'30d',  label:'30 days' },
  { value:'7d',   label:'7 days'  },
]

function useWindow(dates: string[], dateRange: DateRangeOption) {
  const windowSize = useMemo(() => {
    if (dateRange === 'all' || !dates.length) return dates.length
    const d = dateRange === '90d' ? 90 : dateRange === '30d' ? 30 : 7
    return Math.min(d, dates.length)
  }, [dateRange, dates])

  const [windowEnd, setWindowEnd] = useState(dates.length - 1)
  useEffect(() => { setWindowEnd(dates.length - 1) }, [dateRange, dates])

  const sliced = useMemo(() => {
    if (dateRange === 'all') return dates
    return dates.slice(Math.max(0, windowEnd - windowSize + 1), windowEnd + 1)
  }, [dates, dateRange, windowSize, windowEnd])

  const sliceStart = dateRange === 'all' ? 0 : Math.max(0, windowEnd - windowSize + 1)
  return { sliced, sliceStart, windowEnd, setWindowEnd, windowSize }
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function SqTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:8, padding:'0.65rem 0.9rem',
      fontFamily:'var(--font-data)', fontSize:'0.75rem',
      minWidth:190, boxShadow:'0 4px 16px rgba(13,27,42,0.12)',
    }}>
      <div style={{ color:'var(--muted)', marginBottom:'0.4rem', fontSize:'0.62rem', letterSpacing:'0.04em' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:'1.25rem', marginBottom:2 }}>
          <span style={{ color: p.color ?? p.fill }}>{p.name}</span>
          <span style={{ color:'var(--text)', fontWeight:600 }}>{fmt1(p.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}

function StateTabs({ states, active, onChange }: { states:string[]; active:string; onChange:(s:string)=>void }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:'1rem' }}>
      {states.map(s => {
        const isActive = s === active
        const c = STATE_COLOURS[s] ?? 'var(--accent)'
        return (
          <button key={s} onClick={() => onChange(s)} style={{
            padding:'0.45rem 0.85rem', border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? c : 'var(--muted)',
            borderBottom: isActive ? `2px solid ${c}` : '2px solid transparent',
            marginBottom:-1, transition:'all 0.15s',
          }}>{s}</button>
        )
      })}
    </div>
  )
}

function GroupTabs({ groups, active, onChange }: { groups:string[]; active:string; onChange:(s:string)=>void }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:'1rem' }}>
      {groups.map(g => {
        const isActive = g === active
        return (
          <button key={g} onClick={() => onChange(g)} style={{
            padding:'0.45rem 0.85rem', border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--accent)' : 'var(--muted)',
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom:-1, transition:'all 0.15s',
          }}>{g}</button>
        )
      })}
    </div>
  )
}

function PillGroup<T extends string>({ label, options, value, onChange }: {
  label?:string; options:{value:T; label:string}[]; value:T; onChange:(v:T)=>void
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
      {label && <span style={{ color:'var(--muted)', fontSize:'0.62rem', fontFamily:'var(--font-data)', whiteSpace:'nowrap', letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</span>}
      <div style={{ display:'flex', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:2, gap:2 }}>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{
              padding:'0.25rem 0.65rem', borderRadius:6, border:'none', cursor:'pointer',
              fontFamily:'var(--font-ui)', fontSize:'0.72rem', fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--muted)', transition:'all 0.15s',
            }}>{opt.label}</button>
          )
        })}
      </div>
    </div>
  )
}

function WindowSlider({ totalRows, windowSize, windowEnd, onChange, firstLabel, lastLabel, windowStartLabel, windowEndLabel }: any) {
  if (totalRows === 0 || windowSize >= totalRows) return null
  const min = windowSize-1, max = totalRows-1
  return (
    <div style={{ marginTop:'0.85rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
        <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>{firstLabel}</span>
        <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--accent)', background:'var(--surface-2)', border:'1px solid var(--border)', padding:'1px 7px', borderRadius:4, fontWeight:600 }}>
          {windowStartLabel} → {windowEndLabel}
        </span>
        <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>{lastLabel}</span>
      </div>
      <div style={{ position:'relative', height:22, display:'flex', alignItems:'center' }}>
        <div style={{ position:'absolute', left:0, right:0, height:4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:2 }} />
        <div style={{
          position:'absolute',
          left: `${((windowEnd-windowSize+1)/(totalRows-1))*100}%`,
          right:`${((totalRows-1-windowEnd)/(totalRows-1))*100}%`,
          height:4, background:'var(--accent)', borderRadius:2, opacity:0.8, transition:'left 0.08s, right 0.08s',
        }} />
        <input type="range" min={min} max={max} value={windowEnd} onChange={e => onChange(Number(e.target.value))}
          style={{ position:'absolute', left:0, right:0, width:'100%', opacity:0, cursor:'pointer', height:22, margin:0 }} />
        <div style={{
          position:'absolute', left:`calc(${((windowEnd-min)/(max-min))*100}% - 6px)`,
          width:12, height:12, borderRadius:'50%',
          background:'var(--surface)', border:'2px solid var(--accent)',
          boxShadow:'0 0 6px var(--accent-glow)', pointerEvents:'none', transition:'left 0.08s',
        }} />
      </div>
    </div>
  )
}

function RangeControls({ dates, dateRange, onChange, sliced, windowEnd, setWindowEnd, windowSize, sliceStart }: any) {
  const fmtL = (d: string) => { const [,mm,dd] = d.split('-'); return `${dd}/${mm}` }
  return (
    <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
        <PillGroup options={DATE_RANGE_OPTIONS} value={dateRange} onChange={onChange} label="View" />
        {dateRange !== 'all' && (
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>
            {sliced.length} of {dates.length} days
          </span>
        )}
      </div>
      {dateRange !== 'all' && dates.length > windowSize && (
        <WindowSlider
          totalRows={dates.length} windowSize={windowSize} windowEnd={windowEnd} onChange={setWindowEnd}
          firstLabel={dates.length > 0 ? fmtL(dates[0]) : ''}
          lastLabel={dates.length > 0 ? fmtL(dates[dates.length-1]) : ''}
          windowStartLabel={sliced.length > 0 ? fmtL(sliced[0]) : ''}
          windowEndLabel={sliced.length > 0 ? fmtL(sliced[sliced.length-1]) : ''}
        />
      )}
    </div>
  )
}

const XAXIS_TICK = { fill:'var(--muted)', fontSize:9, fontFamily:'var(--font-data)' }

// Build a smart ticks array for the x-axis: picks ~8 evenly-spaced dates
// and formats them as Mon/YY for long ranges or DD/Mon for short ones.
// Chart rows use fmtD values as keys (e.g. "15/03/25").
// smartTicks receives the already-formatted sliced date labels and picks ~8
// evenly-spaced ones. For "all" view it reformats them as "Mon YY".
function smartTicks(fmtDates: string[], dateRange: string): { ticks: string[]; formatter: (v:string) => string } {
  if (!fmtDates.length) return { ticks: fmtDates, formatter: v => v }
  const n = fmtDates.length
  const target = 8
  const step = Math.max(1, Math.floor(n / target))
  const ticks: string[] = []
  for (let i = 0; i < n; i += step) ticks.push(fmtDates[i])
  if (ticks[ticks.length - 1] !== fmtDates[n - 1]) ticks.push(fmtDates[n - 1])

  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  // fmtD format is "DD/MM/YY" — reformat for "all" view as "Mon YY"
  const formatter = dateRange === 'all'
    ? (v: string) => {
        const parts = v.split('/')   // ["DD","MM","YY"]
        const mon = MONS[parseInt(parts[1] ?? '1') - 1] ?? ''
        return `${mon} ${parts[2] ?? ''}`
      }
    : (v: string) => {
        const parts = v.split('/')
        const mon = MONS[parseInt(parts[1] ?? '1') - 1] ?? ''
        return `${parseInt(parts[0] ?? '0')} ${mon}`
      }
  return { ticks, formatter }
}

const XAXIS_PROPS = {
  tick: XAXIS_TICK,
  tickLine:false, axisLine:{ stroke:'var(--border)' },
}
const YAXIS_PROPS = {
  tick:{ fill:'var(--muted)', fontSize:9, fontFamily:'var(--font-data)' },
  tickLine:false, axisLine:false, width:52,
}
const LEGEND_STYLE = { fontSize:'0.65rem', fontFamily:'var(--font-data)', paddingTop:'0.4rem', color:'var(--text-2)' }
const CHART_MARGIN = { top:4, right:12, left:0, bottom:4 }

// ── GPG Panel ─────────────────────────────────────────────────────────────────
type DemandType = 'gpg' | 'large'

function GpgPanel({ dates, gpgByState, largeByState }: {
  dates: string[]
  gpgByState:   Record<string, Record<string,(number|null)[]>>
  largeByState: Record<string, Record<string,(number|null)[]>>
}) {
  const [demandType, setDemandType] = useState<DemandType>('gpg')
  const activeData = demandType === 'gpg' ? gpgByState : largeByState
  const states     = Object.keys(activeData).sort()
  const [state, setState] = useState(states[0] ?? 'NSW')
  const [range, setRange] = useState<DateRangeOption>('all')
  const { sliced, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindow(dates, range)

  useEffect(() => {
    const s = Object.keys(activeData).sort()
    // Default to NSW if available, otherwise first state
    const preferred = s.includes('NSW') ? 'NSW' : (s[0] ?? '')
    setState(preferred)
  }, [demandType])

  const facilities = Object.keys(activeData[state] ?? {})
  const series     = activeData[state] ?? {}

  const rows = sliced.map((d,i) => {
    const gi = sliceStart+i
    return { date: fmtD(d), ...Object.fromEntries(facilities.map(f => [f, series[f]?.[gi] ?? null])) }
  })

  const title    = demandType === 'gpg' ? 'GPG Gas Demand' : 'Large Industry Gas Demand'
  const csvName  = demandType === 'gpg' ? `gpg-demand-${state}.csv` : `large-industry-demand-${state}.csv`

  const DEMAND_TABS: { value: DemandType; label: string }[] = [
    { value: 'gpg',   label: 'Gas Power Generation' },
    { value: 'large', label: 'Large Industry' },
  ]

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      {/* Title row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
          <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>{title}</h3>
          <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ/day</span>
        </div>
        <CsvButton onClick={() => downloadCsv(rows, csvName)} />
      </div>

      {/* Demand type tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:'1rem' }}>
        {DEMAND_TABS.map(tab => {
          const isActive = tab.value === demandType
          return (
            <button key={tab.value} onClick={() => setDemandType(tab.value)} style={{
              padding:'0.4rem 0.9rem', border:'none', background:'transparent',
              cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--muted)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom:-1, transition:'all 0.15s',
            }}>{tab.label}</button>
          )
        })}
      </div>

      {/* State tabs — only if multiple states available */}
      {states.length > 1 && <StateTabs states={states} active={state} onChange={setState} />}

      {facilities.length === 0 ? (
        <div style={{ padding:'2rem', textAlign:'center', color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
          No data available for {state}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" {...XAXIS_PROPS} ticks={smartTicks(sliced.map(fmtD),range).ticks} tickFormatter={smartTicks(sliced.map(fmtD),range).formatter} />
            <YAxis {...YAXIS_PROPS} />
            <Tooltip content={<SqTooltip unit="TJ" />} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {facilities.map((f,i) => (
              <Bar key={f} dataKey={f} stackId="g" fill={PALETTE[i%PALETTE.length]}
                radius={i === facilities.length-1 ? [2,2,0,0] : [0,0,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      <RangeControls dates={dates} dateRange={range} onChange={setRange}
        sliced={sliced} windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize} sliceStart={sliceStart} />
    </div>
  )
}

// ── Storage Panel ─────────────────────────────────────────────────────────────
function StoragePanel({ dates, storageByFacility }: {
  dates:string[];
  storageByFacility: Record<string,{ state:string; heldInStorage:(number|null)[]; supply:(number|null)[]; demand:(number|null)[] }>
}) {
  const facilities  = Object.keys(storageByFacility).sort()
  const stateOf     = (f:string) => storageByFacility[f]?.state ?? ''
  const stateGroups = ['NSW','VIC','SA'].filter(s => facilities.some(f => stateOf(f) === s))
  const [state,  setState]  = useState(stateGroups[0] ?? 'VIC')
  const [metric, setMetric] = useState<'level'|'flow'>('level')
  const [range,  setRange]  = useState<DateRangeOption>('all')
  const { sliced, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindow(dates, range)

  const sf = facilities.filter(f => stateOf(f) === state)

  const levelRows = sliced.map((d,i) => {
    const gi = sliceStart+i
    return { date:fmtD(d), ...Object.fromEntries(sf.map(f => [f, storageByFacility[f].heldInStorage[gi] ?? null])) }
  })
  const flowRows = sliced.map((d,i) => {
    const gi = sliceStart+i
    const row: Record<string,any> = { date:fmtD(d) }
    sf.forEach(f => {
      row[`${f} inject`]    = storageByFacility[f].demand[gi]  ?? null
      row[`${f} withdraw`]  = storageByFacility[f].supply[gi]  ?? null
    })
    return row
  })

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
            <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>Gas Storage</h3>
            <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ</span>
          </div>
          <CsvButton onClick={() => downloadCsv(metric === 'level' ? levelRows : flowRows, `storage-${state}-${metric}.csv`)} />
        </div>
        <PillGroup
          options={[{value:'level',label:'Level'},{value:'flow',label:'Inject/Withdraw'}] as {value:'level'|'flow';label:string}[]}
          value={metric} onChange={setMetric} />
      </div>
      {stateGroups.length > 1 && <StateTabs states={stateGroups} active={state} onChange={setState} />}
      {metric === 'level' ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={levelRows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" {...XAXIS_PROPS} ticks={smartTicks(sliced.map(fmtD),range).ticks} tickFormatter={smartTicks(sliced.map(fmtD),range).formatter} />
            <YAxis {...YAXIS_PROPS} tickFormatter={v => fmt0(v)} />
            <Tooltip content={<SqTooltip unit="TJ" />} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {sf.map((f,i) => (
              <Line key={f} type="monotone" dataKey={f} stroke={PALETTE[i%PALETTE.length]}
                strokeWidth={2} dot={false} connectNulls activeDot={{r:3,strokeWidth:0}} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={flowRows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" {...XAXIS_PROPS} ticks={smartTicks(sliced.map(fmtD),range).ticks} tickFormatter={smartTicks(sliced.map(fmtD),range).formatter} />
            <YAxis {...YAXIS_PROPS} />
            <ReferenceLine y={0} stroke="var(--border-2)" />
            <Tooltip content={<SqTooltip unit="TJ" />} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {sf.flatMap((f,i) => [
              <Bar key={`${f}-in`}  dataKey={`${f} inject`}   fill={PALETTE[i%PALETTE.length]}     radius={[2,2,0,0]} />,
              <Bar key={`${f}-out`} dataKey={`${f} withdraw`} fill={PALETTE[(i+5)%PALETTE.length]} radius={[2,2,0,0]} />,
            ])}
          </BarChart>
        </ResponsiveContainer>
      )}
      <RangeControls dates={dates} dateRange={range} onChange={setRange}
        sliced={sliced} windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize} sliceStart={sliceStart} />
    </div>
  )
}

// ── Production Panel ──────────────────────────────────────────────────────────
function ProductionPanel({ dates, prodByState }: { dates:string[]; prodByState:Record<string,Record<string,(number|null)[]>> }) {
  const states = Object.keys(prodByState).sort()
  const [state,  setState]  = useState(states[0] ?? 'VIC')
  const [range,  setRange]  = useState<DateRangeOption>('all')
  const [showFilter, setShowFilter] = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const { sliced, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindow(dates, range)

  useEffect(() => { if (!states.includes(state)) setState(states[0] ?? '') }, [states])
  useEffect(() => { setSelected(new Set()) }, [state])

  const allFacilities = Object.keys(prodByState[state] ?? {})
  const active = selected.size > 0 ? allFacilities.filter(f => selected.has(f)) : allFacilities
  const series = prodByState[state] ?? {}

  const rows = sliced.map((d,i) => {
    const gi = sliceStart+i
    return { date:fmtD(d), ...Object.fromEntries(active.map(f => [f, series[f]?.[gi] ?? null])) }
  })

  const toggle = (f:string) => setSelected(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n })

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
          <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>Gas Production</h3>
          <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ/day</span>
        </div>
        <div style={{ display:'flex', gap:'0.4rem' }}>
          <CsvButton onClick={() => downloadCsv(rows, `production-${state}.csv`)} />
          <button onClick={() => setShowFilter(v => !v)} style={{
            padding:'0.25rem 0.65rem', borderRadius:6,
            border: `1px solid ${showFilter ? 'var(--accent)' : 'var(--border)'}`,
            background: showFilter ? 'var(--accent-glow)' : 'transparent',
            color: showFilter ? 'var(--accent)' : 'var(--muted)',
            cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.72rem', fontWeight:500,
          }}>
            {selected.size > 0 ? `${active.length}/${allFacilities.length} shown` : 'Filter'}
          </button>
        </div>
      </div>

      {showFilter && (
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'0.65rem', marginBottom:'0.85rem' }}>
          <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.5rem' }}>
            <button onClick={() => setSelected(new Set())} style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--accent)', cursor:'pointer' }}>All</button>
            <button onClick={() => setSelected(new Set(allFacilities))} style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer' }}>None</button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', maxHeight:140, overflowY:'auto' }}>
            {allFacilities.map((f,i) => {
              const on = selected.size === 0 || selected.has(f)
              return (
                <button key={f} onClick={() => toggle(f)} style={{
                  padding:'2px 9px', borderRadius:20, border:'none', cursor:'pointer',
                  fontFamily:'var(--font-data)', fontSize:'0.65rem', fontWeight: on ? 600 : 400,
                  background: on ? PALETTE[i%PALETTE.length] : 'var(--border)',
                  color: on ? '#fff' : 'var(--muted)', transition:'all 0.1s',
                }}>{f}</button>
              )
            })}
          </div>
        </div>
      )}

      {states.length > 1 && <StateTabs states={states} active={state} onChange={setState} />}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" {...XAXIS_PROPS} ticks={smartTicks(sliced.map(fmtD),range).ticks} tickFormatter={smartTicks(sliced.map(fmtD),range).formatter} />
          <YAxis {...YAXIS_PROPS} />
          <Tooltip content={<SqTooltip unit="TJ" />} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {active.map(f => (
            <Line key={f} type="monotone" dataKey={f}
              stroke={PALETTE[allFacilities.indexOf(f) % PALETTE.length]}
              strokeWidth={1.5} dot={false} connectNulls activeDot={{r:3,strokeWidth:0}} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <RangeControls dates={dates} dateRange={range} onChange={setRange}
        sliced={sliced} windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize} sliceStart={sliceStart} />
    </div>
  )
}

// ── Pipeline Panel ────────────────────────────────────────────────────────────
function PipelinePanel({ dates, pipelineFlows }: {
  dates:string[];
  pipelineFlows: Record<string,{ flow:(number|null)[]; direction:string; nameplateCapacity:number|null; stcCapacity:number|null }>
}) {
  const pipelines = Object.keys(pipelineFlows).sort()
  const groups = [
    { label:'Interconnectors', pipes: pipelines.filter(p => ['EGP','MSP','MAPS','TGP','PCA'].includes(p)) },
    { label:'VTS',             pipes: pipelines.filter(p => p.startsWith('VTS')) },
    { label:'Queensland',      pipes: pipelines.filter(p => ['CGP','SWQP','QGP','RBP','GLNG','APLNG','WGP'].includes(p)) },
  ].filter(g => g.pipes.length > 0)

  const [activeGroup,  setActiveGroup]  = useState(groups[0]?.label ?? '')
  const [range,        setRange]        = useState<DateRangeOption>('all')
  const [showFilter,   setShowFilter]   = useState(false)
  const [hiddenPipes,  setHiddenPipes]  = useState<Set<string>>(new Set())
  const { sliced, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindow(dates, range)

  const groupPipes   = groups.find(g => g.label === activeGroup)?.pipes ?? []
  const visiblePipes = groupPipes.filter(p => !hiddenPipes.has(p))
  const latest       = Object.fromEntries(pipelines.map(p => [p, lastVal(pipelineFlows[p]?.flow ?? [])]))

  const handleGroupChange = (g: string) => { setActiveGroup(g); setHiddenPipes(new Set()); setShowFilter(false) }
  const togglePipe = (p: string) => setHiddenPipes(prev => {
    const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n
  })

  const chartRows = sliced.map((d,i) => {
    const gi = sliceStart+i
    return { date:fmtD(d), ...Object.fromEntries(visiblePipes.map(p => [p, pipelineFlows[p]?.flow[gi] ?? null])) }
  })

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
          <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>Pipeline Flows</h3>
          <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ/day · GBB</span>
        </div>
        <CsvButton onClick={() => {
          const allRows = dates.map((d, i) => ({ date: fmtD(d), ...Object.fromEntries(pipelines.map(p => [p, pipelineFlows[p]?.flow[i] ?? ''])) }))
          downloadCsv(allRows, 'pipeline-flows.csv')
        }} />
      </div>

      {/* Summary table with utilisation */}
      <div style={{ marginBottom:'1.25rem', overflowX:'auto' }}>
        <table className="sq-table">
          <thead><tr>
            <th>Pipeline</th>
            <th style={{textAlign:'right'}}>Flow (TJ/day)</th>
            <th>Direction</th>
            <th style={{textAlign:'right'}}>STC util.</th>
            <th style={{textAlign:'right'}}>Nameplate util.</th>
          </tr></thead>
          <tbody>
            {pipelines.map(p => {
              const val    = latest[p]
              const colour = PIPE_COLOURS[p] ?? 'var(--accent)'
              const np     = pipelineFlows[p]?.nameplateCapacity ?? null
              const stc    = pipelineFlows[p]?.stcCapacity       ?? null
              const npUtil = (val != null && np  != null && np  > 0) ? val / np  : null
              const stcUtil= (val != null && stc != null && stc > 0) ? val / stc : null
              const utilColour = (u: number | null) =>
                u == null ? 'var(--muted)' : u >= 0.9 ? 'var(--negative)' : u >= 0.7 ? 'var(--neutral)' : 'var(--positive)'
              return (
                <tr key={p}>
                  <td style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:colour, flexShrink:0 }} />
                    <span style={{ fontWeight:600, color:'var(--text)' }}>{p}</span>
                  </td>
                  <td style={{ textAlign:'right', fontWeight:700, color: val != null ? 'var(--accent)' : 'var(--muted)' }}>
                    {val != null ? val.toLocaleString('en-AU',{maximumFractionDigits:1}) : '—'}
                  </td>
                  <td style={{ color:'var(--text-2)' }}>→ {pipelineFlows[p]?.direction ?? '—'}</td>
                  <td style={{ textAlign:'right', fontWeight:600, color: utilColour(stcUtil) }}>
                    {stcUtil != null ? `${(stcUtil*100).toFixed(0)}%` : '—'}
                    {stc != null && <span style={{ color:'var(--muted)', fontWeight:400, fontSize:'0.6rem', marginLeft:4 }}>/{stc.toFixed(0)}</span>}
                  </td>
                  <td style={{ textAlign:'right', fontWeight:600, color: utilColour(npUtil) }}>
                    {npUtil != null ? `${(npUtil*100).toFixed(0)}%` : '—'}
                    {np != null && <span style={{ color:'var(--muted)', fontWeight:400, fontSize:'0.6rem', marginLeft:4 }}>/{np.toFixed(0)}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop:'0.4rem', display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          {(['var(--positive)','var(--neutral)','var(--negative)'] as const).map((c,i) => (
            <span key={i} style={{ display:'flex', alignItems:'center', gap:'0.3rem', fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>
              <div style={{ width:8, height:8, borderRadius:2, background:c }} />
              {i===0?'< 70%':i===1?'70–90%':'≥ 90%'}
            </span>
          ))}
        </div>
      </div>

      {/* Group tabs + filter button inline */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: showFilter ? '0.1rem' : '0.75rem' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flex:1 }}>
          {groups.map(g => {
            const isActive = g.label === activeGroup
            return (
              <button key={g.label} onClick={() => handleGroupChange(g.label)} style={{
                padding:'0.45rem 0.85rem', border:'none', background:'transparent',
                cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom:-1, transition:'all 0.15s',
              }}>{g.label}</button>
            )
          })}
        </div>
        <button onClick={() => setShowFilter(v => !v)} style={{
          marginLeft:'0.75rem', marginBottom:'1px', flexShrink:0,
          padding:'0.25rem 0.65rem', borderRadius:'var(--radius-sm)',
          border: `1px solid ${showFilter ? 'var(--accent)' : 'var(--border)'}`,
          background: showFilter ? 'var(--accent-glow)' : 'transparent',
          color: showFilter ? 'var(--accent)' : 'var(--muted)',
          cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.72rem', fontWeight:500,
        }}>
          {hiddenPipes.size > 0 ? `${visiblePipes.length}/${groupPipes.length} shown` : 'Filter'}
        </button>
      </div>

      {/* Filter pills */}
      {showFilter && (
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'0.65rem', margin:'0.5rem 0 0.85rem' }}>
          <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.5rem' }}>
            <button onClick={() => setHiddenPipes(new Set())} style={{ fontSize:'0.62rem', padding:'2px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--accent)', cursor:'pointer', fontFamily:'var(--font-data)' }}>All</button>
            <button onClick={() => setHiddenPipes(new Set(groupPipes))} style={{ fontSize:'0.62rem', padding:'2px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:'var(--font-data)' }}>None</button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
            {groupPipes.map(p => {
              const visible = !hiddenPipes.has(p)
              const colour  = PIPE_COLOURS[p] ?? 'var(--accent)'
              return (
                <button key={p} onClick={() => togglePipe(p)} style={{
                  display:'flex', alignItems:'center', gap:'0.35rem',
                  padding:'4px 10px', borderRadius:20,
                  border: `1.5px solid ${visible ? colour : 'var(--border)'}`,
                  background: visible ? colour + '18' : 'transparent',
                  color: visible ? colour : 'var(--muted)',
                  cursor:'pointer', fontFamily:'var(--font-data)', fontSize:'0.7rem', fontWeight: visible ? 600 : 400,
                  transition:'all 0.12s',
                }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background: visible ? colour : 'var(--border)', flexShrink:0 }} />
                  {p}
                  <span style={{ fontWeight:400, fontSize:'0.6rem', opacity:0.75 }}>→ {pipelineFlows[p]?.direction}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Direction badges for visible pipes (when filter not open) */}
      {!showFilter && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginBottom:'0.85rem' }}>
          {visiblePipes.map(p => (
            <div key={p} style={{
              display:'flex', alignItems:'center', gap:'0.3rem',
              background:'var(--surface-2)', border:'1px solid var(--border)',
              borderRadius:5, padding:'2px 8px',
              fontFamily:'var(--font-data)', fontSize:'0.65rem',
            }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:PIPE_COLOURS[p] ?? 'var(--accent)', flexShrink:0 }} />
              <span style={{ color:'var(--text)', fontWeight:600 }}>{p}</span>
              <span style={{ color:'var(--muted)' }}>→ {pipelineFlows[p]?.direction}</span>
            </div>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartRows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" {...XAXIS_PROPS} ticks={smartTicks(sliced.map(fmtD),range).ticks} tickFormatter={smartTicks(sliced.map(fmtD),range).formatter} />
          <YAxis {...YAXIS_PROPS} />
          <Tooltip content={<SqTooltip unit="TJ" />} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {visiblePipes.map(p => (
            <Line key={p} type="monotone" dataKey={p}
              stroke={PIPE_COLOURS[p] ?? 'var(--accent)'} strokeWidth={2}
              dot={false} connectNulls activeDot={{r:3,strokeWidth:0}} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Nameplate utilisation chart */}
      {visiblePipes.some(p => pipelineFlows[p]?.nameplateCapacity != null) && (() => {
        const utilRows = sliced.map((d, i) => {
          const gi = sliceStart + i
          const row: Record<string, any> = { date: fmtD(d) }
          visiblePipes.forEach(p => {
            const cap = pipelineFlows[p]?.nameplateCapacity
            const flow = pipelineFlows[p]?.flow[gi]
            row[p] = (cap != null && cap > 0 && flow != null) ? Math.round((flow / cap) * 1000) / 10 : null
          })
          return row
        })
        return (
          <div style={{ marginTop:'1.25rem', paddingTop:'1.25rem', borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem' }}>
              <span style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--text)' }}>Nameplate Capacity Utilisation</span>
              <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>%</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={utilRows} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" {...XAXIS_PROPS} ticks={smartTicks(sliced.map(fmtD),range).ticks} tickFormatter={smartTicks(sliced.map(fmtD),range).formatter} />
                <YAxis {...YAXIS_PROPS} domain={[0, 110]} tickFormatter={v => `${v}%`} width={42} />
                <ReferenceLine y={100} stroke="var(--negative)" strokeDasharray="4 2" strokeWidth={1.5} label={{ value:'100%', position:'insideTopRight', fontSize:9, fill:'var(--negative)', fontFamily:'var(--font-data)' }} />
                <ReferenceLine y={70}  stroke="var(--neutral)"  strokeDasharray="4 2" strokeWidth={1}   label={{ value:'70%',  position:'insideTopRight', fontSize:9, fill:'var(--neutral)',  fontFamily:'var(--font-data)' }} />
                <Tooltip content={<SqTooltip unit="%" />} />
                <Legend wrapperStyle={LEGEND_STYLE} />
                {visiblePipes.filter(p => pipelineFlows[p]?.nameplateCapacity != null).map(p => (
                  <Line key={p} type="monotone" dataKey={p}
                    stroke={PIPE_COLOURS[p] ?? 'var(--accent)'} strokeWidth={2}
                    dot={false} connectNulls activeDot={{r:3,strokeWidth:0}} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      <RangeControls dates={dates} dateRange={range} onChange={setRange}
        sliced={sliced} windowEnd={windowEnd} setWindowEnd={setWindowEnd} windowSize={windowSize} sliceStart={sliceStart} />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GbbDashboard() {
  const { data, loading, error, fetchedAt, fetch: fetchData } = useGbbData()

  useEffect(() => { fetchData() }, [])

  const lastFetched = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' })
    : null

  // Format the most recent GBB date for display
  const latestGbbDate = useMemo(() => {
    if (!data?.dates?.length) return null
    const d = data.dates[data.dates.length - 1] // format: YYYY-MM-DD
    const [yyyy, mm, dd] = d.split('-')
    return `${dd}/${mm}/${yyyy}`
  }, [data])

  if (loading && !data) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4rem 0', gap:'1rem' }}>
      <div style={{ width:28, height:28, border:'2px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Fetching GBB data…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (error) return (
    <div className="sq-card" style={{ padding:'1.5rem', color:'var(--negative)', fontFamily:'var(--font-data)', fontSize:'0.78rem' }}>
      GBB Error: {error}
    </div>
  )
  if (!data) return null

  return (
    <div>
      {/* Date + fetch time banner */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background:'var(--surface-2)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-sm)', padding:'0.4rem 0.85rem',
        marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'0.04em', textTransform:'uppercase' }}>
            Most recent data:
          </span>
          {latestGbbDate ? (
            <span style={{ fontFamily:'var(--font-data)', fontSize:'0.68rem', fontWeight:600, color:'var(--accent)' }}>
              {latestGbbDate}
            </span>
          ) : (
            <span style={{ fontFamily:'var(--font-data)', fontSize:'0.68rem', color:'var(--muted)' }}>—</span>
          )}
        </div>
        {lastFetched && (
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>
            Fetched {lastFetched}
          </span>
        )}
      </div>
      <GpgPanel        dates={data.dates} gpgByState={data.gpgByState} largeByState={data.largeByState ?? {}} />
      <StoragePanel    dates={data.dates} storageByFacility={data.storageByFacility} />
      <ProductionPanel dates={data.dates} prodByState={data.prodByState} />
      <PipelinePanel   dates={data.dates} pipelineFlows={data.pipelineFlows} />
    </div>
  )
}
