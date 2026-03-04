'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'
import { useElecData } from './MainDashboard'

// ── Classification constants ──────────────────────────────────────────────────
const PEAK_MAX     = 5
const EXT_PEAK_MAX = 13

type RunClass = 'peak' | 'extended' | 'baseload' | 'none'

const CLASS_COLOURS: Record<RunClass, string> = {
  baseload: '#1B3A5C',
  extended: '#3D6A96',
  peak:     '#7AAED0',
  none:     '#D6E8F5',
}
const CLASS_LABELS: Record<RunClass, string> = {
  baseload: 'Baseload (≥ 13h)',
  extended: 'Extended peak (5–13h)',
  peak:     'Peak (< 5h)',
  none:     'No generation',
}

// ── Classification ────────────────────────────────────────────────────────────
function classifyHours(values: (number | null)[]): RunClass[] {
  const n = values.length
  const result: RunClass[] = new Array(n).fill('none')
  let i = 0
  while (i < n) {
    const val = values[i]
    if (val == null || val <= 0) { i++; continue }
    let j = i
    while (j < n && (values[j] ?? 0) > 0) j++
    const runLen = j - i
    const cls: RunClass = runLen < PEAK_MAX ? 'peak' : runLen < EXT_PEAK_MAX ? 'extended' : 'baseload'
    for (let k = i; k < j; k++) result[k] = cls
    i = j
  }
  return result
}

function weekLabel(dt: Date): string {
  const d = new Date(dt)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}
function weekStart(dt: Date): Date {
  const d = new Date(dt)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

interface WeekData {
  week: string; weekStart: Date
  none: number; peak: number; extended: number; baseload: number; totalHours: number
}

// ── Build weekly profile for a single facility ────────────────────────────────
function buildUnitProfile(rows: { datetime: string; [k: string]: any }[], facility: string): WeekData[] {
  if (!rows.length) return []
  const values = rows.map(r => { const v = r[facility]; return (v != null && !isNaN(v)) ? (v as number) : null })
  const classes = classifyHours(values)
  const weekMap = new Map<string, { counts: Record<RunClass, number>; ws: Date }>()
  for (let i = 0; i < rows.length; i++) {
    const dt = new Date(rows[i].datetime), cls = classes[i], wk = weekLabel(dt)
    if (!weekMap.has(wk)) weekMap.set(wk, { counts: { none:0, peak:0, extended:0, baseload:0 }, ws: weekStart(dt) })
    weekMap.get(wk)!.counts[cls]++
  }
  return Array.from(weekMap.entries()).map(([week, { counts, ws }]) => {
    const total = counts.none + counts.peak + counts.extended + counts.baseload
    return { week, weekStart: ws,
      none:     total > 0 ? Math.round(counts.none     / total * 1000) / 10 : 0,
      peak:     total > 0 ? Math.round(counts.peak     / total * 1000) / 10 : 0,
      extended: total > 0 ? Math.round(counts.extended / total * 1000) / 10 : 0,
      baseload: total > 0 ? Math.round(counts.baseload / total * 1000) / 10 : 0,
      totalHours: total }
  }).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

// ── Build aggregate profile across facilities ─────────────────────────────────
function buildAggregateProfile(rows: { datetime: string; [k: string]: any }[], facilities: string[]): WeekData[] {
  if (!rows.length || !facilities.length) return []
  const weekMap = new Map<string, { counts: Record<RunClass, number>; ws: Date }>()
  for (const fac of facilities) {
    const values = rows.map(r => { const v = r[fac]; return (v != null && !isNaN(v)) ? (v as number) : null })
    const classes = classifyHours(values)
    for (let i = 0; i < rows.length; i++) {
      const dt = new Date(rows[i].datetime), cls = classes[i], wk = weekLabel(dt)
      if (!weekMap.has(wk)) weekMap.set(wk, { counts: { none:0, peak:0, extended:0, baseload:0 }, ws: weekStart(dt) })
      weekMap.get(wk)!.counts[cls]++
    }
  }
  return Array.from(weekMap.entries()).map(([week, { counts, ws }]) => {
    const total = counts.none + counts.peak + counts.extended + counts.baseload
    return { week, weekStart: ws,
      none:     total > 0 ? Math.round(counts.none     / total * 1000) / 10 : 0,
      peak:     total > 0 ? Math.round(counts.peak     / total * 1000) / 10 : 0,
      extended: total > 0 ? Math.round(counts.extended / total * 1000) / 10 : 0,
      baseload: total > 0 ? Math.round(counts.baseload / total * 1000) / 10 : 0,
      totalHours: total }
  }).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ProfileTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as WeekData
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6,
      padding:'0.65rem 0.85rem', fontFamily:'var(--font-data)', fontSize:'0.72rem',
      boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight:700, color:'var(--text)', marginBottom:'0.3rem' }}>Week of {label}</div>
      <div style={{ color:'var(--muted)', fontSize:'0.6rem', marginBottom:'0.4rem' }}>{data?.totalHours} unit-hours</div>
      {(['baseload','extended','peak','none'] as RunClass[]).map(cls => (
        <div key={cls} style={{ display:'flex', justifyContent:'space-between', gap:'1.5rem', marginBottom:2 }}>
          <span style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:CLASS_COLOURS[cls], flexShrink:0 }} />
            <span style={{ color:'var(--text-2)' }}>{CLASS_LABELS[cls]}</span>
          </span>
          <span style={{ fontWeight:600, color:'var(--text)' }}>
            {(payload.find((p: any) => p.dataKey === cls)?.value ?? 0).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Shared chart ──────────────────────────────────────────────────────────────
function ProfileChart({ weeklyData, height = 220 }: { weeklyData: WeekData[]; height?: number }) {
  const tickInterval = Math.max(0, Math.floor(weeklyData.length / 8) - 1)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={weeklyData} margin={{ top:4, right:16, left:0, bottom:55 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="week"
          tick={{ fontFamily:'var(--font-data)', fontSize:9, fill:'var(--muted)' }}
          angle={-45} textAnchor="end" interval={tickInterval}
          tickLine={false} axisLine={{ stroke:'var(--border)' }} />
        <YAxis tickFormatter={v => `${v}%`} domain={[0,100]}
          tick={{ fontFamily:'var(--font-data)', fontSize:9, fill:'var(--muted)' }}
          tickLine={false} axisLine={false} width={38} />
        <Tooltip content={<ProfileTooltip />} />
        <Legend formatter={(v) => CLASS_LABELS[v as RunClass]}
          wrapperStyle={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', paddingTop:'0.25rem' }} />
        <Bar dataKey="baseload" stackId="a" fill={CLASS_COLOURS.baseload} name="baseload" />
        <Bar dataKey="extended" stackId="a" fill={CLASS_COLOURS.extended} name="extended" />
        <Bar dataKey="peak"     stackId="a" fill={CLASS_COLOURS.peak}     name="peak"     />
        <Bar dataKey="none"     stackId="a" fill={CLASS_COLOURS.none}     name="none" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Compact stat pills ────────────────────────────────────────────────────────
function SummaryStats({ weeklyData }: { weeklyData: WeekData[] }) {
  const totals = weeklyData.reduce(
    (acc, w) => { const h = w.totalHours
      acc.none += w.none*h/100; acc.peak += w.peak*h/100
      acc.extended += w.extended*h/100; acc.baseload += w.baseload*h/100; acc.total += h; return acc },
    { none:0, peak:0, extended:0, baseload:0, total:0 }
  )
  return (
    <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.6rem' }}>
      {(['baseload','extended','peak','none'] as RunClass[]).map(cls => {
        const pct = totals.total > 0 ? (totals[cls]/totals.total*100).toFixed(1) : '0'
        return (
          <div key={cls} style={{ flex:'1 1 90px', padding:'0.35rem 0.5rem',
            background:'var(--bg)', border:'1px solid var(--border)',
            borderLeft:`3px solid ${CLASS_COLOURS[cls]}`, borderRadius:'var(--radius-sm)' }}>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'0.55rem', color:'var(--muted)',
              textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:2 }}>
              {CLASS_LABELS[cls]}
            </div>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'0.9rem', fontWeight:700, color:CLASS_COLOURS[cls] }}>{pct}%</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Region panel ──────────────────────────────────────────────────────────────
function RegionProfile({ region, data }: { region: 'NSW'|'VIC'; data: any }) {
  const rows       = (data?.rows       ?? []) as { datetime: string; [k: string]: any }[]
  const facilities = (data?.facilities ?? []) as string[]

  const unitProfiles = useMemo(
    () => facilities.map(fac => ({ fac, weeklyData: buildUnitProfile(rows, fac) })),
    [rows, facilities]
  )
  const aggregateProfile = useMemo(() => buildAggregateProfile(rows, facilities), [rows, facilities])

  if (!aggregateProfile.length) return (
    <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
      No data available
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'2rem' }}>

      {/* State-wide aggregate */}
      <div>
        <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem' }}>
          <h3 style={{ margin:0, fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>
            {region === 'NSW' ? 'New South Wales' : 'Victoria'} — All Units Combined
          </h3>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>
            {facilities.length} units · unit-hours aggregated
          </span>
        </div>
        <SummaryStats weeklyData={aggregateProfile} />
        <ProfileChart weeklyData={aggregateProfile} height={260} />
      </div>

      {/* Per-unit grid */}
      <div>
        <h3 style={{ margin:'0 0 1rem', fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>
          Individual Unit Profiles
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(400px, 1fr))', gap:'1rem' }}>
          {unitProfiles.map(({ fac, weeklyData }) => (
            <div key={fac} className="sq-card" style={{ padding:'1rem' }}>
              <div style={{ fontWeight:600, fontSize:'0.78rem', color:'var(--text)', marginBottom:'0.5rem' }}>{fac}</div>
              <SummaryStats weeklyData={weeklyData} />
              <ProfileChart weeklyData={weeklyData} height={210} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>
        {aggregateProfile.length} weeks · {aggregateProfile[0]?.week} – {aggregateProfile[aggregateProfile.length-1]?.week}
        &nbsp;· Peak &lt;5h · Extended peak 5–13h · Baseload ≥13h continuous generation per unit
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function GpgProfileDashboard() {
  const { payload, loading, error, fetchedAt, fetch: fetchData } = useElecData('1h')
  const [region, setRegion] = useState<'NSW'|'VIC'>('NSW')

  useEffect(() => { fetchData('1h') }, [])

  const lastFetched = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' })
    : null

  return (
    <div>
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)',
        padding:'0 1.75rem', display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
        <div style={{ display:'flex' }}>
          {(['NSW','VIC'] as const).map(r => {
            const isActive = r === region
            const colour = r === 'NSW' ? 'var(--nsw)' : 'var(--vic)'
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                padding:'0.8rem 1.5rem', border:'none', background:'transparent', cursor:'pointer',
                fontFamily:'var(--font-ui)', fontWeight: isActive ? 600 : 400,
                color: isActive ? colour : 'var(--muted)',
                borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
              }}>{r === 'NSW' ? 'New South Wales' : 'Victoria'}</button>
            )
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.5rem 0' }}>
          {lastFetched && <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>Updated {lastFetched}</span>}
          <button onClick={() => fetchData('1h', true)} disabled={loading} style={{
            padding:'0.3rem 0.75rem', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
            background:'transparent', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily:'var(--font-ui)', fontSize:'0.72rem', color:'var(--muted)',
          }}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>
        {error ? (
          <div style={{ color:'var(--negative)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Error: {error}</div>
        ) : loading && !payload ? (
          <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Fetching generation data…</div>
        ) : (
          <div className="sq-card" style={{ padding:'1.5rem' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:'0.6rem', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text)', margin:0 }}>GPG Generation Profile</h2>
              <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>1-hour intervals · classified per unit · weekly breakdown</span>
            </div>
            <RegionProfile key={region} region={region} data={payload?.data?.[region]} />
          </div>
        )}
      </div>
    </div>
  )
}
