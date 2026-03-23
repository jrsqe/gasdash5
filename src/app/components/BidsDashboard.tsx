'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Cell, LineChart,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type NemRegion = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'
type FuelMode  = 'both' | 'gas' | 'coal'

const REGIONS: NemRegion[] = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const RLABEL: Record<NemRegion, string> = { NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA' }
const RCOL:   Record<NemRegion, string> = {
  NSW1: '#0071E3', VIC1: '#30C254', QLD1: '#FF9F0A', SA1: '#AF52DE',
}

// Periods — neoLabel is what NEOpoint's API accepts, weeksBack is the from= offset
const PERIOD_OPTS = [
  { label: 'Daily',       neoLabel: 'Daily',       daysBack: 1  },
  { label: '3 Days',      neoLabel: 'Three Days',  daysBack: 3  },
  { label: 'Weekly',      neoLabel: 'Weekly',      daysBack: 7  },
  { label: 'Fortnightly', neoLabel: 'Fortnightly', daysBack: 14 },
  { label: 'Monthly',     neoLabel: 'Monthly',     daysBack: 30 },
]
type PeriodLabel = typeof PERIOD_OPTS[number]['label']

// ── DUID sets (from AEMO registration list) ───────────────────────────────────
const GAS_DUIDS = new Set([
  'CG1','CG2','CG3','CG4','TALWA1','TALWB1',
  'URANQ11','URANQ12','URANQ13','URANQ14',
  'HUNTER1','HUNTER2','SITHE01',
  'MORTLK11','MORTLK12',
  'JLA01','JLA02','JLA03','JLA04',
  'JLB01','JLB02','JLB03',
  'LNGS1','LNGS2','AGLSOM','NPS','BDL01','BDL02',
  'VPGS1','VPGS2','VPGS3','VPGS4','VPGS5','VPGS6',
  'DDPS1','CPSA',
  'BRAEMAR1','BRAEMAR2','BRAEMAR3',
  'BRAEMAR5','BRAEMAR6','BRAEMAR7',
  'OAKEY1','OAKEY2','SWAN_E',
  'YABULU','YABULU2','YARWUN_1','ROMA_7','ROMA_8',
  'TORRB1','TORRB2','TORRB3','TORRB4',
  'OSB-AG','PPCCGT',
  'QPS1','QPS2','QPS3','QPS4','QPS5',
  'LADBROK1','LADBROK2',
  'DRYCGT1','DRYCGT2','DRYCGT3',
  'MINTARO','AGLHAL','BARKIPS1',
])

const COAL_DUIDS = new Set([
  'BW01','BW02','BW03','BW04',
  'ER01','ER02','ER03','ER04',
  'MP1','MP2','VP5','VP6',
  'LYA1','LYA2','LYA3','LYA4',
  'LOYYB1','LOYYB2',
  'YWPS1','YWPS2','YWPS3','YWPS4',
  'CALL_B_1','CALL_B_2','CPP_3','CPP_4',
  'MPP_1','MPP_2','KPP_1',
  'STAN-1','STAN-2','STAN-3','STAN-4',
  'TARONG#1','TARONG#2','TARONG#3','TARONG#4',
  'TNPS1',
  'GSTONE1','GSTONE2','GSTONE3','GSTONE4','GSTONE5','GSTONE6',
])

const DUID_STATION: Record<string, string> = {
  CG1:'Colongra', CG2:'Colongra', CG3:'Colongra', CG4:'Colongra',
  TALWA1:'Tallawarra', TALWB1:'Tallawarra',
  URANQ11:'Uranquinty', URANQ12:'Uranquinty', URANQ13:'Uranquinty', URANQ14:'Uranquinty',
  HUNTER1:'Hunter PS', HUNTER2:'Hunter PS', SITHE01:'Smithfield',
  MORTLK11:'Mortlake', MORTLK12:'Mortlake',
  JLA01:'Jeeralang A', JLA02:'Jeeralang A', JLA03:'Jeeralang A', JLA04:'Jeeralang A',
  JLB01:'Jeeralang B', JLB02:'Jeeralang B', JLB03:'Jeeralang B',
  LNGS1:'Laverton North', LNGS2:'Laverton North',
  AGLSOM:'Somerton', NPS:'Newport',
  BDL01:'Bairnsdale', BDL02:'Bairnsdale',
  VPGS1:'Valley Power', VPGS2:'Valley Power', VPGS3:'Valley Power',
  VPGS4:'Valley Power', VPGS5:'Valley Power', VPGS6:'Valley Power',
  DDPS1:'Darling Downs', CPSA:'Condamine',
  BRAEMAR1:'Braemar', BRAEMAR2:'Braemar', BRAEMAR3:'Braemar',
  BRAEMAR5:'Braemar 2', BRAEMAR6:'Braemar 2', BRAEMAR7:'Braemar 2',
  OAKEY1:'Oakey', OAKEY2:'Oakey', SWAN_E:'Swanbank E',
  YABULU:'Townsville GT', YABULU2:'Townsville GT',
  YARWUN_1:'Yarwun', ROMA_7:'Roma', ROMA_8:'Roma',
  TORRB1:'Torrens Isl B', TORRB2:'Torrens Isl B',
  TORRB3:'Torrens Isl B', TORRB4:'Torrens Isl B',
  'OSB-AG':'Osborne', PPCCGT:'Pelican Point',
  QPS1:'Quarantine', QPS2:'Quarantine', QPS3:'Quarantine', QPS4:'Quarantine', QPS5:'Quarantine',
  LADBROK1:'Ladbroke Grove', LADBROK2:'Ladbroke Grove',
  DRYCGT1:'Dry Creek GT', DRYCGT2:'Dry Creek GT', DRYCGT3:'Dry Creek GT',
  MINTARO:'Mintaro GT', AGLHAL:'Hallett', BARKIPS1:'Barker Inlet',
  BW01:'Bayswater', BW02:'Bayswater', BW03:'Bayswater', BW04:'Bayswater',
  ER01:'Eraring', ER02:'Eraring', ER03:'Eraring', ER04:'Eraring',
  MP1:'Mt Piper', MP2:'Mt Piper', VP5:'Vales Pt', VP6:'Vales Pt',
  LYA1:'Loy Yang A', LYA2:'Loy Yang A', LYA3:'Loy Yang A', LYA4:'Loy Yang A',
  LOYYB1:'Loy Yang B', LOYYB2:'Loy Yang B',
  YWPS1:'Yallourn', YWPS2:'Yallourn', YWPS3:'Yallourn', YWPS4:'Yallourn',
  CALL_B_1:'Callide B', CALL_B_2:'Callide B',
  CPP_3:'Callide C', CPP_4:'Callide C',
  MPP_1:'Millmerran', MPP_2:'Millmerran', KPP_1:'Kogan Creek',
  'STAN-1':'Stanwell','STAN-2':'Stanwell','STAN-3':'Stanwell','STAN-4':'Stanwell',
  'TARONG#1':'Tarong','TARONG#2':'Tarong','TARONG#3':'Tarong','TARONG#4':'Tarong',
  TNPS1:'Tarong North',
  GSTONE1:'Gladstone', GSTONE2:'Gladstone', GSTONE3:'Gladstone',
  GSTONE4:'Gladstone', GSTONE5:'Gladstone', GSTONE6:'Gladstone',
}

// Station colours for the bid price chart (per-station lines)
const STATION_COLOURS = [
  '#0071E3','#FF9F0A','#30C254','#FF453A','#BF5AF2',
  '#64D2FF','#FF6B35','#FFD60A','#98989D','#FF2D55',
  '#5E5CE6','#34C759','#FF9500','#00C7BE','#007AFF',
]

// ── Price buckets (for the bid stack chart) ───────────────────────────────────
const BUCKETS = [
  { k: '< $0',     lo: -1e9, hi: 0,    col: '#636366' },
  { k: '$0–50',    lo: 0,    hi: 50,   col: '#30C254' },
  { k: '$50–100',  lo: 50,   hi: 100,  col: '#64D2FF' },
  { k: '$100–200', lo: 100,  hi: 200,  col: '#0071E3' },
  { k: '$200–300', lo: 200,  hi: 300,  col: '#FF9F0A' },
  { k: '$300–500', lo: 300,  hi: 500,  col: '#FF6B35' },
  { k: '$500–1k',  lo: 500,  hi: 1000, col: '#FF453A' },
  { k: '$1k+',     lo: 1000, hi: 1e9,  col: '#BF5AF2' },
]

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDT(s: string): string {
  const clean = (s || '').replace('T', ' ')
  const [date = '', time = ''] = clean.split(' ')
  const parts = date.split('-')
  return `${parts[2] || ''}/${parts[1] || ''} ${time.slice(0, 5)}`
}

// ── API fetch (single day) ────────────────────────────────────────────────────
async function fetchDay(report: string, date: string, instances: string, period = 'Daily'): Promise<any[]> {
  const params = new URLSearchParams({
    report, from: `${date} 00:00`, period, instances, section: '-1',
  })
  const res = await fetch(`/api/neopoint?${params.toString()}`)
  const j   = await res.json()
  if (!j.ok) return []
  if (Array.isArray(j.data)) return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

// ── Parse region bids row ─────────────────────────────────────────────────────
// Each col: ".$84.79, BW01, BW02" → { price, mw, duids }
function parseBands(row: any): Array<{ price: number; mw: number; duids: string[] }> {
  const out: Array<{ price: number; mw: number; duids: string[] }> = []
  for (const [key, val] of Object.entries(row) as [string, any][]) {
    if (!key.startsWith('.$')) continue
    const mw = Number(val)
    if (!mw || mw <= 0 || !isFinite(mw)) continue
    const parts = key.slice(2).split(',').map((p: string) => p.trim())
    const price = parseFloat(parts[0])
    const duids = parts.slice(1).filter(Boolean)
    if (isNaN(price) || !duids.length) continue
    out.push({ price, mw, duids })
  }
  return out
}

function bucketOf(price: number): string {
  for (const b of BUCKETS) if (price >= b.lo && price < b.hi) return b.k
  return '$1k+'
}

// ── Build bid STACK chart rows (MW by price band over time) ───────────────────
function buildStackRows(rows: any[], mode: FuelMode): Array<Record<string, any>> {
  if (!rows.length) return []
  // Sample every 6 rows = 30 min intervals
  return rows.filter((_, i) => i % 6 === 0).map(row => {
    const bands = parseBands(row)
    const rec: Record<string, any> = { time: fmtDT(String(row.DateTime || '')) }
    for (const k of Object.keys(row)) {
      if (k.includes('Price 5min')) { rec.spot = Number(row[k]); break }
    }
    for (const b of BUCKETS) rec[b.k] = 0
    for (const band of bands) {
      const gasDuids  = band.duids.filter(d => GAS_DUIDS.has(d))
      const coalDuids = band.duids.filter(d => COAL_DUIDS.has(d))
      const total     = band.duids.length || 1
      if ((mode === 'gas' || mode === 'both') && gasDuids.length) {
        const bk = bucketOf(band.price)
        rec[bk] = (rec[bk] || 0) + Math.round(band.mw * gasDuids.length / total)
      }
      if ((mode === 'coal' || mode === 'both') && coalDuids.length) {
        const bk = bucketOf(band.price)
        rec[bk] = (rec[bk] || 0) + Math.round(band.mw * coalDuids.length / total)
      }
    }
    return rec
  })
}

// ── Build STATION BID PRICE chart ─────────────────────────────────────────────
// For each 30-min interval, what was the volume-weighted average bid price per station?
interface StationPriceRow { time: string; [station: string]: any }

function buildStationPrices(rows: any[], mode: FuelMode): { chartRows: StationPriceRow[]; stations: string[] } {
  if (!rows.length) return { chartRows: [], stations: [] }

  const stationSet = new Set<string>()

  const chartRows: StationPriceRow[] = rows.filter((_, i) => i % 6 === 0).map(row => {
    const bands = parseBands(row)
    const rec: StationPriceRow = { time: fmtDT(String(row.DateTime || '')) }

    // Per station: accumulate price*mw and total mw to compute weighted avg price
    const wsum: Record<string, number> = {}
    const wmw:  Record<string, number> = {}

    for (const band of bands) {
      for (const duid of band.duids) {
        const isGas  = GAS_DUIDS.has(duid)
        const isCoal = COAL_DUIDS.has(duid)
        if (!isGas && !isCoal) continue
        if (mode === 'gas'  && !isGas)  continue
        if (mode === 'coal' && !isCoal) continue

        const stn = DUID_STATION[duid] || duid
        const mwShare = band.mw / (band.duids.length || 1)
        wsum[stn] = (wsum[stn] || 0) + band.price * mwShare
        wmw[stn]  = (wmw[stn]  || 0) + mwShare
      }
    }

    for (const [stn, mw] of Object.entries(wmw)) {
      if (mw > 0) {
        rec[stn] = Math.round((wsum[stn] / mw) * 10) / 10
        stationSet.add(stn)
      }
    }
    return rec
  })

  return { chartRows, stations: Array.from(stationSet).sort() }
}

// ── Station avg MW (for the summary bar chart) ────────────────────────────────
interface StationAvg { name: string; fuel: 'gas' | 'coal'; avgMw: number }

function buildStationAvgs(rows: any[], mode: FuelMode): StationAvg[] {
  if (!rows.length) return []
  const sums: Record<string, { fuel: 'gas' | 'coal'; total: number }> = {}
  for (const row of rows) {
    for (const band of parseBands(row)) {
      const process = (duids: string[], fuel: 'gas' | 'coal') => {
        if (!duids.length) return
        if (mode === 'gas' && fuel !== 'gas') return
        if (mode === 'coal' && fuel !== 'coal') return
        const share = band.mw / (band.duids.length || 1)
        const stns: Record<string, number> = {}
        for (const d of duids) {
          const stn = DUID_STATION[d] || d
          stns[stn] = (stns[stn] || 0) + 1
        }
        for (const [stn, cnt] of Object.entries(stns)) {
          if (!sums[stn]) sums[stn] = { fuel, total: 0 }
          sums[stn].total += share * cnt
        }
      }
      process(band.duids.filter(d => GAS_DUIDS.has(d)), 'gas')
      process(band.duids.filter(d => COAL_DUIDS.has(d)), 'coal')
    }
  }
  return Object.entries(sums)
    .map(([name, { fuel, total }]) => ({ name, fuel, avgMw: Math.round(total / rows.length) }))
    .filter(s => s.avgMw > 0)
    .sort((a, b) => b.avgMw - a.avgMw)
    .slice(0, 20)
}

// ── Build price setter summary ────────────────────────────────────────────────
// "Energy Pricesetting by Station" returns rows like:
// { DateTime, StationA.PERCENTSETTING: 0.42, StationB.PERCENTSETTING: 0.18, ... }
// OR summary rows: { Station: 'Loy Yang A', PERCENTSETTING: 0.42 }
interface PsStation { name: string; pct: number; fuel: 'gas'|'coal'|'other' }

function stationFuel(name: string): 'gas'|'coal'|'other' {
  // Check against known station names
  const gasList = ['Colongra','Tallawarra','Uranquinty','Hunter PS','Smithfield',
    'Mortlake','Jeeralang A','Jeeralang B','Laverton North','Somerton','Newport',
    'Bairnsdale','Valley Power','Darling Downs','Condamine','Braemar','Braemar 2',
    'Oakey','Swanbank E','Townsville GT','Yarwun','Roma',
    'Torrens Isl B','Osborne','Pelican Point','Quarantine','Ladbroke Grove',
    'Dry Creek GT','Mintaro GT','Hallett','Barker Inlet']
  const coalList = ['Bayswater','Eraring','Mt Piper','Vales Pt',
    'Loy Yang A','Loy Yang B','Yallourn',
    'Callide B','Callide C','Millmerran','Kogan Creek',
    'Stanwell','Tarong','Tarong North','Gladstone']
  if (gasList.some(g => name.includes(g))) return 'gas'
  if (coalList.some(c => name.includes(c))) return 'coal'
  return 'other'
}

function buildPsSummary(rows: any[]): PsStation[] {
  if (!rows.length) return []
  const first = rows[0]
  const keys = Object.keys(first).filter(k => k !== 'DateTime')

  // Detect format: time-series vs summary
  const isTimeSeries = 'DateTime' in first

  if (isTimeSeries) {
    // Average each column across all rows
    const avgs: Record<string, number> = {}
    for (const k of keys) {
      const vals = rows.map(r => Number(r[k])).filter(v => isFinite(v) && v > 0)
      if (vals.length) avgs[k] = vals.reduce((s, v) => s + v, 0) / vals.length
    }
    return Object.entries(avgs)
      .map(([k, pct]) => ({
        name: k.replace(/\.PERCENTSETTING$|_PERCENTSETTING$/i, ''),
        pct:  Math.round(pct * 1000) / 10,  // to percent
        fuel: stationFuel(k),
      }))
      .filter(s => s.pct > 0.1)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 20)
  }

  // Summary format: each row is a station
  return rows
    .map(r => {
      const name = String(r.Station ?? r.Name ?? r.DUID ?? keys[0] ?? '')
      const pct  = Number(r.PERCENTSETTING ?? r.Pct ?? r[keys[0]] ?? 0)
      return { name, pct: Math.round(pct * 1000) / 10, fuel: stationFuel(name) }
    })
    .filter(s => s.pct > 0.1)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 20)
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '1.25rem', marginBottom: '0.75rem', ...style,
    }}>
      {children}
    </div>
  )
}

function ChartTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem',
      marginBottom: '0.75rem', flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
        {title}
      </h3>
      {sub && <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>{sub}</span>}
    </div>
  )
}

function PillGroup({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: Array<{ v: string; label: string }>
}) {
  return (
    <div style={{
      display: 'flex', background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2,
    }}>
      {options.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '0.25rem 0.65rem', borderRadius: 6, border: 'none',
          cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.72rem',
          transition: 'all 0.15s', fontWeight: value === v ? 600 : 400,
          background: value === v ? 'var(--accent)' : 'transparent',
          color:      value === v ? '#fff' : 'var(--muted)',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BidsDashboard() {
  const [region,      setRegion]      = useState<NemRegion>('NSW1')
  const [periodLabel, setPeriodLabel] = useState<PeriodLabel>('Weekly')
  const [mode,        setMode]        = useState<FuelMode>('both')
  const [rows,        setRows]        = useState<any[]>([])
  const [psRows,      setPsRows]      = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  const [progress,    setProgress]    = useState('')
  const [error,       setError]       = useState<string | null>(null)

  const activePeriod = PERIOD_OPTS.find(p => p.label === periodLabel) ?? PERIOD_OPTS[2]
  // from = start of the period (daysBack ago), so the period window covers completed data
  const fromDate = useMemo(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - activePeriod.daysBack)
    return d.toISOString().slice(0, 10)
  }, [activePeriod.daysBack])

  // Fetch bids + price setter together when region/period changes
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setRows([]); setPsRows([]); setProgress('Loading…')

    async function run() {
      const bidReport = '104 Bids - Energy\\Region Bids at Actual Prices 5min'
      const psReport  = '108 Price Setter\\Energy Pricesetting by Station'

      // Single fetch per report using NEOpoint's native period
      const [bidData, psData] = await Promise.all([
        fetchDay(bidReport, fromDate, `GEN;${region}`, activePeriod.neoLabel),
        fetchDay(psReport,  fromDate, region,           activePeriod.neoLabel),
      ])

      if (!cancelled) {
        setRows(bidData)
        setPsRows(psData)
        setLoading(false)
        setProgress('')
      }
    }

    run().catch(e => { if (!cancelled) { setError(String(e?.message || e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [region, fromDate, activePeriod.neoLabel])

  const stackRows              = useMemo(() => buildStackRows(rows, mode), [rows, mode])
  const { chartRows: priceRows, stations } = useMemo(() => buildStationPrices(rows, mode), [rows, mode])
  const stationAvgs            = useMemo(() => buildStationAvgs(rows, mode), [rows, mode])
  const psStations             = useMemo(() => buildPsSummary(psRows), [psRows])

  const presentBuckets = BUCKETS.filter(b => stackRows.some(r => (r[b.k] || 0) > 0))
  const hasSpot        = stackRows.some(r => r.spot != null && isFinite(r.spot))
  const fuelLabel      = mode === 'both' ? 'Gas & Coal' : mode === 'gas' ? 'Gas' : 'Coal'


  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>Generator Bids</h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)',
          fontFamily: 'var(--font-data)', fontSize: '0.65rem' }}>
          NEOpoint · {fuelLabel} generators · {activePeriod.label} from {fromDate} · {RLABEL[region]}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        alignItems: 'center', marginBottom: '1.25rem' }}>

        {/* Region */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {REGIONS.map(r => (
            <button key={r} onClick={() => setRegion(r)} style={{
              padding: '0.4rem 0.9rem', border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
              fontWeight: r === region ? 600 : 400,
              color: r === region ? RCOL[r] : 'var(--muted)',
              borderBottom: r === region ? `2px solid ${RCOL[r]}` : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}>{RLABEL[r]}</button>
          ))}
        </div>

        {/* Period */}
        <PillGroup
          value={periodLabel}
          onChange={v => setPeriodLabel(v as PeriodLabel)}
          options={PERIOD_OPTS.map(p => ({ v: p.label, label: p.label }))}
        />

        {/* Fuel */}
        <PillGroup
          value={mode}
          onChange={v => setMode(v as FuelMode)}
          options={[
            { v: 'both', label: 'Gas & Coal' },
            { v: 'gas',  label: 'Gas only' },
            { v: 'coal', label: 'Coal only' },
          ]}
        />

        {loading && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)' }}>
            {progress || 'Loading…'}
          </span>
        )}
      </div>

      {error && (
        <Card style={{ color: 'var(--negative)' }}>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>Error: {error}</span>
        </Card>
      )}

      {loading && !rows.length && (
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem',
            color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            {progress || 'Loading bid data…'}
          </div>
        </Card>
      )}

      {/* ── 1. Station bid price chart ── */}
      {priceRows.length > 0 && (
        <Card>
          <ChartTitle
            title={`${fuelLabel} Station Bid Prices · ${RLABEL[region]}`}
            sub="volume-weighted avg bid price per station · 30-min sample"
          />
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', marginBottom: '0.75rem' }}>
            {stations.map((s, i) => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--text)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 9,
                  background: STATION_COLOURS[i % STATION_COLOURS.length],
                  display: 'inline-block', flexShrink: 0 }} />
                {s}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={priceRows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time"
                tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
                interval={Math.max(0, Math.floor(priceRows.length / 14) - 1)} />
              <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                width={44} tickFormatter={(v: number) => `$${Math.round(v)}`} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.65rem' }}
                formatter={(v: any, name: string) => [`$${Number(v).toFixed(2)}/MWh`, name]}
              />
              {stations.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s}
                  stroke={STATION_COLOURS[i % STATION_COLOURS.length]}
                  strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── 2. Bid stack chart ── */}
      {stackRows.length > 0 && (
        <Card>
          <ChartTitle
            title={`${fuelLabel} Combined Bid Stack · ${RLABEL[region]}`}
            sub="total MW offered by price band · 30-min sample"
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', marginBottom: '0.75rem' }}>
            {presentBuckets.map(b => (
              <span key={b.k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--text)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2,
                  background: b.col, display: 'inline-block', flexShrink: 0 }} />
                {b.k}
              </span>
            ))}
            {hasSpot && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)' }}>
                <span style={{ width: 16, height: 0, borderTop: '2px dashed var(--muted)',
                  display: 'inline-block' }} />
                Spot price
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={stackRows} margin={{ top: 4, right: hasSpot ? 48 : 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time"
                tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
                interval={Math.max(0, Math.floor(stackRows.length / 12) - 1)} />
              <YAxis yAxisId="mw" width={46}
                tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}GW`} />
              {hasSpot && (
                <YAxis yAxisId="price" orientation="right" width={44}
                  tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                  tickFormatter={(v: number) => `$${Math.round(v)}`} />
              )}
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.65rem' }}
                formatter={(v: any, name: string) =>
                  name === 'spot'
                    ? [`$${Number(v).toFixed(2)}/MWh`, 'Spot price']
                    : [`${Number(v).toLocaleString()} MW`, name]}
              />
              {presentBuckets.map((b, i) => (
                <Bar key={b.k} yAxisId="mw" dataKey={b.k} stackId="s" fill={b.col}
                  radius={i === presentBuckets.length - 1 ? [2, 2, 0, 0] : undefined} />
              ))}
              {hasSpot && (
                <Line yAxisId="price" type="monotone" dataKey="spot" name="spot"
                  stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeDasharray="4 3"
                  dot={false} connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── 3. Station average MW ── */}
      {stationAvgs.length > 0 && (
        <Card>
          <ChartTitle
            title={`Average MW Offered by Station · ${RLABEL[region]}`}
            sub="top 20 · derived from region bids data"
          />
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
            {(['gas', 'coal'] as const).map(f => (
              <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2,
                  background: f === 'gas' ? '#FF9F0A' : '#636366', display: 'inline-block' }} />
                {f}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(200, stationAvgs.length * 22)}>
            <BarChart data={stationAvgs} layout="vertical"
              margin={{ top: 4, right: 56, bottom: 0, left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number"
                tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                tickFormatter={(v: number) => `${v} MW`} />
              <YAxis type="category" dataKey="name" width={115}
                tick={{ fill: 'var(--text)', fontSize: 9, fontFamily: 'var(--font-data)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
                formatter={(v: any, _: any, p: any) =>
                  [`${v} MW avg`, `${p?.payload?.name || ''} · ${p?.payload?.fuel || ''}`]}
              />
              <Bar dataKey="avgMw" radius={[0, 3, 3, 0]}>
                {stationAvgs.map(s => (
                  <Cell key={s.name} fill={s.fuel === 'gas' ? '#FF9F0A' : '#636366'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {!loading && !error && stackRows.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem',
            color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            No gas or coal bid data found for {RLABEL[region]} in this period.
          </div>
        </Card>
      )}

      {/* ── 4. Price setter by station ── */}
      {psStations.length > 0 && (
        <Card>
          <ChartTitle
            title={`Price Setting by Station · ${RLABEL[region]}`}
            sub="% of dispatch intervals as price setter · Weekly"
          />
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
            {(['gas','coal','other'] as const).filter(f =>
              psStations.some(s => s.fuel === f)
            ).map(f => (
              <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--text)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, display: 'inline-block',
                  background: f === 'gas' ? '#FF9F0A' : f === 'coal' ? '#636366' : '#64D2FF' }} />
                {f}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(200, psStations.length * 24)}>
            <BarChart data={psStations} layout="vertical"
              margin={{ top: 4, right: 64, bottom: 0, left: 140 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number"
                tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
                tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={135}
                tick={{ fill: 'var(--text)', fontSize: 9, fontFamily: 'var(--font-data)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
                formatter={(v: any) => [`${v}%`, '% of intervals as price setter']}
              />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                {psStations.map(s => (
                  <Cell key={s.name}
                    fill={s.fuel === 'gas' ? '#FF9F0A' : s.fuel === 'coal' ? '#636366' : '#64D2FF'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {!loading && psRows.length === 0 && (
        <Card style={{ padding: '1rem' }}>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}>
            <strong style={{ color: 'var(--text)' }}>Price Setter by Station</strong>
            {' '}— no data returned for {RLABEL[region]} with {activePeriod.label} period.
            This report requires a completed period window. Try a different period or region.
          </div>
        </Card>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '1rem',
        fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>Source: NEOpoint · 104 Bids - Region Bids at Actual Prices 5min</span>
        <span>Price setter not available in current subscription · DUID classification from AEMO</span>
      </div>
    </div>
  )
}
