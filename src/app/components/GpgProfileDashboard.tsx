'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'
import { useElecData } from './MainDashboard'

// ── Classification constants ──────────────────────────────────────────────────
// Thresholds are in consecutive hours of generation
const PEAK_MAX     = 5    // < 5h  → peak
const EXT_PEAK_MAX = 13   // 5–13h → extended peak
                          // ≥ 13h → baseload

type RunClass = 'peak' | 'extended' | 'baseload' | 'none'

// Monochromatic blue-grey: darkest at bottom (baseload) → lightest at top (none)
const CLASS_COLOURS: Record<RunClass, string> = {
  baseload: '#1B3A5C',   // darkest — most committed generation
  extended: '#3D6A96',   // mid-dark
  peak:     '#7AAED0',   // mid-light
  none:     '#D6E8F5',   // lightest — no generation
}
const CLASS_LABELS: Record<RunClass, string> = {
  none:     'No generation',
  peak:     'Peak (< 5h)',
  extended: 'Extended peak (5–13h)',
  baseload: 'Baseload (≥ 13h)',
}

// ── Classification logic ──────────────────────────────────────────────────────
// Takes an array of hourly total-generation values (MW, null = missing)
// Returns a same-length array of RunClass labels.
function classifyHours(values: (number | null)[]): RunClass[] {
  const n = values.length
  const result: RunClass[] = new Array(n).fill('none')

  // Identify contiguous runs of generation (value > 0)
  let i = 0
  while (i < n) {
    const val = values[i]
    if (val == null || val <= 0) { i++; continue }

    // Start of a generation run
    let j = i
    while (j < n && (values[j] ?? 0) > 0) j++
    const runLen = j - i  // hours in this run

    let cls: RunClass
    if (runLen < PEAK_MAX)     cls = 'peak'
    else if (runLen < EXT_PEAK_MAX) cls = 'extended'
    else                        cls = 'baseload'

    for (let k = i; k < j; k++) result[k] = cls
    i = j
  }
  return result
}

// ── ISO week label ────────────────────────────────────────────────────────────
function weekLabel(dt: Date): string {
  // Return "DD MMM" of the Monday of the ISO week
  const d = new Date(dt)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}

// ── Aggregate rows into weekly percentages ────────────────────────────────────
interface WeekData {
  week: string          // "DD MMM" of Monday
  weekStart: Date
  none: number          // % of hours
  peak: number
  extended: number
  baseload: number
  totalHours: number
}

function buildWeeklyProfile(
  rows: { datetime: string; [fac: string]: any }[],
  facilities: string[]
): WeekData[] {
  if (!rows.length || !facilities.length) return []

  // Classify each facility independently, then aggregate hour-counts per week.
  // This ensures a unit running 3h contributes 3h of 'peak' regardless of
  // what other units are doing at the same time.
  const weekMap = new Map<string, { counts: Record<RunClass, number>; weekStart: Date }>()

  for (const fac of facilities) {
    // Build hourly generation series for this unit
    const values = rows.map(r => {
      const v = r[fac]
      return (v != null && !isNaN(v)) ? (v as number) : null
    })

    // Classify this unit's hours
    const classes = classifyHours(values)

    // Accumulate into week buckets
    for (let i = 0; i < rows.length; i++) {
      const dt  = new Date(rows[i].datetime)
      const cls = classes[i]
      const wk  = weekLabel(dt)
      if (!weekMap.has(wk)) {
        const mon = new Date(dt)
        const day = mon.getDay() || 7
        mon.setDate(mon.getDate() - day + 1)
        mon.setHours(0, 0, 0, 0)
        weekMap.set(wk, { counts: { none: 0, peak: 0, extended: 0, baseload: 0 }, weekStart: mon })
      }
      weekMap.get(wk)!.counts[cls]++
    }
  }

  // Convert to percentages, sort by date
  return Array.from(weekMap.entries())
    .map(([week, { counts, weekStart }]) => {
      const total = counts.none + counts.peak + counts.extended + counts.baseload
      return {
        week,
        weekStart,
        none:     total > 0 ? Math.round(counts.none     / total * 1000) / 10 : 0,
        peak:     total > 0 ? Math.round(counts.peak     / total * 1000) / 10 : 0,
        extended: total > 0 ? Math.round(counts.extended / total * 1000) / 10 : 0,
        baseload: total > 0 ? Math.round(counts.baseload / total * 1000) / 10 : 0,
        totalHours: total,
      }
    })
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ProfileTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as WeekData
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '0.65rem 0.85rem',
      fontFamily: 'var(--font-data)', fontSize: '0.72rem',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
        Week of {label}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '0.62rem', marginBottom: '0.5rem' }}>
        {data?.totalHours} hours
      </div>
      {(['baseload','extended','peak','none'] as RunClass[]).map(cls => (
        <div key={cls} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: CLASS_COLOURS[cls], flexShrink: 0 }} />
            <span style={{ color: 'var(--text-2)' }}>{CLASS_LABELS[cls]}</span>
          </span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            {(payload.find((p: any) => p.dataKey === cls)?.value ?? 0).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Region panel ─────────────────────────────────────────────────────────────
function RegionProfile({ region, data }: { region: 'NSW' | 'VIC'; data: any }) {
  const rows       = data?.rows ?? []
  const facilities = data?.facilities ?? []

  const weeklyData = useMemo(
    () => buildWeeklyProfile(rows, facilities),
    [rows, facilities]
  )

  if (!weeklyData.length) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
        No data available
      </div>
    )
  }

  // Summary stats for the full period
  const totals = weeklyData.reduce(
    (acc, w) => {
      const hrs = w.totalHours
      acc.none     += w.none     * hrs / 100
      acc.peak     += w.peak     * hrs / 100
      acc.extended += w.extended * hrs / 100
      acc.baseload += w.baseload * hrs / 100
      acc.total    += hrs
      return acc
    },
    { none: 0, peak: 0, extended: 0, baseload: 0, total: 0 }
  )

  return (
    <div>
      {/* Summary stat pills */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {(['baseload','extended','peak','none'] as RunClass[]).map(cls => {
          const hrs = Math.round(totals[cls])
          const pct = totals.total > 0 ? (totals[cls] / totals.total * 100).toFixed(1) : '0'
          return (
            <div key={cls} className="sq-stat" style={{ flex: '1 1 140px', borderLeft: `3px solid ${CLASS_COLOURS[cls]}` }}>
              <div className="sq-stat-label">{CLASS_LABELS[cls]}</div>
              <div className="sq-stat-value" style={{ color: CLASS_COLOURS[cls] }}>{pct}%</div>
              <div className="sq-stat-sub">{hrs} hours</div>
            </div>
          )
        })}
      </div>

      {/* Stacked bar chart */}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={weeklyData} margin={{ top: 4, right: 16, left: 0, bottom: 60 }}
          barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontFamily: 'var(--font-data)', fontSize: 10, fill: 'var(--muted)' }}
            angle={-45} textAnchor="end"
            interval={Math.max(0, Math.floor(weeklyData.length / 8) - 1)}
          />
          <YAxis
            tickFormatter={v => `${v}%`}
            domain={[0, 100]}
            tick={{ fontFamily: 'var(--font-data)', fontSize: 10, fill: 'var(--muted)' }}
            width={40}
          />
          <Tooltip content={<ProfileTooltip />} />
          <Legend
            formatter={(value) => CLASS_LABELS[value as RunClass]}
            wrapperStyle={{ fontFamily: 'var(--font-data)', fontSize: '0.68rem', paddingTop: '0.5rem' }}
          />
          <Bar dataKey="baseload" stackId="a" fill={CLASS_COLOURS.baseload} name="baseload" />
          <Bar dataKey="extended" stackId="a" fill={CLASS_COLOURS.extended} name="extended" />
          <Bar dataKey="peak"     stackId="a" fill={CLASS_COLOURS.peak}     name="peak"     />
          <Bar dataKey="none"     stackId="a" fill={CLASS_COLOURS.none}     name="none"
            radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Data note */}
      <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)' }}>
        Based on {weeklyData.length} weeks · {weeklyData[0]?.week} – {weeklyData[weeklyData.length-1]?.week}
        &nbsp;· Peak &lt;5h run · Extended peak 5–13h · Baseload ≥13h continuous generation
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function GpgProfileDashboard() {
  const { payload, loading, error, fetchedAt, fetch: fetchData } = useElecData('1h')
  const [region, setRegion] = useState<'NSW' | 'VIC'>('NSW')

  // Fetch on mount
  useEffect(() => { fetchData('1h') }, [])

  const lastFetched = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div>
      {/* Sub-header */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 1.75rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex' }}>
          {(['NSW','VIC'] as const).map(r => {
            const isActive = r === region
            const colour   = r === 'NSW' ? 'var(--nsw)' : 'var(--vic)'
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                padding: '0.8rem 1.5rem', border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: isActive ? 600 : 400,
                color: isActive ? colour : 'var(--muted)',
                borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
              }}>{r === 'NSW' ? 'New South Wales' : 'Victoria'}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0' }}>
          {lastFetched && (
            <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)' }}>
              Updated {lastFetched}
            </span>
          )}
          <button onClick={() => fetchData('1h', true)} disabled={loading} style={{
            padding: '0.3rem 0.75rem', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', background: 'transparent',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: '0.72rem', color: 'var(--muted)',
          }}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        {error ? (
          <div style={{ color: 'var(--negative)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            Error: {error}
          </div>
        ) : loading && !payload ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            Fetching generation data…
          </div>
        ) : (
          <div className="sq-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', margin: 0 }}>
                GPG Generation Profile — {region === 'NSW' ? 'New South Wales' : 'Victoria'}
              </h2>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)' }}>
                1-hour intervals · weekly breakdown
              </span>
            </div>
            <RegionProfile
              key={region}
              region={region}
              data={payload?.data?.[region]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
