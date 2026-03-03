'use client'

import { useState, useEffect, useMemo } from 'react'
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
const PRICE_COLOUR = '#E07B2A'

const STATE_COLOURS: Record<string, string> = {
  NSW: '#1D6FD4', VIC: '#00A878', SA: '#E07B2A', QLD: '#9B3FCF',
}

const PALETTE = [
  '#1D6FD4','#00A878','#E07B2A','#9B3FCF','#D4281D',
  '#0891B2','#65A30D','#B45309','#6D28D9','#0E7490',
  '#4D7C0F','#92400E','#5B21B6','#BE185D','#0369A1',
]

const PIPE_COLOURS: Record<string, string> = {
  'EGP':     '#1D6FD4',
  'MSP':     '#00A878',
  'MAPS':    '#E07B2A',
  'CGP':     '#9B3FCF',
  'SWQP':    '#D4281D',
  'QGP':     '#0891B2',
  'RBP':     '#65A30D',
  'VTS-LMP': '#B45309',
  'VTS-SWP': '#6D28D9',
  'VTS-VNI': '#0E7490',
  'TGP':     '#4D7C0F',
  'PCA':     '#92400E',
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface GbbTimeseries {
  dates: string[]
  gpgByState:   Record<string, Record<string, number[]>>
  prodByState:  Record<string, Record<string, number[]>>
  storageByFacility: Record<string, { state: string; heldInStorage: (number|null)[]; supply: (number|null)[]; demand: (number|null)[] }>
  pipelineFlows: Record<string, { flow: number[]; direction: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt1 = (v: number | null) => v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmt0 = (v: number | null) => v == null ? '—' : v.toLocaleString('en-AU', { maximumFractionDigits: 0 })

function fmtDate(d: string) {
  const [, mm, dd] = d.split('-')
  return `${dd}/${mm}`
}

// Build recharts-friendly rows from parallel arrays
function buildRows(dates: string[], series: Record<string, (number|null)[]>) {
  return dates.map((d, i) => ({
    date: fmtDate(d),
    rawDate: d,
    ...Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v[i] ?? null])),
  }))
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function GbbTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '0.75rem 1rem', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace',
      minWidth: 200, boxShadow: '0 4px 16px rgba(11,31,58,0.10)',
    }}>
      <div style={{ color: MUTED, marginBottom: '0.5rem', fontSize: '0.68rem', fontWeight: 500 }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: 3 }}>
          <span style={{ color: p.color ?? p.fill, fontWeight: 500 }}>{p.name}</span>
          <span style={{ color: NAVY, fontWeight: 600 }}>{fmt1(p.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', color: NAVY, margin: 0 }}>{title}</h3>
      {sub && <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>{sub}</span>}
    </div>
  )
}

// ── State tab bar ─────────────────────────────────────────────────────────────
function StateTabs({ states, active, onChange }: { states: string[]; active: string; onChange: (s: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: '1.25rem' }}>
      {states.map(s => {
        const isActive = s === active
        const colour = STATE_COLOURS[s] ?? NAVY
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

// ── GPG Demand panel ──────────────────────────────────────────────────────────
function GpgPanel({ dates, gpgByState }: { dates: string[]; gpgByState: Record<string, Record<string, number[]>> }) {
  const states = Object.keys(gpgByState).sort()
  const [activeState, setActiveState] = useState(states[0] ?? 'NSW')

  const facilities = Object.keys(gpgByState[activeState] ?? {})
  const series: Record<string, (number|null)[]> = gpgByState[activeState] ?? {}
  const rows = buildRows(dates, series)

  // Total GPG per date for this state
  const totalSeries: Record<string, (number|null)[]> = {
    'Total GPG': dates.map((_, i) =>
      facilities.reduce((s, f) => s + (series[f]?.[i] ?? 0), 0)
    )
  }
  const totalRows = buildRows(dates, totalSeries)

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <SectionHeader title="GPG Gas Demand" sub="TJ/day · by facility" />
      {states.length > 1 && <StateTabs states={states} active={activeState} onChange={setActiveState} />}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={48} tickFormatter={v => `${v}`} />
          <Tooltip content={<GbbTooltip unit="TJ" />} />
          <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
          {facilities.map((f, i) => (
            <Bar key={f} dataKey={f} stackId="gpg" fill={PALETTE[i % PALETTE.length]} radius={i === facilities.length - 1 ? [2, 2, 0, 0] : [0,0,0,0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Production panel ──────────────────────────────────────────────────────────
function ProductionPanel({ dates, prodByState }: { dates: string[]; prodByState: Record<string, Record<string, number[]>> }) {
  const states = Object.keys(prodByState).sort()
  const [activeState, setActiveState] = useState(states[0] ?? 'VIC')

  const facilities = Object.keys(prodByState[activeState] ?? {})
  const series: Record<string, (number|null)[]> = prodByState[activeState] ?? {}
  const rows = buildRows(dates, series)

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <SectionHeader title="Gas Production" sub="TJ/day · major facilities" />
      {states.length > 1 && <StateTabs states={states} active={activeState} onChange={setActiveState} />}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<GbbTooltip unit="TJ" />} />
          <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
          {facilities.map((f, i) => (
            <Line key={f} type="monotone" dataKey={f}
              stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.75}
              dot={false} connectNulls activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Storage panel ─────────────────────────────────────────────────────────────
function StoragePanel({ dates, storageByFacility }: {
  dates: string[]
  storageByFacility: Record<string, { state: string; heldInStorage: (number|null)[]; supply: (number|null)[]; demand: (number|null)[] }>
}) {
  const facilities = Object.keys(storageByFacility).sort()
  const stateOf = (f: string) => storageByFacility[f]?.state ?? ''
  const stateGroups = ['NSW', 'VIC', 'SA'].filter(s => facilities.some(f => stateOf(f) === s))
  const [activeState, setActiveState] = useState(stateGroups[0] ?? 'VIC')
  const [activeMetric, setActiveMetric] = useState<'level' | 'flow'>('level')

  const stateFacilities = facilities.filter(f => stateOf(f) === activeState)

  // For storage level chart
  const levelSeries: Record<string, (number|null)[]> = {}
  const flowRows = dates.map((d, i) => {
    const row: Record<string, any> = { date: fmtDate(d), rawDate: d }
    for (const f of stateFacilities) {
      const s = storageByFacility[f]
      levelSeries[f] = s.heldInStorage
      row[`${f} (inject)`] = s.demand?.[i] ?? null
      row[`${f} (withdraw)`] = s.supply?.[i] ?? null
    }
    return row
  })
  const levelRows = buildRows(dates, levelSeries)

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <SectionHeader title="Gas Storage" sub="TJ" />
        <div style={{ display: 'flex', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 2, gap: 2 }}>
          {(['level', 'flow'] as const).map(m => (
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
            <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={52} tickFormatter={v => `${fmt0(v)}`} />
            <Tooltip content={<GbbTooltip unit="TJ" />} />
            <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
            {stateFacilities.map((f, i) => (
              <Line key={f} type="monotone" dataKey={f}
                stroke={PALETTE[i % PALETTE.length]} strokeWidth={2}
                dot={false} connectNulls activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={flowRows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} />
            <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={52} />
            <ReferenceLine y={0} stroke={BORDER} />
            <Tooltip content={<GbbTooltip unit="TJ" />} />
            <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
            {stateFacilities.flatMap((f, i) => [
              <Bar key={`${f}-in`}  dataKey={`${f} (inject)`}    fill={PALETTE[i % PALETTE.length]}        radius={[2,2,0,0]} />,
              <Bar key={`${f}-out`} dataKey={`${f} (withdraw)`}  fill={PALETTE[(i+5) % PALETTE.length]}    radius={[2,2,0,0]} />,
            ])}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Pipeline flows panel ──────────────────────────────────────────────────────
function PipelinePanel({ dates, pipelineFlows }: {
  dates: string[]
  pipelineFlows: Record<string, { flow: number[]; direction: string }>
}) {
  const pipelines = Object.keys(pipelineFlows).sort()

  // Group into East-Coast pipelines
  const vts   = pipelines.filter(p => p.startsWith('VTS'))
  const qld   = pipelines.filter(p => ['CGP','SWQP','QGP','RBP'].includes(p))
  const inter = pipelines.filter(p => ['EGP','MSP','MAPS','TGP','PCA'].includes(p))

  const groups = [
    { label: 'Interconnectors', pipes: inter },
    { label: 'Victorian Transmission', pipes: vts },
    { label: 'Queensland', pipes: qld },
  ].filter(g => g.pipes.length > 0)

  const [activeGroup, setActiveGroup] = useState(groups[0]?.label ?? '')
  const activePipes = groups.find(g => g.label === activeGroup)?.pipes ?? []

  const series: Record<string, (number|null)[]> = {}
  for (const p of activePipes) series[p] = pipelineFlows[p]?.flow ?? []
  const rows = buildRows(dates, series)

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <SectionHeader title="Pipeline Flows" sub="TJ/day · GBB system" />

      {/* Direction legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {activePipes.map(p => (
          <div key={p} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: SURFACE2, border: `1px solid ${BORDER}`,
            borderRadius: 6, padding: '2px 8px',
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
        <LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={{ stroke: BORDER }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }} tickLine={false} axisLine={false} width={52} tickFormatter={v => `${v}`} />
          <Tooltip content={<GbbTooltip unit="TJ" />} />
          <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.5rem' }} />
          {activePipes.map(p => (
            <Line key={p} type="monotone" dataKey={p}
              stroke={PIPE_COLOURS[p] ?? NAVY} strokeWidth={1.75}
              dot={false} connectNulls activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main GBB Dashboard ────────────────────────────────────────────────────────
export default function GbbDashboard() {
  const [data,    setData]    = useState<GbbTimeseries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/gbb')
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error)
        setData(j.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '1rem' }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: TEAL, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.8rem' }}>Fetching GBB data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
      <GpgPanel      dates={data.dates} gpgByState={data.gpgByState} />
      <ProductionPanel dates={data.dates} prodByState={data.prodByState} />
      <StoragePanel  dates={data.dates} storageByFacility={data.storageByFacility} />
      <PipelinePanel dates={data.dates} pipelineFlows={data.pipelineFlows} />
    </div>
  )
}
