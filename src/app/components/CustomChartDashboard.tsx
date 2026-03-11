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

function downloadCsv(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const header = cols.join(',')
  const body   = rows.map(r => cols.map(c => {
    const v = r[c] ?? ''
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function fmtDate(d: string) {
  const [y, m, dd] = d.split('-')
  return `${parseInt(dd??'0')} ${MONTHS[parseInt(m??'1')-1]} ${(y??'').slice(2)}`
}

function fmtDateShort(d: string) {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

// ── Range / View types ───────────────────────────────────────────────────────
type DateRangeOption = 'all' | '1y' | '90d' | '30d' | '7d' | '3d'
const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: 'all', label: 'All'    },
  { value: '1y',  label: '1 year' },
  { value: '90d', label: '90d'    },
  { value: '30d', label: '30d'    },
  { value: '7d',  label: '7d'     },
  { value: '3d',  label: '3d'     },
]
type ViewMode = 'daily' | 'monthly'

// ── Types ─────────────────────────────────────────────────────────────────────

// A resolved series: date-aligned values ready to plot
export interface ResolvedSeries {
  id:       string          // unique key
  label:    string          // display name
  unit:     string          // TJ, $/GJ, MW, %
  dates:    string[]        // YYYY-MM-DD
  values:   (number|null)[] // aligned to dates
  category:   string          // source group label
  chartType:  'line' | 'bar'
  monthlyAgg: 'sum' | 'avg'   // how to aggregate daily values into months
}

// Catalogue entry describing how to extract a series from raw data
interface SeriesDef {
  id:         string
  label:      string
  unit:       string
  category:   string
  chartType:  'line' | 'bar'
  monthlyAgg: 'sum' | 'avg'
  extract:    (allData: AllData) => { dates: string[]; values: (number|null)[] } | null
}

interface AllData {
  gbb:    any
  prices: any
  lng:    any
  elec:   any   // gpggen: { dates, byRegion } from /api/gpggen
}

// ── Series catalogue ──────────────────────────────────────────────────────────
// Build all possible series definitions from available raw data
function buildCatalogue(allData: AllData): SeriesDef[] {
  const defs: SeriesDef[] = []
  const { gbb, prices, lng, elec } = allData

  // ── GBB: GPG demand by state+facility ──
  if (gbb?.gpgByState) {
    for (const [state, facilities] of Object.entries(gbb.gpgByState as Record<string,Record<string,(number|null)[]>>)) {
      for (const [facility, values] of Object.entries(facilities)) {
        defs.push({
          id: `gpg|${state}|${facility}`,
          label: `GPG · ${state} · ${facility}`,
          unit: 'TJ/day', category: 'GPG Gas Demand', chartType: 'bar', monthlyAgg: 'sum' as const,
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
        unit: 'TJ/day', category: 'GPG Gas Demand', chartType: 'bar', monthlyAgg: 'sum' as const,
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
          unit: 'TJ/day', category: 'Large Industry Demand', chartType: 'bar', monthlyAgg: 'sum' as const,
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
        unit: 'TJ/day', category: 'Gas Production', chartType: 'line', monthlyAgg: 'sum' as const,
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
          unit: 'TJ/day', category: 'Gas Production', chartType: 'line', monthlyAgg: 'sum' as const,
          extract: (d) => {
            const v = d.gbb?.prodByState?.[state]?.[facility]
            return v ? { dates: d.gbb.dates, values: v } : null
          },
        })
      }
    }
  }

  // ── GBB: Storage level, injection & withdrawal ──
  if (gbb?.storageByFacility) {
    for (const [facility, info] of Object.entries(gbb.storageByFacility as Record<string,any>)) {
      defs.push({
        id: `storage-level|${facility}`,
        label: `Storage Level · ${facility} (${info.state})`,
        unit: 'TJ', category: 'Gas Storage', chartType: 'line', monthlyAgg: 'avg' as const,
        extract: (d) => {
          const v = d.gbb?.storageByFacility?.[facility]?.heldInStorage
          return v ? { dates: d.gbb.dates, values: v } : null
        },
      })
      defs.push({
        id: `storage-inject|${facility}`,
        label: `Storage Injection · ${facility} (${info.state})`,
        unit: 'TJ/day', category: 'Gas Storage', chartType: 'bar', monthlyAgg: 'sum' as const,
        extract: (d) => {
          const v = d.gbb?.storageByFacility?.[facility]?.demand   // 'demand' = gas into storage
          return v ? { dates: d.gbb.dates, values: v } : null
        },
      })
      defs.push({
        id: `storage-withdraw|${facility}`,
        label: `Storage Withdrawal · ${facility} (${info.state})`,
        unit: 'TJ/day', category: 'Gas Storage', chartType: 'bar', monthlyAgg: 'sum' as const,
        extract: (d) => {
          const v = d.gbb?.storageByFacility?.[facility]?.supply   // 'supply' = gas out of storage
          return v ? { dates: d.gbb.dates, values: v } : null
        },
      })
    }
  }

  // ── GPG generation (MWh/day) — state totals + individual facilities ──
  if (elec?.byRegion && elec?.dates) {
    for (const [regionCode, regionData] of Object.entries(elec.byRegion as Record<string, any>)) {
      const regionLabel = regionData.label as string

      // State total
      defs.push({
        id: `gpg-gen-total|${regionCode}`,
        label: `GPG Generation Total · ${regionLabel}`,
        unit: 'MWh/day', category: 'GPG Generation', chartType: 'bar', monthlyAgg: 'sum' as const,
        extract: (d) => {
          const rd = d.elec?.byRegion?.[regionCode]
          if (!rd) return null
          return { dates: d.elec.dates, values: rd.stateTotal }
        },
      })

      // Individual facilities
      for (const fac of (regionData.facilities as { name: string; values: (number|null)[] }[])) {
        defs.push({
          id: `gpg-gen-fac|${regionCode}|${fac.name}`,
          label: `GPG Generation · ${regionLabel} · ${fac.name}`,
          unit: 'MWh/day', category: 'GPG Generation', chartType: 'line', monthlyAgg: 'sum' as const,
          extract: (d) => {
            const rd = d.elec?.byRegion?.[regionCode]
            if (!rd) return null
            const f = (rd.facilities as { name: string; values: (number|null)[] }[])
              .find(x => x.name === fac.name)
            if (!f) return null
            return { dates: d.elec.dates, values: f.values }
          },
        })
      }
    }
  }

  // ── GBB: Pipeline flows ──
  if (gbb?.pipelineFlows) {
    for (const [pipe] of Object.entries(gbb.pipelineFlows as Record<string,any>)) {
      defs.push({
        id: `pipeline|${pipe}`,
        label: `Pipeline · ${pipe}`,
        unit: 'TJ/day', category: 'Pipeline Flows', chartType: 'line', monthlyAgg: 'sum' as const,
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
      unit: '$/GJ', category: 'Gas Prices', chartType: 'line', monthlyAgg: 'avg' as const,
      extract: (d) => {
        const rows: any[] = d.prices?.dwgm ?? []
        return {
          dates:  rows.map((r: any) => r.gasDate),
          values: rows.map((r: any) => r.wdAvg ?? null),
        }
      },
    })
    defs.push({
      id: 'dwgm-bod',
      label: 'DWGM BOD Price',
      unit: '$/GJ', category: 'Gas Prices', chartType: 'line', monthlyAgg: 'avg' as const,
      extract: (d) => {
        const rows: any[] = d.prices?.dwgm ?? []
        return {
          dates:  rows.map((r: any) => r.gasDate),
          values: rows.map((r: any) => r.bod ?? null),
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
        unit: '$/GJ', category: 'Gas Prices', chartType: 'line', monthlyAgg: 'avg' as const,
        extract: (d) => {
          const rows: any[] = d.prices?.[hub] ?? []
          return {
            dates:  rows.map((r: any) => r.gasDate),
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
      unit: 'TJ/day', category: 'LNG Export', chartType: 'bar', monthlyAgg: 'sum' as const,
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
        unit: 'TJ/day', category: 'LNG Export', chartType: 'bar', monthlyAgg: 'sum' as const,
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

// ── Date intersection alignment ───────────────────────────────────────────────
// Aligns series to the INTERSECTION of their date ranges (smallest common window),
// so the chart never shows a long empty lead/tail from one series dominating.
function alignSeries(seriesList: ResolvedSeries[]): {
  dates: string[]
  aligned: Record<string, (number|null)[]>
} {
  if (!seriesList.length) return { dates: [], aligned: {} }

  // Build a lookup per series, then intersect dates
  const lookups: { id: string; lookup: Record<string, number|null> }[] = seriesList.map(s => {
    const lookup: Record<string, number|null> = {}
    s.dates.forEach((d, i) => { lookup[d] = s.values[i] ?? null })
    return { id: s.id, lookup }
  })

  // Start from union, then keep only dates where at least one series has real data
  // AND within the overlapping date range of all series that have any data.
  const allDates = new Set<string>()
  for (const s of seriesList) s.dates.forEach(d => allDates.add(d))

  // Per-series first/last date with actual (non-null) data
  const seriesSpans = seriesList.map(s => {
    const withData = s.dates.filter((d, i) => s.values[i] != null && s.values[i] !== 0)
    return { first: withData[0] ?? null, last: withData[withData.length - 1] ?? null }
  }).filter(sp => sp.first !== null)

  // Intersection: latest first-date and earliest last-date across all series
  const rangeStart = seriesSpans.reduce((acc, sp) => sp.first! > acc ? sp.first! : acc, seriesSpans[0]?.first ?? '')
  const rangeEnd   = seriesSpans.reduce((acc, sp) => sp.last!  < acc ? sp.last!  : acc, seriesSpans[0]?.last  ?? '')

  const dates = Array.from(allDates)
    .filter(d => d >= rangeStart && d <= rangeEnd)
    .sort()

  const aligned: Record<string, (number|null)[]> = {}
  for (const { id, lookup } of lookups) {
    aligned[id] = dates.map(d => lookup[d] ?? null)
  }
  return { dates, aligned }
}

// ── Axis assignment ───────────────────────────────────────────────────────────
// Uses BOTH unit difference AND scale ratio to decide on dual axes.
// If two series share the same unit but one is 10× larger, they still get split.
function seriesMedian(values: (number|null)[]): number {
  const nums = values.filter((v): v is number => v != null && v !== 0).sort((a, b) => a - b)
  if (!nums.length) return 1
  return nums[Math.floor(nums.length / 2)]
}

function assignAxes(series: ResolvedSeries[]): {
  axisMap:    Record<string, 'left'|'right'>
  leftUnit:   string
  rightUnit:  string
  hasDual:    boolean
} {
  if (!series.length) return { axisMap: {}, leftUnit: '', rightUnit: '', hasDual: false }

  // Group by unit
  const unitGroups: Record<string, ResolvedSeries[]> = {}
  for (const s of series) {
    if (!unitGroups[s.unit]) unitGroups[s.unit] = []
    unitGroups[s.unit].push(s)
  }
  const units = Object.keys(unitGroups)

  // If only one unit, check scale ratio within that group
  if (units.length === 1) {
    const medians = series.map(s => seriesMedian(s.values))
    const maxMed  = Math.max(...medians)
    const minMed  = Math.min(...medians.filter(m => m > 0))
    const ratio   = minMed > 0 ? maxMed / minMed : 1

    // Split onto two axes if scale differs by more than 5×
    if (ratio > 5 && series.length > 1) {
      // Put larger-scale series on left, smaller on right
      const sorted = [...series].sort((a, b) => seriesMedian(b.values) - seriesMedian(a.values))
      const leftIds  = new Set(sorted.slice(0, Math.ceil(sorted.length / 2)).map(s => s.id))
      const axisMap: Record<string, 'left'|'right'> = {}
      for (const s of series) axisMap[s.id] = leftIds.has(s.id) ? 'left' : 'right'
      return { axisMap, leftUnit: units[0]!, rightUnit: units[0]!, hasDual: true }
    }

    const axisMap: Record<string, 'left'|'right'> = {}
    for (const s of series) axisMap[s.id] = 'left'
    return { axisMap, leftUnit: units[0]!, rightUnit: '', hasDual: false }
  }

  // Multiple units: first unit on left, second on right, rest also right
  const axisMap: Record<string, 'left'|'right'> = {}
  for (const s of series) axisMap[s.id] = s.unit === units[0] ? 'left' : 'right'
  return { axisMap, leftUnit: units[0]!, rightUnit: units[1]!, hasDual: true }
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
let elecCacheCC:   { data: any; at: number } | null = null
const TTL = 60 * 60 * 1000

// ── Main component ────────────────────────────────────────────────────────────
export default function CustomChartDashboard() {
  const [gbbData,    setGbbData]    = useState<any>(null)
  const [priceData,  setPriceData]  = useState<any>(null)
  const [lngData,    setLngData]    = useState<any>(null)
  const [elecData,   setElecData]   = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string|null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search,      setSearch]      = useState('')
  const [openCat,     setOpenCat]     = useState<string|null>(null)
  const [range,       setRange]       = useState<DateRangeOption>('all')
  const [viewMode,    setViewMode]    = useState<ViewMode>('daily')

  // Fetch all data sources in parallel
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const now = Date.now()
        const [gbbRes, priceRes, lngRes, elecRes] = await Promise.all([
          gbbCacheCC && now - gbbCacheCC.at < TTL
            ? Promise.resolve(gbbCacheCC.data)
            : fetch('/api/gbb').then(r => r.json()).then(j => { if (j.ok) { gbbCacheCC = { data: j.data, at: Date.now() }; return j.data } throw new Error(j.error) }),
          priceCacheCC && now - priceCacheCC.at < TTL
            ? Promise.resolve(priceCacheCC.data)
            : fetch('/api/gasprices').then(r => r.json()).then(j => { if (j.ok) { priceCacheCC = { data: j.data, at: Date.now() }; return j.data } throw new Error(j.error) }),
          lngCacheCC && now - lngCacheCC.at < TTL
            ? Promise.resolve(lngCacheCC.data)
            : fetch('/api/lng').then(r => r.json()).then(j => { if (j.ok) { lngCacheCC = { data: j.data, at: Date.now() }; return j.data } throw new Error(j.error) }),
          // Daily GPG generation MWh per facility + state totals
          elecCacheCC && now - elecCacheCC.at < TTL
            ? Promise.resolve(elecCacheCC.data)
            : fetch('/api/gpggen').then(r => r.json()).then(j => {
                if (j.ok) { elecCacheCC = { data: j.data, at: Date.now() }; return j.data }
                throw new Error(j.error)
              }),
        ])
        setGbbData(gbbRes)
        setPriceData(priceRes)
        setLngData(lngRes)
        setElecData(elecRes)
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const allData: AllData = useMemo(() => ({
    gbb: gbbData, prices: priceData, lng: lngData, elec: elecData,
  }), [gbbData, priceData, lngData, elecData])

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
        chartType:  def.chartType,
        monthlyAgg: def.monthlyAgg,
      }]
    })
  }, [selectedIds, catalogue, allData])

  // Align series to intersection date range
  const { dates: allDates, aligned } = useMemo(() => alignSeries(activeSeries), [activeSeries])

  // Apply date range window (from the end of the available intersection)
  const windowedDates = useMemo(() => {
    if (range === 'all' || !allDates.length) return allDates
    const days = range === '1y' ? 365 : range === '90d' ? 90 : range === '30d' ? 30 : range === '7d' ? 7 : 3
    return allDates.slice(-days)
  }, [allDates, range])

  // Axis assignment — scale-aware + unit-aware
  const { axisMap, leftUnit, rightUnit, hasDual: hasDualAxis } = useMemo(
    () => assignAxes(activeSeries), [activeSeries]
  )
  const units = useMemo(() => Array.from(new Set(activeSeries.map(s => s.unit))), [activeSeries])

  // Monthly aggregation — sums for flow/volume series, averages for levels and prices
  const MONTHS_CC = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthlyRows = useMemo(() => {
    // Accumulate sum + count per series per month
    const byMonth: Record<string, Record<string, { sum: number; count: number }>> = {}
    for (const d of windowedDates) {
      const month = d.slice(0, 7)
      if (!byMonth[month]) byMonth[month] = {}
      const idx = allDates.indexOf(d)
      for (const s of activeSeries) {
        const v = aligned[s.id]?.[idx]
        if (v == null) continue
        if (!byMonth[month][s.id]) byMonth[month][s.id] = { sum: 0, count: 0 }
        byMonth[month][s.id].sum   += v
        byMonth[month][s.id].count += 1
      }
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, acc]) => {
        const [y, m] = ym.split('-')
        const row: Record<string, any> = {
          date: `${MONTHS_CC[parseInt(m??'1')-1]} ${(y??'').slice(2)}`
        }
        for (const s of activeSeries) {
          const a = acc[s.id]
          if (!a) { row[s.id] = null; continue }
          row[s.id] = s.monthlyAgg === 'avg'
            ? Math.round((a.sum / a.count) * 100) / 100
            : Math.round(a.sum * 10) / 10
        }
        return row
      })
  }, [windowedDates, allDates, aligned, activeSeries])

  // Daily chart rows
  const dailyRows = useMemo(() => {
    return windowedDates.map(d => {
      const idx = allDates.indexOf(d)
      const row: Record<string, any> = { date: d }
      for (const s of activeSeries) row[s.id] = aligned[s.id]?.[idx] ?? null
      return row
    })
  }, [windowedDates, allDates, aligned, activeSeries])

  const chartRows = viewMode === 'monthly' ? monthlyRows : dailyRows
  const chartDates = viewMode === 'monthly'
    ? monthlyRows.map(r => r.date as string)
    : windowedDates

  const ticks = useMemo(() => smartTicks(viewMode === 'monthly' ? monthlyRows.map(r => r.date as string) : windowedDates), [windowedDates, monthlyRows, viewMode])

  // CSV export rows — flatten series into columns
  const csvRows = useMemo(() => {
    const rows = viewMode === 'monthly' ? monthlyRows : dailyRows
    return rows.map(row => {
      const out: Record<string, any> = { date: row.date }
      for (const s of activeSeries) {
        out[s.label] = row[s.id] ?? ''
      }
      return out
    })
  }, [viewMode, monthlyRows, dailyRows, activeSeries])

  const csvFilename = `custom-chart-${viewMode}-${new Date().toISOString().slice(0,10)}.csv`

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
              {activeSeries.length > 0 && (
                <button onClick={() => downloadCsv(csvRows, csvFilename)} style={{
                  padding: '0.25rem 0.6rem', borderRadius: 20,
                  border: '1px solid var(--accent)', background: 'transparent',
                  fontFamily: 'var(--font-data)', fontSize: '0.65rem',
                  color: 'var(--accent)', cursor: 'pointer', fontWeight: 500,
                }}>↓ CSV</button>
              )}
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
                {/* View/Range controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {/* View mode */}
                    <div style={{ display: 'flex', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
                      {([{value:'daily',label:'Daily'},{value:'monthly',label:'Monthly'}] as {value:ViewMode;label:string}[]).map(opt => {
                        const active = opt.value === viewMode
                        return (
                          <button key={opt.value} onClick={() => setViewMode(opt.value)} style={{
                            padding: '0.25rem 0.65rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)', fontSize: '0.72rem', fontWeight: active ? 600 : 400,
                            background: active ? 'var(--accent)' : 'transparent',
                            color: active ? '#fff' : 'var(--muted)', transition: 'all 0.15s',
                          }}>{opt.label}</button>
                        )
                      })}
                    </div>
                    {/* Date range */}
                    <div style={{ display: 'flex', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
                      {DATE_RANGE_OPTIONS.map(opt => {
                        const active = opt.value === range
                        return (
                          <button key={opt.value} onClick={() => setRange(opt.value)} style={{
                            padding: '0.25rem 0.65rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)', fontSize: '0.72rem', fontWeight: active ? 600 : 400,
                            background: active ? 'var(--accent)' : 'transparent',
                            color: active ? '#fff' : 'var(--muted)', transition: 'all 0.15s',
                          }}>{opt.label}</button>
                        )
                      })}
                    </div>
                  </div>
                  {hasDualAxis && (
                    <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
                      <span style={{ color: 'var(--muted)' }}>
                        ← <strong style={{ color: 'var(--text)' }}>{leftUnit}</strong>
                        {viewMode === 'monthly' && activeSeries.find(s => axisMap[s.id] === 'left')?.monthlyAgg === 'avg'
                          ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (avg)</span>
                          : viewMode === 'monthly' ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (sum)</span> : null}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>
                        <strong style={{ color: 'var(--text)' }}>{rightUnit || leftUnit}</strong>
                        {viewMode === 'monthly' && activeSeries.find(s => axisMap[s.id] === 'right')?.monthlyAgg === 'avg'
                          ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (avg)</span>
                          : viewMode === 'monthly' ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (sum)</span> : null}
                        {' →'}
                      </span>
                    </div>
                  )}
                </div>

                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={chartRows} margin={{ top: 8, right: hasDualAxis ? 60 : 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      ticks={ticks}
                      tickFormatter={d => {
                        if (viewMode === 'monthly') return d
                        const parts = d.split('-')
                        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d
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
                      label={leftUnit ? {
                        value: leftUnit, angle: -90, position: 'insideLeft',
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
                        label={rightUnit ? {
                          value: rightUnit, angle: 90, position: 'insideRight',
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
                                      ? `${p.value.toFixed(s?.unit.includes('$') ? 2 : 1)} ${s?.unit ?? ''}${viewMode === 'monthly' && s?.monthlyAgg === 'avg' ? ' avg' : viewMode === 'monthly' ? ' total' : ''}`
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
                {windowedDates.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-data)',
                    fontSize: '0.6rem', color: 'var(--muted)', textAlign: 'right' }}>
                    {windowedDates[0]} → {windowedDates[windowedDates.length-1]} · {windowedDates.length} days
                    {allDates.length > windowedDates.length && ` (of ${allDates.length} available)`}
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
