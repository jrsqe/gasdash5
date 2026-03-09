'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Cell,
} from 'recharts'
import type { LngData } from '@/lib/gbbData'

// ── Palette — one colour per LNG facility ─────────────────────────────────────
const FACILITY_COLOURS = [
  '#0071E3',   // Apple blue    — APLNG
  '#FF9F0A',   // Apple amber   — GLNG
  '#30C254',   // Apple green   — QCLNG
  '#AF52DE',   // Apple purple  — Arrow / other
  '#FF375F',   // Apple red
  '#5AC8FA',   // Apple sky
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m ?? '1') - 1]} ${(y ?? '').slice(2)}`
}

function fmtDate(d: string) {
  const [, m, dd] = d.split('-')
  return `${parseInt(dd ?? '0')} ${MONTHS[parseInt(m ?? '1') - 1]}`
}

// ── Shared tooltip style ──────────────────────────────────────────────────────
function SqTooltip({ active, payload, label, unit = 'TJ' }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0)
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
      padding: '0.6rem 0.9rem', fontFamily: 'var(--font-data)', fontSize: '0.72rem',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 180,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>{label}</div>
      {payload.slice().reverse().map((p: any) => p.value > 0 && (
        <div key={p.dataKey} style={{
          display: 'flex', justifyContent: 'space-between', gap: '1.5rem',
          marginBottom: 2, alignItems: 'center',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: p.fill, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-2)' }}>{p.dataKey}</span>
          </span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            {p.value.toFixed(1)} {unit}
          </span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4,
          display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Total</span>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{total.toFixed(1)} {unit}</span>
        </div>
      )}
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

// ── Monthly total chart ───────────────────────────────────────────────────────
function MonthlyTotalChart({ monthly, facilities }: {
  monthly: LngData['monthly']
  facilities: string[]
}) {
  const rows = useMemo(() => {
    return Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, { total, byFacility }]) => {
        const row: Record<string, any> = { month: fmtMonth(ym), ym, total }
        for (const f of facilities) row[f] = byFacility[f] ?? 0
        return row
      })
  }, [monthly, facilities])

  // Summary stats
  const totals = rows.map(r => r.total as number)
  const maxMonth = rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0])
  const avgMonthly = totals.reduce((s, v) => s + v, 0) / (totals.length || 1)
  const latestMonth = rows[rows.length - 1]

  return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
          Monthly LNG Export Demand
        </h3>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
          TJ/month · all facilities combined
        </span>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        <StatCard
          label="Latest month"
          value={latestMonth ? `${Math.round(latestMonth.total).toLocaleString()} TJ` : '—'}
          sub={latestMonth?.month}
          colour="var(--accent)"
        />
        <StatCard
          label="Peak month"
          value={maxMonth ? `${Math.round(maxMonth.total).toLocaleString()} TJ` : '—'}
          sub={maxMonth?.month}
          colour="#FF375F"
        />
        <StatCard
          label="Monthly average"
          value={`${Math.round(avgMonthly).toLocaleString()} TJ`}
          sub={`across ${rows.length} months`}
          colour="#FF9F0A"
        />
        <StatCard
          label="Facilities"
          value={String(facilities.length)}
          sub="LNG export terminals"
          colour="#30C254"
        />
      </div>

      {/* HTML legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem',
        padding: '0.5rem 0', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)',
      }}>
        {facilities.map((f, i) => (
          <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem',
            fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text-2)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3,
              background: FACILITY_COLOURS[i % FACILITY_COLOURS.length], flexShrink: 0 }} />
            {f}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month"
            tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickLine={false} axisLine={{ stroke: 'var(--border)' }}
            interval={Math.max(0, Math.floor(rows.length / 12) - 1)}
          />
          <YAxis
            tickFormatter={v => `${Math.round(v / 1000)}k`}
            tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickLine={false} axisLine={false} width={40}
            label={{ value: 'TJ', angle: -90, position: 'insideLeft', fill: '#888',
              fontSize: 9, fontFamily: 'var(--font-data)', dy: 10 }}
          />
          <Tooltip content={<SqTooltip unit="TJ" />} />
          {facilities.map((f, i) => (
            <Bar key={f} dataKey={f} stackId="lng"
              fill={FACILITY_COLOURS[i % FACILITY_COLOURS.length]}
              radius={i === facilities.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Daily by facility chart ───────────────────────────────────────────────────
function DailyFacilityChart({ daily, facilities }: {
  daily: LngData['daily']
  facilities: string[]
}) {
  // View window — last N days selector
  const [days, setDays] = useState<90 | 180 | 365 | 9999>(365)

  const rows = useMemo(() => {
    // Group by date
    const byDate: Record<string, Record<string, number>> = {}
    for (const d of daily) {
      if (!byDate[d.date]) byDate[d.date] = {}
      byDate[d.date][d.facility] = (byDate[d.date][d.facility] ?? 0) + d.demand
    }
    const allDates = Object.keys(byDate).sort()
    const cutoff   = days === 9999 ? allDates[0] : allDates[allDates.length - days] ?? allDates[0]
    return allDates
      .filter(dt => dt >= cutoff)
      .map(dt => {
        const row: Record<string, any> = { date: fmtDate(dt), rawDate: dt }
        for (const f of facilities) row[f] = byDate[dt][f] ?? 0
        row.total = facilities.reduce((s, f) => s + (byDate[dt][f] ?? 0), 0)
        return row
      })
  }, [daily, facilities, days])

  // Peak day
  const peakDay = rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0])
  const avgDaily = rows.reduce((s, r) => s + r.total, 0) / (rows.length || 1)

  const WINDOW_OPTS = [
    { v: 90,   label: '3 months' },
    { v: 180,  label: '6 months' },
    { v: 365,  label: '1 year'   },
    { v: 9999, label: 'All'      },
  ] as const

  return (
    <div className="sq-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
            Daily LNG Export by Facility
          </h3>
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
            TJ/day
          </span>
        </div>
        {/* Window selector */}
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {WINDOW_OPTS.map(({ v, label }) => (
            <button key={v} onClick={() => setDays(v)} style={{
              padding: '0.25rem 0.65rem',
              border: `1px solid ${days === v ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 6, background: days === v ? 'var(--accent)' : 'transparent',
              color: days === v ? '#fff' : 'var(--muted)',
              fontFamily: 'var(--font-data)', fontSize: '0.65rem', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        <StatCard
          label="Peak day"
          value={peakDay ? `${Math.round(peakDay.total).toLocaleString()} TJ` : '—'}
          sub={peakDay?.rawDate}
          colour="#FF375F"
        />
        <StatCard
          label="Daily average"
          value={`${Math.round(avgDaily).toLocaleString()} TJ`}
          sub={`over ${rows.length} days shown`}
          colour="var(--accent)"
        />
      </div>

      {/* HTML legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem',
        padding: '0.5rem 0', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)',
      }}>
        {facilities.map((f, i) => (
          <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem',
            fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text-2)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3,
              background: FACILITY_COLOURS[i % FACILITY_COLOURS.length], flexShrink: 0 }} />
            {f}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap="15%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date"
            tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickLine={false} axisLine={{ stroke: 'var(--border)' }}
            interval={Math.max(0, Math.floor(rows.length / 10) - 1)}
          />
          <YAxis
            tickFormatter={v => `${Math.round(v)}`}
            tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickLine={false} axisLine={false} width={40}
            label={{ value: 'TJ/day', angle: -90, position: 'insideLeft', fill: '#888',
              fontSize: 9, fontFamily: 'var(--font-data)', dy: 20 }}
          />
          <Tooltip content={<SqTooltip unit="TJ" />} />
          {facilities.map((f, i) => (
            <Bar key={f} dataKey={f} stackId="daily"
              fill={FACILITY_COLOURS[i % FACILITY_COLOURS.length]}
              radius={i === facilities.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LngDashboard() {
  const [data,    setData]    = useState<LngData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/lng')
      .then(r => r.json())
      .then(j => {
        if (j.ok) setData(j.data)
        else setError(j.error ?? 'Unknown error')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '3rem 2rem', textAlign: 'center',
      fontFamily: 'var(--font-data)', fontSize: '0.75rem', color: 'var(--muted)' }}>
      Loading LNG export data…
    </div>
  )

  if (error) return (
    <div style={{ padding: '2rem', color: 'var(--negative)',
      fontFamily: 'var(--font-data)', fontSize: '0.8rem' }}>
      Error: {error}
    </div>
  )

  if (!data || data.daily.length === 0) return (
    <div style={{ padding: '2rem', color: 'var(--muted)',
      fontFamily: 'var(--font-data)', fontSize: '0.8rem' }}>
      No LNG export data found in GBB.
    </div>
  )

  const { daily, facilities, monthly } = data

  // Date range banner
  const firstDate = daily[0]?.date ?? ''
  const lastDate  = daily[daily.length - 1]?.date ?? ''

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
      {/* Page header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>
          LNG Export
        </h2>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)',
          fontSize: '0.65rem', marginTop: '0.25rem' }}>
          AEMO Gas Bulletin Board · FacilityType: LNGEXPORT ·{' '}
          {firstDate} → {lastDate}
        </div>
      </div>

      <MonthlyTotalChart monthly={monthly} facilities={facilities} />
      <DailyFacilityChart daily={daily} facilities={facilities} />

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
        fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)',
        display: 'flex', justifyContent: 'space-between' }}>
        <span>Source: AEMO GBB ActualFlows · nemweb.com.au</span>
        <span>{facilities.join(' · ')}</span>
      </div>
    </div>
  )
}
