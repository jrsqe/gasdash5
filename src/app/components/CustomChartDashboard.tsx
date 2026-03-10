'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

// ── Palette ───────────────────────────────────────────────────────────────────
const SERIES_COLOURS = [
  '#0071E3','#FF6B35','#30C254','#AF52DE','#FF9F0A',
  '#FF375F','#5AC8FA','#32D74B','#BF5AF2','#FF9F0A',
  '#64D2FF','#FFD60A','#AC8E68','#6E6E73','#2C9CF5',
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(d: string) {
  const [y, m, dd] = d.split('-')
  return `${parseInt(dd??'0')} ${MONTHS[parseInt(m??'1')-1]} ${(y??'').slice(2)}`
}

function fmtDateShort(d: string) {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

// A resolved series: date-aligned values ready to plot
export interface ResolvedSeries {
  id:       string          // unique key
  label:    string          // display name
  unit:     string          // TJ, $/GJ, MW, %
  dates:    string[]        // YYYY-MM-DD
  values:   (number|null)[] // aligned to dates
  category: string          // source group label
  chartType: 'line' | 'bar'
}

// Catalogue entry describing how to extract a series from raw data
interface SeriesDef {
  id:       string
  label:    string
  unit:     string
  category: string
  chartType: 'line' | 'bar'
  extract:  (allData: AllData) => { dates: string[]; values: (number|null)[] } | null
}

interface AllData {
  gbb:    any
  prices: any
  lng:    any
}

// ── Series catalogue ──────────────────────────────────────────────────────────
// Build all possible series definitions from available raw data
function buildCatalogue(allData: AllData): SeriesDef[] {
  const defs: SeriesDef[] = []
  const { gbb, prices, lng } = allData

  // ── GBB: GPG demand by state+facility ──
  if (gbb?.gpgByState) {
    for (const [state, facilities] of Object.entries(gbb.gpgByState as Record<string,Record<string,(number|null)[]>>)) {
      for (const [facility, values] of Object.entries(facilities)) {
        defs.push({
          id: `gpg|${state}|${facility}`,
          label: `GPG · ${state} · ${facility}`,
          unit: 'TJ/day', category: 'GPG Gas Demand', chartType: 'bar',
          extract: (d) => {
            const v = d.gbb?.gpgByState?.[state]?.[facility]
            return v ? { dates: d.gbb.dates, values: v } : null
          },
        })
      }
      // Total per state
      defs.push({
        id: `gpg-total|${state}`,
        label: `GPG Total · ${state}`,
        unit: 'TJ/day', category: 'GPG Gas Demand', chartType: 'bar',
        extract: (d) => {
          const facs = d.gbb?.gpgByState?.[state]
          if (!facs) return null
          const arrays = Object.values(facs) as (number|null)[][]
          const len = d.gbb.dates.length
          const totals = Array.from({ length: len }, (_, i) =>
            arrays.reduce((s, a) => s + (a[i] ?? 0), 0) || null
          )
          return { dates: d.gbb.dates, values: totals }
        },
      })
    }
  }

  // ── GBB: Large industry by state+facility ──
  if (gbb?.largeByState) {
    for (const [state, facilities] of Object.entries(gbb.largeByState as Record<string,Record<string,(number|null)[]>>)) {
      for (const [facility, values] of Object.entries(facilities)) {
        defs.push({
          id: `large|${state}|${facility}`,
          label: `Large Industry · ${state} · ${facility}`,
          unit: 'TJ/day', category: 'Large Industry Demand', chartType: 'bar',
          extract: (d) => {
            const v = d.gbb?.largeByState?.[state]?.[facility]
            return v ? { dates: d.gbb.dates, values: v } : null
          },
        })
      }
    }
  }

  // ── GBB: Production by state+facility ──
  if (gbb?.prodByState) {
    for (const [state, facilities] of Object.entries(gbb.prodByState as Record<string,Record<string,(number|null)[]>>)) {
      // Total per state
      defs.push({
        id: `prod-total|${state}`,
        label: `Gas Production Total · ${state}`,
        unit: 'TJ/day', category: 'Gas Production', chartType: 'line',
        extract: (d) => {
          const facs = d.gbb?.prodByState?.[state]
          if (!facs) return null
          const arrays = Object.values(facs) as (number|null)[][]
          const len = d.gbb.dates.length
          const totals = Array.from({ length: len }, (_, i) =>
            arrays.reduce((s, a) => s + (a[i] ?? 0), 0) || null
          )
          return { dates: d.gbb.dates, values: totals }
        },
      })
      for (const [facility] of Object.entries(facilities)) {
        defs.push({
          id: `prod|${state}|${facility}`,
          label: `Production · ${state} · ${facility}`,
          unit: 'TJ/day', category: 'Gas Production', chartType: 'line',
          extract: (d) => {
            const v = d.gbb?.prodByState?.[state]?.[facility]
            return v ? { dates: d.gbb.dates, values: v } : null
          },
        })
      }
    }
  }

  // ── GBB: Storage ──
  if (gbb?.storageByFacility) {
    for (const [facility, info] of Object.entries(gbb.storageByFacility as Record<string,any>)) {
      defs.push({
        id: `storage-level|${facility}`,
        label: `Storage Level · ${facility} (${info.state})`,
        unit: 'TJ', category: 'Gas Storage', chartType: 'line',
        extract: (d) => {
          const v = d.gbb?.storageByFacility?.[facility]?.heldInStorage
          return v ? { dates: d.gbb.dates, values: v } : null
        },
      })
    }
  }

  // ── GBB: Pipeline flows ──
  if (gbb?.pipelineFlows) {
    for (const [pipe] of Object.entries(gbb.pipelineFlows as Record<string,any>)) {
      defs.push({
        id: `pipeline|${pipe}`,
        label: `Pipeline · ${pipe}`,
        unit: 'TJ/day', category: 'Pipeline Flows', chartType: 'line',
        extract: (d) => {
          const v = d.gbb?.pipelineFlows?.[pipe]?.flow
          return v ? { dates: d.gbb.dates, values: v } : null
        },
      })
    }
  }

  // ── Gas prices: DWGM ──
  if (prices?.dwgm) {
    defs.push({
      id: 'dwgm-weighted',
      label: 'DWGM Weighted Avg Price',
      unit: '$/GJ', category: 'Gas Prices', chartType: 'line',
      extract: (d) => {
        const rows: any[] = d.prices?.dwgm ?? []
        return {
          dates:  rows.map((r: any) => r.date),
          values: rows.map((r: any) => r.weightedAvg ?? null),
        }
      },
    })
    defs.push({
      id: 'dwgm-scheduled',
      label: 'DWGM Scheduled Price',
      unit: '$/GJ', category: 'Gas Prices', chartType: 'line',
      extract: (d) => {
        const rows: any[] = d.prices?.dwgm ?? []
        return {
          dates:  rows.map((r: any) => r.date),
          values: rows.map((r: any) => r.scheduledPrice ?? null),
        }
      },
    })
  }

  // ── Gas prices: STTM ──
  for (const [hub, label] of [['sttmSyd','STTM Sydney'],['sttmBri','STTM Brisbane'],['sttmAde','STTM Adelaide']]) {
    if (prices?.[hub]) {
      defs.push({
        id: `sttm-${hub}`,
        label: `${label} Price`,
        unit: '$/GJ', category: 'Gas Prices', chartType: 'line',
        extract: (d) => {
          const rows: any[] = d.prices?.[hub] ?? []
          return {
            dates:  rows.map((r: any) => r.date),
            values: rows.map((r: any) => r.price ?? null),
          }
        },
      })
    }
  }

  // ── LNG export ──
  if (lng?.facilities) {
    // Total
    defs.push({
      id: 'lng-total',
      label: 'LNG Export Total',
      unit: 'TJ/day', category: 'LNG Export', chartType: 'bar',
      extract: (d) => {
        const daily: any[] = d.lng?.daily ?? []
        const byDate: Record<string, number> = {}
        for (const row of daily) byDate[row.date] = (byDate[row.date] ?? 0) + row.demand
        const dates = Object.keys(byDate).sort()
        return { dates, values: dates.map(dt => byDate[dt] ?? null) }
      },
    })
    for (const facility of (lng.facilities as string[])) {
      defs.push({
        id: `lng|${facility}`,
        label: `LNG Export · ${facility}`,
        unit: 'TJ/day', category: 'LNG Export', chartType: 'bar',
        extract: (d) => {
          const daily: any[] = d.lng?.daily ?? []
          const byDate: Record<string, number> = {}
          for (const row of daily) {
            if (row.facility === facility) byDate[row.date] = (byDate[row.date] ?? 0) + row.demand
          }
          const dates = Object.keys(byDate).sort()
          return { dates, values: dates.map(dt => byDate[dt] ?? null) }
        },
      })
    }
  }

  return defs
}

// ── Date union alignment ──────────────────────────────────────────────────────
// Given multiple series with different date arrays, align them to a common date set
function alignSeries(seriesList: ResolvedSeries[]): {
  dates: string[]
  aligned: Record<string, (number|null)[]>
} {
  if (!seriesList.length) return { dates: [], aligned: {} }

  // Union of all dates, sorted
  const dateSet = new Set<string>()
  for (const s of seriesList) s.dates.forEach(d => dateSet.add(d))
  const dates = Array.from(dateSet).sort()

  const aligned: Record<string, (number|null)[]> = {}
  for (const s of seriesList) {
    const lookup: Record<string, number|null> = {}
    s.dates.forEach((d, i) => { lookup[d] = s.values[i] ?? null })
    aligned[s.id] = dates.map(d => lookup[d] ?? null)
  }
  return { dates, aligned }
}

// ── Axis assignment ───────────────────────────────────────────────────────────
// Group series by unit; if >1 unit group, use dual axes
function assignAxes(series: ResolvedSeries[]): Record<string, 'left'|'right'> {
  const units = Array.from(new Set(series.map(s => s.unit)))
  const result: Record<string, 'left'|'right'> = {}
  for (const s of series) {
    result[s.id] = units.indexOf(s.unit) === 0 ? 'left' : 'right'
  }
  return result
}

// ── Smart x-axis ticks ────────────────────────────────────────────────────────
function smartTicks(dates: string[], maxTicks = 10): string[] {
  if (!dates.length) return []
  const step = Math.max(1, Math.floor(dates.length / maxTicks))
  const ticks: string[] = []
  for (let i = 0; i < dates.length; i += step) ticks.push(dates[i])
  if (ticks[ticks.length - 1] !== dates[dates.length - 1]) ticks.push(dates[dates.length - 1])
  return ticks
}

// ── Caches (reuse across tab switches) ───────────────────────────────────────
let gbbCacheCC:    { data: any; at: number } | null = null
let priceCacheCC:  { data: any; at: number } | null = null
let lngCacheCC:    { data: any; at: number } | null = null
const TTL = 60 * 60 * 1000

// ── Main component ────────────────────────────────────────────────────────────
export default function CustomChartDashboard() {
  const [gbbData,    setGbbData]    = useState<any>(null)
  const [priceData,  setPriceData]  = useState<any>(null)
  const [lngData,    setLngData]    = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string|null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search,      setSearch]      = useState('')
  const [openCat,     setOpenCat]     = useState<string|null>(null)

  // Fetch all data sources in parallel
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const now = Date.now()
        const [gbbRes, priceRes, lngRes] = await Promise.all([
          gbbCacheCC && now - gbbCacheCC.at < TTL
            ? Promise.resolve(gbbCacheCC.data)
            : fetch('/api/gbb').then(r => r.json()).then(j => { if (j.ok) { gbbCacheCC = { data: j.data, at: Date.now() }; return j.data } throw new Error(j.error) }),
          priceCacheCC && now - priceCacheCC.at < TTL
            ? Promise.resolve(priceCacheCC.data)
            : fetch('/api/gasprices').then(r => r.json()).then(j => { if (j.ok) { priceCacheCC = { data: j.data, at: Date.now() }; return j.data } throw new Error(j.error) }),
          lngCacheCC && now - lngCacheCC.at < TTL
            ? Promise.resolve(lngCacheCC.data)
            : fetch('/api/lng').then(r => r.json()).then(j => { if (j.ok) { lngCacheCC = { data: j.data, at: Date.now() }; return j.data } throw new Error(j.error) }),
        ])
        setGbbData(gbbRes)
        setPriceData(priceRes)
        setLngData(lngRes)
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const allData: AllData = useMemo(() => ({
    gbb: gbbData, prices: priceData, lng: lngData,
  }), [gbbData, priceData, lngData])

  // Build catalogue from loaded data
  const catalogue = useMemo(() => buildCatalogue(allData), [allData])

  // Group by category
  const byCategory = useMemo(() => {
    const map: Record<string, SeriesDef[]> = {}
    for (const def of catalogue) {
      if (!map[def.category]) map[def.category] = []
      map[def.category].push(def)
    }
    return map
  }, [catalogue])

  // Filtered catalogue for search
  const filteredCatalogue = useMemo(() => {
    if (!search.trim()) return byCategory
    const q = search.toLowerCase()
    const map: Record<string, SeriesDef[]> = {}
    for (const [cat, defs] of Object.entries(byCategory)) {
      const matched = defs.filter(d => d.label.toLowerCase().includes(q))
      if (matched.length) map[cat] = matched
    }
    return map
  }, [byCategory, search])

  // Resolve selected series
  const activeSeries: ResolvedSeries[] = useMemo(() => {
    return selectedIds.flatMap((id, colourIdx) => {
      const def = catalogue.find(d => d.id === id)
      if (!def) return []
      const result = def.extract(allData)
      if (!result) return []
      return [{
        id:        def.id,
        label:     def.label,
        unit:      def.unit,
        dates:     result.dates,
        values:    result.values,
        category:  def.category,
        chartType: def.chartType,
      }]
    })
  }, [selectedIds, catalogue, allData])

  // Align all series to common date axis
  const { dates: chartDates, aligned } = useMemo(() => alignSeries(activeSeries), [activeSeries])

  // Axis assignment
  const axisMap = useMemo(() => assignAxes(activeSeries), [activeSeries])
  const units   = useMemo(() => Array.from(new Set(activeSeries.map(s => s.unit))), [activeSeries])
  const hasDualAxis = units.length > 1

  // Build chart rows
  const chartRows = useMemo(() => {
    return chartDates.map(d => {
      const row: Record<string, any> = { date: d }
      for (const s of activeSeries) row[s.id] = aligned[s.id]?.[chartDates.indexOf(d)] ?? null
      return row
    })
  }, [chartDates, aligned, activeSeries])

  const ticks = useMemo(() => smartTicks(chartDates), [chartDates])

  const toggleSeries = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const removeSeries = useCallback((id: string) => {
    setSelectedIds(prev => prev.filter(x => x !== id))
  }, [])

  const colourOf = (id: string) => SERIES_COLOURS[selectedIds.indexOf(id) % SERIES_COLOURS.length]

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-data)',
      fontSize: '0.75rem', color: 'var(--muted)' }}>
      Loading all data sources…
    </div>
  )

  if (error) return (
    <div style={{ padding: '2rem', color: 'var(--negative)', fontFamily: 'var(--font-data)' }}>
      Error: {error}
    </div>
  )

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>Custom Chart</h2>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)',
          fontSize: '0.65rem', marginTop: '0.25rem' }}>
          Add any series from GBB, gas prices and LNG to compare on one chart
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', alignItems: 'start' }}>

        {/* ── Left panel: series picker ── */}
        <div className="sq-card" style={{ padding: '1rem', position: 'sticky', top: 68,
          maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)',
            marginBottom: '0.75rem' }}>Data Series</div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search series…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '0.4rem 0.65rem',
              border: '1px solid var(--border)', borderRadius: 8,
              fontFamily: 'var(--font-data)', fontSize: '0.72rem',
              background: 'var(--surface-2)', color: 'var(--text)',
              outline: 'none', marginBottom: '0.75rem',
            }}
          />

          {/* Category groups */}
          {Object.entries(filteredCatalogue).map(([cat, defs]) => (
            <div key={cat} style={{ marginBottom: '0.5rem' }}>
              <button
                onClick={() => setOpenCat(openCat === cat ? null : cat)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '0.4rem 0.5rem',
                  border: 'none', background: 'var(--surface-2)',
                  borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font-ui)', fontSize: '0.75rem', fontWeight: 600,
                  color: 'var(--text-2)',
                }}
              >
                <span>{cat}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>
                  {defs.filter(d => selectedIds.includes(d.id)).length > 0
                    ? `${defs.filter(d => selectedIds.includes(d.id)).length} selected · `
                    : ''}{openCat === cat ? '▲' : '▼'}
                </span>
              </button>

              {(openCat === cat || search.trim()) && (
                <div style={{ paddingLeft: '0.25rem', marginTop: '0.25rem' }}>
                  {defs.map(def => {
                    const active = selectedIds.includes(def.id)
                    const colour = active ? colourOf(def.id) : 'var(--border)'
                    return (
                      <button
                        key={def.id}
                        onClick={() => toggleSeries(def.id)}
                        style={{
                          width: '100%', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.3rem 0.5rem', border: 'none',
                          background: active ? `${colour}18` : 'transparent',
                          borderRadius: 5, cursor: 'pointer',
                          borderLeft: `3px solid ${active ? colour : 'transparent'}`,
                          transition: 'all 0.12s',
                        }}
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: active ? colour : 'var(--border)',
                          transition: 'background 0.12s',
                        }} />
                        <span style={{
                          fontFamily: 'var(--font-data)', fontSize: '0.65rem',
                          color: active ? 'var(--text)' : 'var(--muted)',
                          fontWeight: active ? 600 : 400,
                          lineHeight: 1.3,
                        }}>
                          {def.label.replace(`${cat} · `, '')}
                        </span>
                        <span style={{
                          marginLeft: 'auto', fontFamily: 'var(--font-data)',
                          fontSize: '0.58rem', color: 'var(--muted-2)', flexShrink: 0,
                        }}>{def.unit}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Right panel: chart ── */}
        <div>
          {/* Active series chips */}
          {activeSeries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
              marginBottom: '0.75rem' }}>
              {activeSeries.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.25rem 0.6rem 0.25rem 0.5rem',
                  background: `${colourOf(s.id)}18`,
                  border: `1px solid ${colourOf(s.id)}50`,
                  borderRadius: 20, fontFamily: 'var(--font-data)', fontSize: '0.65rem',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%',
                    background: colourOf(s.id), flexShrink: 0 }} />
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.label}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.58rem' }}>{s.unit}</span>
                  <button onClick={() => removeSeries(s.id)} style={{
                    border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--muted)', fontSize: '0.75rem', padding: '0 0 0 0.15rem',
                    lineHeight: 1, display: 'flex', alignItems: 'center',
                  }}>×</button>
                </div>
              ))}
              {activeSeries.length > 1 && (
                <button onClick={() => setSelectedIds([])} style={{
                  padding: '0.25rem 0.6rem', borderRadius: 20,
                  border: '1px solid var(--border)', background: 'transparent',
                  fontFamily: 'var(--font-data)', fontSize: '0.65rem',
                  color: 'var(--muted)', cursor: 'pointer',
                }}>Clear all</button>
              )}
            </div>
          )}

          {/* Chart card */}
          <div className="sq-card" style={{ padding: '1.25rem' }}>
            {activeSeries.length === 0 ? (
              <div style={{
                height: 400, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              }}>
                <div style={{ fontSize: '2rem', opacity: 0.2 }}>📈</div>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.8rem',
                  color: 'var(--muted)', textAlign: 'center' }}>
                  Select series from the left panel to plot them here
                </div>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem',
                  color: 'var(--muted-2)', textAlign: 'center', maxWidth: 320 }}>
                  Mix GPG demand, production, pipeline flows, gas prices and LNG exports.<br />
                  A second axis is added automatically when units differ.
                </div>
              </div>
            ) : (
              <>
                {/* Axis legend */}
                {hasDualAxis && (
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem',
                    fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
                    <span style={{ color: 'var(--muted)' }}>
                      Left axis: <strong style={{ color: 'var(--text)' }}>{units[0]}</strong>
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      Right axis: <strong style={{ color: 'var(--text)' }}>{units[1]}</strong>
                    </span>
                  </div>
                )}

                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={chartRows} margin={{ top: 8, right: hasDualAxis ? 60 : 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      ticks={ticks}
                      tickFormatter={d => {
                        const [, m, dd] = d.split('-')
                        return `${dd}/${m}`
                      }}
                      tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                      tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={0}
                    />
                    {/* Left Y axis */}
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                      tickLine={false} axisLine={false} width={52}
                      tickFormatter={v => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : String(Math.round(v))}
                      label={units[0] ? {
                        value: units[0], angle: -90, position: 'insideLeft',
                        fill: 'var(--muted)', fontSize: 9, fontFamily: 'var(--font-data)', dy: 30,
                      } : undefined}
                    />
                    {/* Right Y axis — only when dual units */}
                    {hasDualAxis && (
                      <YAxis
                        yAxisId="right" orientation="right"
                        tick={{ fill: '#888', fontSize: 9, fontFamily: 'var(--font-data)' }}
                        tickLine={false} axisLine={false} width={52}
                        tickFormatter={v => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : String(Math.round(v * 10) / 10)}
                        label={units[1] ? {
                          value: units[1], angle: 90, position: 'insideRight',
                          fill: '#888', fontSize: 9, fontFamily: 'var(--font-data)', dy: -20,
                        } : undefined}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{
                            background: '#fff', border: '1px solid var(--border)',
                            borderRadius: 8, padding: '0.65rem 0.9rem',
                            fontFamily: 'var(--font-data)', fontSize: '0.72rem',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 200,
                          }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)',
                              marginBottom: '0.4rem', fontSize: '0.7rem' }}>
                              {fmtDate(label)}
                            </div>
                            {payload.map((p: any) => {
                              const s = activeSeries.find(s => s.id === p.dataKey)
                              if (p.value == null) return null
                              return (
                                <div key={p.dataKey} style={{
                                  display: 'flex', justifyContent: 'space-between',
                                  gap: '1.5rem', marginBottom: 3, alignItems: 'baseline',
                                }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%',
                                      background: p.stroke ?? p.fill, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ color: 'var(--text-2)', fontSize: '0.65rem',
                                      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {s?.label ?? p.dataKey}
                                    </span>
                                  </span>
                                  <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                    {typeof p.value === 'number'
                                      ? `${p.value.toFixed(s?.unit.includes('$') ? 2 : 1)} ${s?.unit ?? ''}`
                                      : '—'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }}
                    />
                    {activeSeries.map(s => {
                      const colour  = colourOf(s.id)
                      const yAxisId = axisMap[s.id] ?? 'left'
                      return s.chartType === 'bar'
                        ? <Bar key={s.id} dataKey={s.id} yAxisId={yAxisId}
                            fill={colour} fillOpacity={0.75} radius={[2,2,0,0]}
                            maxBarSize={18} />
                        : <Line key={s.id} type="monotone" dataKey={s.id} yAxisId={yAxisId}
                            stroke={colour} strokeWidth={2} dot={false} connectNulls
                            activeDot={{ r: 4, strokeWidth: 0, fill: colour }} />
                    })}
                  </ComposedChart>
                </ResponsiveContainer>

                {/* Date range info */}
                {chartDates.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-data)',
                    fontSize: '0.6rem', color: 'var(--muted)', textAlign: 'right' }}>
                    {chartDates[0]} → {chartDates[chartDates.length - 1]} · {chartDates.length} data points
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
