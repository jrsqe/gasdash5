'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useGbbData } from './MainDashboard'

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = [
  '#00B4A0','#3DDC84','#7B9FF9','#FF6B35','#E8425A',
  '#00D4FF','#A8E063','#FFB347','#CF9FFF','#FF6B9D',
  '#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD',
]
const PIPE_COLOURS: Record<string,string> = {
  EGP:'#7B9FF9', MSP:'#00B4A0', MAPS:'#FF6B35', CGP:'#CF9FFF', SWQP:'#E8425A',
  QGP:'#00D4FF', RBP:'#A8E063', 'VTS-LMP':'#FFB347', 'VTS-SWP':'#FF6B9D', 'VTS-VNI':'#4ECDC4',
  TGP:'#96CEB4', PCA:'#FFEAA7',
}
const STATE_COLOURS: Record<string,string> = { NSW:'#7B9FF9', VIC:'#00B4A0', SA:'#FF6B35', QLD:'#CF9FFF', TAS:'#E8425A' }

// ── Types ─────────────────────────────────────────────────────────────────────
interface GbbData {
  dates: string[]
  gpgByState:   Record<string, Record<string,(number|null)[]>>
  prodByState:  Record<string, Record<string,(number|null)[]>>
  storageByFacility: Record<string, { state:string; heldInStorage:(number|null)[]; supply:(number|null)[]; demand:(number|null)[] }>
  pipelineFlows: Record<string, { flow:(number|null)[]; direction:string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt1 = (v: number|null|undefined) =>
  v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits:1, maximumFractionDigits:1 })
const fmt0 = (v: number|null|undefined) =>
  v == null ? '—' : v.toLocaleString('en-AU', { maximumFractionDigits:0 })

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
      background:'var(--sq-surface)', border:'1px solid var(--sq-border)',
      borderRadius:8, padding:'0.65rem 0.9rem',
      fontFamily:'var(--font-data)', fontSize:'0.75rem',
      minWidth:190, boxShadow:'0 4px 16px rgba(13,27,42,0.12)',
    }}>
      <div style={{ color:'var(--sq-muted)', marginBottom:'0.4rem', fontSize:'0.62rem', letterSpacing:'0.04em' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:'1.25rem', marginBottom:2 }}>
          <span style={{ color: p.color ?? p.fill }}>{p.name}</span>
          <span style={{ color:'var(--sq-text)', fontWeight:600 }}>{fmt1(p.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}

function StateTabs({ states, active, onChange }: { states:string[]; active:string; onChange:(s:string)=>void }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--sq-border)', marginBottom:'1rem' }}>
      {states.map(s => {
        const isActive = s === active
        const c = STATE_COLOURS[s] ?? 'var(--sq-teal)'
        return (
          <button key={s} onClick={() => onChange(s)} style={{
            padding:'0.45rem 0.85rem', border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? c : 'var(--sq-muted)',
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
    <div style={{ display:'flex', borderBottom:'1px solid var(--sq-border)', marginBottom:'1rem' }}>
      {groups.map(g => {
        const isActive = g === active
        return (
          <button key={g} onClick={() => onChange(g)} style={{
            padding:'0.45rem 0.85rem', border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--sq-teal)' : 'var(--sq-muted)',
            borderBottom: isActive ? '2px solid var(--sq-teal)' : '2px solid transparent',
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
      {label && <span style={{ color:'var(--sq-muted)', fontSize:'0.62rem', fontFamily:'var(--font-data)', whiteSpace:'nowrap', letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</span>}
      <div style={{ display:'flex', background:'var(--sq-surface-2)', border:'1px solid var(--sq-border)', borderRadius:8, padding:2, gap:2 }}>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{
              padding:'0.25rem 0.65rem', borderRadius:6, border:'none', cursor:'pointer',
              fontFamily:'var(--font-ui)', fontSize:'0.72rem', fontWeight: active ? 600 : 400,
              background: active ? 'var(--sq-teal)' : 'transparent',
              color: active ? '#fff' : 'var(--sq-muted)', transition:'all 0.15s',
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
        <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--sq-muted)' }}>{firstLabel}</span>
        <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--sq-teal)', background:'var(--sq-surface-2)', border:'1px solid var(--sq-border)', padding:'1px 7px', borderRadius:4, fontWeight:600 }}>
          {windowStartLabel} → {windowEndLabel}
        </span>
        <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--sq-muted)' }}>{lastLabel}</span>
      </div>
      <div style={{ position:'relative', height:22, display:'flex', alignItems:'center' }}>
        <div style={{ position:'absolute', left:0, right:0, height:4, background:'var(--sq-surface-2)', border:'1px solid var(--sq-border)', borderRadius:2 }} />
        <div style={{
          position:'absolute',
          left: `${((windowEnd-windowSize+1)/(totalRows-1))*100}%`,
          right:`${((totalRows-1-windowEnd)/(totalRows-1))*100}%`,
          height:4, background:'var(--sq-teal)', borderRadius:2, opacity:0.8, transition:'left 0.08s, right 0.08s',
        }} />
        <input type="range" min={min} max={max} value={windowEnd} onChange={e => onChange(Number(e.target.value))}
          style={{ position:'absolute', left:0, right:0, width:'100%', opacity:0, cursor:'pointer', height:22, margin:0 }} />
        <div style={{
          position:'absolute', left:`calc(${((windowEnd-min)/(max-min))*100}% - 6px)`,
          width:12, height:12, borderRadius:'50%',
          background:'var(--sq-surface)', border:'2px solid var(--sq-teal)',
          boxShadow:'0 0 6px var(--sq-teal-glow)', pointerEvents:'none', transition:'left 0.08s',
        }} />
      </div>
    </div>
  )
}

function RangeControls({ dates, dateRange, onChange, sliced, windowEnd, setWindowEnd, windowSize, sliceStart }: any) {
  const fmtL = (d: string) => { const [,mm,dd] = d.split('-'); return `${dd}/${mm}` }
  return (
    <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--sq-border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
        <PillGroup options={DATE_RANGE_OPTIONS} value={dateRange} onChange={onChange} label="View" />
        {dateRange !== 'all' && (
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--sq-muted)' }}>
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

const XAXIS_PROPS = {
  tick:{ fill:'var(--sq-muted)', fontSize:9, fontFamily:'var(--font-data)' },
  tickLine:false, axisLine:{ stroke:'var(--sq-border)' }, interval:'preserveStartEnd' as const,
}
const YAXIS_PROPS = {
  tick:{ fill:'var(--sq-muted)', fontSize:9, fontFamily:'var(--font-data)' },
  tickLine:false, axisLine:false, width:52,
}
const LEGEND_STYLE = { fontSize:'0.65rem', fontFamily:'var(--font-data)', paddingTop:'0.4rem', color:'var(--sq-text-2)' }
const CHART_MARGIN = { top:4, right:12, left:0, bottom:4 }

// ── GPG Panel ─────────────────────────────────────────────────────────────────
function GpgPanel({ dates, gpgByState }: { dates:string[]; gpgByState: Record<string, Record<string,(number|null)[]>> }) {
  const states = Object.keys(gpgByState).sort()
  const [state, setState]   = useState(states[0] ?? 'NSW')
  const [range, setRange]   = useState<DateRangeOption>('all')
  const { sliced, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindow(dates, range)

  useEffect(() => { if (!states.includes(state)) setState(states[0] ?? '') }, [states])

  const facilities = Object.keys(gpgByState[state] ?? {})
  const series     = gpgByState[state] ?? {}

  const rows = sliced.map((d,i) => {
    const gi = sliceStart+i
    return { date: fmtD(d), ...Object.fromEntries(facilities.map(f => [f, series[f]?.[gi] ?? null])) }
  })

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'1rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--sq-text)', margin:0 }}>GPG Gas Demand</h3>
        <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ/day</span>
      </div>
      {states.length > 1 && <StateTabs states={states} active={state} onChange={setState} />}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sq-border)" />
          <XAxis dataKey="date" {...XAXIS_PROPS} />
          <YAxis {...YAXIS_PROPS} />
          <Tooltip content={<SqTooltip unit="TJ" />} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {facilities.map((f,i) => (
            <Bar key={f} dataKey={f} stackId="g" fill={PALETTE[i%PALETTE.length]}
              radius={i === facilities.length-1 ? [2,2,0,0] : [0,0,0,0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
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
        <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem' }}>
          <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--sq-text)', margin:0 }}>Gas Storage</h3>
          <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ</span>
        </div>
        <PillGroup
          options={[{value:'level',label:'Level'},{value:'flow',label:'Inject/Withdraw'}] as {value:'level'|'flow';label:string}[]}
          value={metric} onChange={setMetric} />
      </div>
      {stateGroups.length > 1 && <StateTabs states={stateGroups} active={state} onChange={setState} />}
      {metric === 'level' ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={levelRows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--sq-border)" />
            <XAxis dataKey="date" {...XAXIS_PROPS} />
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--sq-border)" />
            <XAxis dataKey="date" {...XAXIS_PROPS} />
            <YAxis {...YAXIS_PROPS} />
            <ReferenceLine y={0} stroke="var(--sq-border-2)" />
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
          <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--sq-text)', margin:0 }}>Gas Production</h3>
          <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ/day</span>
        </div>
        <button onClick={() => setShowFilter(v => !v)} style={{
          padding:'0.25rem 0.65rem', borderRadius:6,
          border: `1px solid ${showFilter ? 'var(--sq-teal)' : 'var(--sq-border)'}`,
          background: showFilter ? 'var(--sq-teal-glow)' : 'transparent',
          color: showFilter ? 'var(--sq-teal)' : 'var(--sq-muted)',
          cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.72rem', fontWeight:500,
        }}>
          {selected.size > 0 ? `${active.length}/${allFacilities.length} shown` : 'Filter'}
        </button>
      </div>

      {showFilter && (
        <div style={{ background:'var(--sq-surface-2)', border:'1px solid var(--sq-border)', borderRadius:8, padding:'0.65rem', marginBottom:'0.85rem' }}>
          <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.5rem' }}>
            <button onClick={() => setSelected(new Set())} style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:4, border:'1px solid var(--sq-border)', background:'transparent', color:'var(--sq-teal)', cursor:'pointer' }}>All</button>
            <button onClick={() => setSelected(new Set(allFacilities))} style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:4, border:'1px solid var(--sq-border)', background:'transparent', color:'var(--sq-muted)', cursor:'pointer' }}>None</button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', maxHeight:140, overflowY:'auto' }}>
            {allFacilities.map((f,i) => {
              const on = selected.size === 0 || selected.has(f)
              return (
                <button key={f} onClick={() => toggle(f)} style={{
                  padding:'2px 9px', borderRadius:20, border:'none', cursor:'pointer',
                  fontFamily:'var(--font-data)', fontSize:'0.65rem', fontWeight: on ? 600 : 400,
                  background: on ? PALETTE[i%PALETTE.length] : 'var(--sq-border)',
                  color: on ? '#fff' : 'var(--sq-muted)', transition:'all 0.1s',
                }}>{f}</button>
              )
            })}
          </div>
        </div>
      )}

      {states.length > 1 && <StateTabs states={states} active={state} onChange={setState} />}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sq-border)" />
          <XAxis dataKey="date" {...XAXIS_PROPS} />
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
  pipelineFlows: Record<string,{ flow:(number|null)[]; direction:string }>
}) {
  const pipelines = Object.keys(pipelineFlows).sort()
  const groups = [
    { label:'Interconnectors', pipes: pipelines.filter(p => ['EGP','MSP','MAPS','TGP','PCA'].includes(p)) },
    { label:'VTS',             pipes: pipelines.filter(p => p.startsWith('VTS')) },
    { label:'Queensland',      pipes: pipelines.filter(p => ['CGP','SWQP','QGP','RBP'].includes(p)) },
  ].filter(g => g.pipes.length > 0)

  const [activeGroup, setActiveGroup] = useState(groups[0]?.label ?? '')
  const [range, setRange] = useState<DateRangeOption>('all')
  const { sliced, sliceStart, windowEnd, setWindowEnd, windowSize } = useWindow(dates, range)

  const activePipes = groups.find(g => g.label === activeGroup)?.pipes ?? []

  const chartRows = sliced.map((d,i) => {
    const gi = sliceStart+i
    return { date:fmtD(d), ...Object.fromEntries(activePipes.map(p => [p, pipelineFlows[p]?.flow[gi] ?? null])) }
  })

  const latest = Object.fromEntries(pipelines.map(p => [p, lastVal(pipelineFlows[p]?.flow ?? [])]))

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'1.25rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--sq-text)', margin:0 }}>Pipeline Flows</h3>
        <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>TJ/day · GBB</span>
      </div>

      {/* Summary table */}
      <div style={{ marginBottom:'1.25rem', overflowX:'auto' }}>
        <table className="sq-table">
          <thead><tr>
            <th>Pipeline</th>
            <th style={{textAlign:'right'}}>Flow (TJ/day)</th>
            <th>Direction</th>
          </tr></thead>
          <tbody>
            {pipelines.map(p => {
              const val = latest[p]
              const colour = PIPE_COLOURS[p] ?? 'var(--sq-teal)'
              return (
                <tr key={p}>
                  <td style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:colour, boxShadow:`0 0 4px ${colour}`, flexShrink:0 }} />
                    <span style={{ fontWeight:600, color:'var(--sq-text)' }}>{p}</span>
                  </td>
                  <td style={{ textAlign:'right', fontWeight:700, color: val != null ? 'var(--sq-teal)' : 'var(--sq-muted)' }}>
                    {val != null ? val.toLocaleString('en-AU',{maximumFractionDigits:1}) : '—'}
                  </td>
                  <td style={{ color:'var(--sq-text-2)' }}>→ {pipelineFlows[p]?.direction ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <GroupTabs groups={groups.map(g => g.label)} active={activeGroup} onChange={setActiveGroup} />

      {/* Direction badges */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginBottom:'0.85rem' }}>
        {activePipes.map(p => (
          <div key={p} style={{
            display:'flex', alignItems:'center', gap:'0.3rem',
            background:'var(--sq-surface-2)', border:`1px solid ${PIPE_COLOURS[p] ?? 'var(--sq-border)'}`,
            borderRadius:5, padding:'2px 8px',
            fontFamily:'var(--font-data)', fontSize:'0.65rem',
          }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:PIPE_COLOURS[p] ?? 'var(--sq-teal)' }} />
            <span style={{ color:'var(--sq-text)', fontWeight:600 }}>{p}</span>
            <span style={{ color:'var(--sq-muted)' }}>→ {pipelineFlows[p]?.direction}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartRows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sq-border)" />
          <XAxis dataKey="date" {...XAXIS_PROPS} />
          <YAxis {...YAXIS_PROPS} />
          <Tooltip content={<SqTooltip unit="TJ" />} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {activePipes.map(p => (
            <Line key={p} type="monotone" dataKey={p}
              stroke={PIPE_COLOURS[p] ?? 'var(--sq-teal)'} strokeWidth={1.75}
              dot={false} connectNulls activeDot={{r:3,strokeWidth:0}} />
          ))}
        </LineChart>
      </ResponsiveContainer>
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

  if (loading && !data) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4rem 0', gap:'1rem' }}>
      <div style={{ width:28, height:28, border:'2px solid var(--sq-border)', borderTopColor:'var(--sq-teal)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <span style={{ color:'var(--sq-muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Fetching GBB data…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (error) return (
    <div className="sq-card" style={{ padding:'1.5rem', color:'var(--sq-red)', fontFamily:'var(--font-data)', fontSize:'0.78rem' }}>
      GBB Error: {error}
    </div>
  )
  if (!data) return null

  return (
    <div>
      {lastFetched && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'0.75rem' }}>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--sq-muted)' }}>
            Updated {lastFetched}
          </span>
        </div>
      )}
      <GpgPanel        dates={data.dates} gpgByState={data.gpgByState} />
      <StoragePanel    dates={data.dates} storageByFacility={data.storageByFacility} />
      <ProductionPanel dates={data.dates} prodByState={data.prodByState} />
      <PipelinePanel   dates={data.dates} pipelineFlows={data.pipelineFlows} />
    </div>
  )
}
