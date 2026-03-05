'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { useElecData } from './MainDashboard'

const PEAK_MAX     = 5
const EXT_PEAK_MAX = 13
type RunClass = 'peak' | 'extended' | 'baseload' | 'none'

const CLASS_COLOURS: Record<RunClass, string> = {
  baseload: '#1B5E7B',   // deep teal  — strong committed generation
  extended: '#2E7D4F',   // forest green — significant running time
  peak:     '#B5880C',   // amber gold  — short bursts
  none:     '#D9D4CC',   // warm grey   — clearly "off"
}
const CLASS_LABELS: Record<RunClass, string> = {
  baseload: 'Baseload (≥ 13h)',
  extended: 'Extended peak (5–13h)',
  peak:     'Peak (< 5h)',
  none:     'No generation',
}

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
function getWeekStart(dt: Date): Date {
  const d = new Date(dt)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

interface WeekData {
  week: string; weekStart: Date
  none: number; peak: number; extended: number; baseload: number; totalHours: number
  mwh: Record<RunClass, number>
}

function buildUnitProfile(rows: { datetime: string; [k: string]: any }[], facility: string): WeekData[] {
  if (!rows.length) return []
  const values = rows.map(r => { const v = r[facility]; return (v != null && !isNaN(v)) ? (v as number) : null })
  const classes = classifyHours(values)
  const weekMap = new Map<string, { counts: Record<RunClass, number>; mwh: Record<RunClass, number>; ws: Date }>()
  for (let i = 0; i < rows.length; i++) {
    const dt = new Date(rows[i].datetime), cls = classes[i], wk = weekLabel(dt)
    if (!weekMap.has(wk)) weekMap.set(wk, { counts: { none:0, peak:0, extended:0, baseload:0 }, mwh: { none:0, peak:0, extended:0, baseload:0 }, ws: getWeekStart(dt) })
    const entry = weekMap.get(wk)!
    entry.counts[cls]++
    entry.mwh[cls] += values[i] ?? 0   // 1h interval → MW = MWh
  }
  return Array.from(weekMap.entries()).map(([week, { counts, mwh, ws }]) => {
    const total = counts.none + counts.peak + counts.extended + counts.baseload
    return { week, weekStart: ws,
      none:     total > 0 ? Math.round(counts.none     / total * 1000) / 10 : 0,
      peak:     total > 0 ? Math.round(counts.peak     / total * 1000) / 10 : 0,
      extended: total > 0 ? Math.round(counts.extended / total * 1000) / 10 : 0,
      baseload: total > 0 ? Math.round(counts.baseload / total * 1000) / 10 : 0,
      totalHours: total, mwh }
  }).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

function buildAggregateProfile(rows: { datetime: string; [k: string]: any }[], facilities: string[]): WeekData[] {
  if (!rows.length || !facilities.length) return []
  const weekMap = new Map<string, { counts: Record<RunClass, number>; mwh: Record<RunClass, number>; ws: Date }>()
  for (const fac of facilities) {
    const values = rows.map(r => { const v = r[fac]; return (v != null && !isNaN(v)) ? (v as number) : null })
    const classes = classifyHours(values)
    for (let i = 0; i < rows.length; i++) {
      const dt = new Date(rows[i].datetime), cls = classes[i], wk = weekLabel(dt)
      if (!weekMap.has(wk)) weekMap.set(wk, { counts: { none:0, peak:0, extended:0, baseload:0 }, mwh: { none:0, peak:0, extended:0, baseload:0 }, ws: getWeekStart(dt) })
      const entry = weekMap.get(wk)!
      entry.counts[cls]++
      entry.mwh[cls] += values[i] ?? 0
    }
  }
  return Array.from(weekMap.entries()).map(([week, { counts, mwh, ws }]) => {
    const total = counts.none + counts.peak + counts.extended + counts.baseload
    return { week, weekStart: ws,
      none:     total > 0 ? Math.round(counts.none     / total * 1000) / 10 : 0,
      peak:     total > 0 ? Math.round(counts.peak     / total * 1000) / 10 : 0,
      extended: total > 0 ? Math.round(counts.extended / total * 1000) / 10 : 0,
      baseload: total > 0 ? Math.round(counts.baseload / total * 1000) / 10 : 0,
      totalHours: total, mwh }
  }).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

function ProfileTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as WeekData
  return (
    <div style={{ background:'#fff', border:'1px solid #D4D0C8', borderRadius:6,
      padding:'0.65rem 0.85rem', fontFamily:'var(--font-data)', fontSize:'0.72rem',
      boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight:700, color:'#111', marginBottom:'0.3rem' }}>Week of {label}</div>
      <div style={{ color:'#5A5448', fontSize:'0.6rem', marginBottom:'0.5rem' }}>{data?.totalHours} unit-hours</div>
      {(['baseload','extended','peak','none'] as RunClass[]).map(cls => (
        <div key={cls} style={{ display:'flex', justifyContent:'space-between', gap:'1.5rem', marginBottom:3 }}>
          <span style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ display:'inline-block', width:9, height:9, borderRadius:2, background:CLASS_COLOURS[cls], flexShrink:0 }} />
            <span style={{ color:'#2D2920' }}>{CLASS_LABELS[cls]}</span>
          </span>
          <span style={{ fontWeight:700, color:'#111' }}>
            {(payload.find((p: any) => p.dataKey === cls)?.value ?? 0).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// Legend rendered as HTML above the chart — never overlaps
function ChartLegend() {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.75rem 1.25rem', marginBottom:'0.75rem' }}>
      {(['baseload','extended','peak','none'] as RunClass[]).map(cls => (
        <span key={cls} style={{ display:'flex', alignItems:'center', gap:'0.4rem',
          fontFamily:'var(--font-data)', fontSize:'0.66rem', color:'#2D2920', fontWeight:500 }}>
          <span style={{ display:'inline-block', width:11, height:11, borderRadius:2,
            background:CLASS_COLOURS[cls], flexShrink:0, border:'1px solid rgba(0,0,0,0.08)' }} />
          {CLASS_LABELS[cls]}
        </span>
      ))}
    </div>
  )
}

function ProfileChart({ weeklyData, height = 240 }: { weeklyData: WeekData[]; height?: number }) {
  const tickInterval = Math.max(0, Math.floor(weeklyData.length / 8) - 1)
  return (
    <div>
      <ChartLegend />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={weeklyData} margin={{ top:4, right:16, left:0, bottom:64 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E2DC" vertical={false} />
          <XAxis dataKey="week"
            tick={{ fontFamily:'var(--font-data)', fontSize:9, fill:'#5A5448' }}
            angle={-45} textAnchor="end" interval={tickInterval}
            tickLine={false} axisLine={{ stroke:'#D4D0C8' }} />
          <YAxis tickFormatter={v => `${v}%`} domain={[0,100]}
            tick={{ fontFamily:'var(--font-data)', fontSize:9, fill:'#5A5448' }}
            tickLine={false} axisLine={false} width={38} />
          <Tooltip content={<ProfileTooltip />} />
          <Bar dataKey="baseload" stackId="a" fill={CLASS_COLOURS.baseload} name="baseload" />
          <Bar dataKey="extended" stackId="a" fill={CLASS_COLOURS.extended} name="extended" />
          <Bar dataKey="peak"     stackId="a" fill={CLASS_COLOURS.peak}     name="peak"     />
          <Bar dataKey="none"     stackId="a" fill={CLASS_COLOURS.none}     name="none" radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function fmtMwh(mwh: number): string {
  if (mwh >= 1_000_000) return `${(mwh / 1_000_000).toFixed(2)} TWh`
  if (mwh >= 1_000)     return `${Math.round(mwh / 1_000).toLocaleString()} GWh`
  return `${Math.round(mwh).toLocaleString()} MWh`
}

function SummaryStats({ weeklyData }: { weeklyData: WeekData[] }) {
  const totals = weeklyData.reduce(
    (acc, w) => {
      const h = w.totalHours
      acc.none     += w.none     * h / 100
      acc.peak     += w.peak     * h / 100
      acc.extended += w.extended * h / 100
      acc.baseload += w.baseload * h / 100
      acc.total    += h
      const mwh = w.mwh ?? { none:0, peak:0, extended:0, baseload:0 }
      acc.mwh.none     += mwh.none
      acc.mwh.peak     += mwh.peak
      acc.mwh.extended += mwh.extended
      acc.mwh.baseload += mwh.baseload
      return acc
    },
    { none:0, peak:0, extended:0, baseload:0, total:0,
      mwh: { none:0, peak:0, extended:0, baseload:0 } }
  )
  return (
    <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.85rem' }}>
      {(['baseload','extended','peak','none'] as RunClass[]).map(cls => {
        const pct    = totals.total > 0 ? (totals[cls] / totals.total * 100).toFixed(1) : '0'
        const colour = cls === 'none' ? '#7A7060' : CLASS_COLOURS[cls]
        return (
          <div key={cls} style={{ flex:'1 1 110px', padding:'0.45rem 0.65rem',
            background:'#fff', border:'1px solid #D4D0C8',
            borderLeft:`3px solid ${CLASS_COLOURS[cls]}`, borderRadius:5 }}>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'0.58rem', color:'#5A5448',
              textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3, fontWeight:600 }}>
              {CLASS_LABELS[cls]}
            </div>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'1rem', fontWeight:700,
              color: colour, lineHeight:1 }}>{pct}%</div>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'#555', marginTop:4 }}>
              {fmtMwh(totals.mwh[cls])}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RegionProfile({ region, data }: { region: 'NSW'|'VIC'|'QLD'|'SA'; data: any }) {
  const rows       = (data?.rows       ?? []) as { datetime: string; [k: string]: any }[]
  const facilities = (data?.facilities ?? []) as string[]

  const unitProfiles    = useMemo(() => facilities.map(fac => ({ fac, weeklyData: buildUnitProfile(rows, fac) })), [rows, facilities])
  const aggregateProfile = useMemo(() => buildAggregateProfile(rows, facilities), [rows, facilities])

  if (!aggregateProfile.length) return (
    <div style={{ padding:'3rem', textAlign:'center', color:'#5A5448', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
      No data available
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'2.5rem' }}>
      {/* State-wide aggregate */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem',
          paddingBottom:'0.6rem', borderBottom:'1px solid #E5E2DC' }}>
          <h3 style={{ margin:0, fontWeight:700, fontSize:'0.9rem', color:'#111' }}>
            {{ NSW:'New South Wales', VIC:'Victoria', QLD:'Queensland', SA:'South Australia' }[region] ?? region} — All Units Combined
          </h3>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'#5A5448',
            background:'#F0EEE9', padding:'0.15rem 0.5rem', borderRadius:3 }}>
            {facilities.length} units
          </span>
        </div>
        <SummaryStats weeklyData={aggregateProfile} />
        <ProfileChart weeklyData={aggregateProfile} height={260} />
      </div>

      {/* Per-unit grid */}
      <div>
        <h3 style={{ margin:'0 0 1rem', fontWeight:700, fontSize:'0.9rem', color:'#111',
          paddingBottom:'0.6rem', borderBottom:'1px solid #E5E2DC' }}>
          Individual Unit Profiles
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))', gap:'1.25rem' }}>
          {unitProfiles.map(({ fac, weeklyData }) => (
            <div key={fac} style={{ background:'#fff', border:'1px solid #D4D0C8', borderRadius:8, padding:'1.1rem' }}>
              <div style={{ fontWeight:700, fontSize:'0.8rem', color:'#111', marginBottom:'0.75rem',
                paddingBottom:'0.5rem', borderBottom:'1px solid #E5E2DC' }}>{fac}</div>
              <SummaryStats weeklyData={weeklyData} />
              <ProfileChart weeklyData={weeklyData} height={220} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'#5A5448',
        padding:'0.5rem 0.75rem', background:'#F0EEE9', borderRadius:4 }}>
        {aggregateProfile.length} weeks · {aggregateProfile[0]?.week} – {aggregateProfile[aggregateProfile.length-1]?.week}
        &nbsp;· Peak &lt;5h run · Extended peak 5–13h · Baseload ≥13h continuous generation per unit
      </div>
    </div>
  )
}

export default function GpgProfileDashboard() {
  const { payload, loading, error, fetchedAt, fetch: fetchData } = useElecData('1h')
  const [region, setRegion] = useState<'NSW'|'VIC'|'QLD'|'SA'>('NSW')

  useEffect(() => { fetchData('1h') }, [])

  const lastFetched = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' })
    : null

  return (
    <div>
      <div style={{ background:'#fff', borderBottom:'1px solid #D4D0C8',
        padding:'0 1.75rem', display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
        <div style={{ display:'flex' }}>
          {(['NSW','VIC','QLD','SA'] as const).map(r => {
            const isActive = r === region
            const RCOL: Record<string,string> = { NSW:'#1B5E7B', VIC:'#2A6E44', QLD:'#E4830A', SA:'#8B3FA8' }
            const RLAB: Record<string,string> = { NSW:'New South Wales', VIC:'Victoria', QLD:'Queensland', SA:'South Australia' }
            const colour = RCOL[r]
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                padding:'0.8rem 1.5rem', border:'none', background:'transparent', cursor:'pointer',
                fontFamily:'var(--font-ui)', fontWeight: isActive ? 700 : 400, fontSize:'0.84rem',
                color: isActive ? colour : '#5A5448',
                borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
              }}>{RLAB[r]}</button>
            )
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.5rem 0' }}>
          {lastFetched && <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'#5A5448' }}>Updated {lastFetched}</span>}
          <button onClick={() => fetchData('1h', true)} disabled={loading} style={{
            padding:'0.3rem 0.75rem', border:'1px solid #D4D0C8', borderRadius:5, background:'transparent',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily:'var(--font-ui)', fontSize:'0.72rem', color:'#5A5448',
          }}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>
        {error ? (
          <div style={{ color:'#B02A3E', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>Error: {error}</div>
        ) : loading && !payload ? (
          <div style={{ padding:'3rem', textAlign:'center', color:'#5A5448', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
            Fetching generation data…
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #D4D0C8', borderRadius:8, padding:'1.5rem', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3,
              background:'linear-gradient(90deg, #1B5E7B 0%, #2980A8 60%, transparent 100%)' }} />
            <div style={{ display:'flex', alignItems:'baseline', gap:'0.6rem', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1rem', color:'#111', margin:0 }}>GPG Generation Profile</h2>
              <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'#5A5448' }}>
                1-hour intervals · classified per unit · weekly breakdown
              </span>
            </div>
            <RegionProfile key={region} region={region as 'NSW'|'VIC'|'QLD'|'SA'} data={payload?.data?.[region]} />
          </div>
        )}
      </div>
    </div>
  )
}
