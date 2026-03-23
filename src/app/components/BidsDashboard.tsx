'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type NemRegion = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'
type FuelMode  = 'both' | 'gas' | 'coal'

const REGIONS: NemRegion[] = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const RLABEL: Record<NemRegion, string> = { NSW1: 'NSW', VIC1: 'VIC', QLD1: 'QLD', SA1: 'SA' }
const RCOL:   Record<NemRegion, string> = {
  NSW1: '#0071E3', VIC1: '#30C254', QLD1: '#FF9F0A', SA1: '#AF52DE',
}

// Quick-select presets (all fetch multiple Daily calls)
const PRESETS = [
  { label: 'Today',   days: 1  },
  { label: '3 Days',  days: 3  },
  { label: '1 Week',  days: 7  },
  { label: '2 Weeks', days: 14 },
  { label: '1 Month', days: 30 },
]

// ── DUID fuel classification ───────────────────────────────────────────────────
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
  'TARONG#1','TARONG#2','TARONG#3','TARONG#4','TNPS1',
  'GSTONE1','GSTONE2','GSTONE3','GSTONE4','GSTONE5','GSTONE6',
])
const DUID_STATION: Record<string, string> = {
  CG1:'Colongra',CG2:'Colongra',CG3:'Colongra',CG4:'Colongra',
  TALWA1:'Tallawarra',TALWB1:'Tallawarra',
  URANQ11:'Uranquinty',URANQ12:'Uranquinty',URANQ13:'Uranquinty',URANQ14:'Uranquinty',
  HUNTER1:'Hunter PS',HUNTER2:'Hunter PS',SITHE01:'Smithfield',
  MORTLK11:'Mortlake',MORTLK12:'Mortlake',
  JLA01:'Jeeralang A',JLA02:'Jeeralang A',JLA03:'Jeeralang A',JLA04:'Jeeralang A',
  JLB01:'Jeeralang B',JLB02:'Jeeralang B',JLB03:'Jeeralang B',
  LNGS1:'Laverton North',LNGS2:'Laverton North',
  AGLSOM:'Somerton',NPS:'Newport',BDL01:'Bairnsdale',BDL02:'Bairnsdale',
  VPGS1:'Valley Power',VPGS2:'Valley Power',VPGS3:'Valley Power',
  VPGS4:'Valley Power',VPGS5:'Valley Power',VPGS6:'Valley Power',
  DDPS1:'Darling Downs',CPSA:'Condamine',
  BRAEMAR1:'Braemar',BRAEMAR2:'Braemar',BRAEMAR3:'Braemar',
  BRAEMAR5:'Braemar 2',BRAEMAR6:'Braemar 2',BRAEMAR7:'Braemar 2',
  OAKEY1:'Oakey',OAKEY2:'Oakey',SWAN_E:'Swanbank E',
  YABULU:'Townsville GT',YABULU2:'Townsville GT',
  YARWUN_1:'Yarwun',ROMA_7:'Roma',ROMA_8:'Roma',
  TORRB1:'Torrens Isl B',TORRB2:'Torrens Isl B',
  TORRB3:'Torrens Isl B',TORRB4:'Torrens Isl B',
  'OSB-AG':'Osborne',PPCCGT:'Pelican Point',
  QPS1:'Quarantine',QPS2:'Quarantine',QPS3:'Quarantine',QPS4:'Quarantine',QPS5:'Quarantine',
  LADBROK1:'Ladbroke Grove',LADBROK2:'Ladbroke Grove',
  DRYCGT1:'Dry Creek GT',DRYCGT2:'Dry Creek GT',DRYCGT3:'Dry Creek GT',
  MINTARO:'Mintaro GT',AGLHAL:'Hallett',BARKIPS1:'Barker Inlet',
  BW01:'Bayswater',BW02:'Bayswater',BW03:'Bayswater',BW04:'Bayswater',
  ER01:'Eraring',ER02:'Eraring',ER03:'Eraring',ER04:'Eraring',
  MP1:'Mt Piper',MP2:'Mt Piper',VP5:'Vales Pt',VP6:'Vales Pt',
  LYA1:'Loy Yang A',LYA2:'Loy Yang A',LYA3:'Loy Yang A',LYA4:'Loy Yang A',
  LOYYB1:'Loy Yang B',LOYYB2:'Loy Yang B',
  YWPS1:'Yallourn',YWPS2:'Yallourn',YWPS3:'Yallourn',YWPS4:'Yallourn',
  CALL_B_1:'Callide B',CALL_B_2:'Callide B',CPP_3:'Callide C',CPP_4:'Callide C',
  MPP_1:'Millmerran',MPP_2:'Millmerran',KPP_1:'Kogan Creek',
  'STAN-1':'Stanwell','STAN-2':'Stanwell','STAN-3':'Stanwell','STAN-4':'Stanwell',
  'TARONG#1':'Tarong','TARONG#2':'Tarong','TARONG#3':'Tarong','TARONG#4':'Tarong',
  TNPS1:'Tarong North',
  GSTONE1:'Gladstone',GSTONE2:'Gladstone',GSTONE3:'Gladstone',
  GSTONE4:'Gladstone',GSTONE5:'Gladstone',GSTONE6:'Gladstone',
}

// ── Price buckets ─────────────────────────────────────────────────────────────
const BUCKETS = [
  { k:'< $0',     lo:-1e9, hi:0,    col:'#636366' },
  { k:'$0–50',    lo:0,    hi:50,   col:'#30C254' },
  { k:'$50–100',  lo:50,   hi:100,  col:'#64D2FF' },
  { k:'$100–200', lo:100,  hi:200,  col:'#0071E3' },
  { k:'$200–300', lo:200,  hi:300,  col:'#FF9F0A' },
  { k:'$300–500', lo:300,  hi:500,  col:'#FF6B35' },
  { k:'$500–1k',  lo:500,  hi:1000, col:'#FF453A' },
  { k:'$1k+',     lo:1000, hi:1e9,  col:'#BF5AF2' },
]

const STATION_COLOURS = [
  '#0071E3','#FF9F0A','#30C254','#FF453A','#BF5AF2',
  '#64D2FF','#FF6B35','#FFD60A','#98989D','#FF2D55',
  '#5E5CE6','#34C759','#FF9500','#00C7BE','#AF52DE',
]

// ── Date helpers ──────────────────────────────────────────────────────────────
function toIso(d: Date) { return d.toISOString().slice(0, 10) }

function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    dates.push(toIso(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

function fmtDT(s: string) {
  const [date = '', time = ''] = (s || '').replace('T', ' ').split(' ')
  const p = date.split('-')
  return `${p[2] || ''}/${p[1] || ''} ${time.slice(0, 5)}`
}

function offsetDate(days: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return toIso(d)
}

// ── API ───────────────────────────────────────────────────────────────────────
const BID_REPORT = '104 Bids - Energy\\Region Bids at Actual Prices 5min'

async function fetchOneDay(date: string, instances: string): Promise<any[]> {
  const p = new URLSearchParams({
    report: BID_REPORT, from: `${date} 00:00`,
    period: 'Daily', instances, section: '-1',
  })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) return []
  if (Array.isArray(j.data)) return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

// ── Price setter fetch ───────────────────────────────────────────────────────
const PS_REPORT = '108 Price Setter\\Energy Pricesetting by Station'

// Price setter uses a fixed historical from date and Three Days period
// The "DateTime" column actually contains station names in summary format
async function fetchPriceSetter(region: NemRegion, fromDate: string): Promise<any[]> {
  const p = new URLSearchParams({
    report: PS_REPORT,
    from:   `${fromDate} 00:00`,
    period: 'Three Days',
    instances: region,
    section: '-1',
  })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) return []
  if (Array.isArray(j.data)) return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

// Parse PS response: { DateTime: "Station Name", "VIC1.PercentSetting": 0.49 }
interface PsRow { station: string; pct: number; fuel: 'gas'|'coal'|'other' }

function stationFuel(name: string): 'gas'|'coal'|'other' {
  const n = name.toLowerCase()
  const gasNames = ['colongra','tallawarra','uranquinty','hunter','smithfield',
    'mortlake','jeeralang','laverton','somerton','newport','bairnsdale','valley power',
    'darling downs','condamine','braemar','oakey','swanbank','townsville',
    'yarwun','roma','torrens','osborne','pelican','quarantine','ladbroke',
    'dry creek','mintaro','hallett','barker inlet']
  const coalNames = ['bayswater','eraring','mt piper','vales','loy yang','yallourn',
    'callide','millmerran','kogan','stanwell','tarong','gladstone']
  if (gasNames.some(g => n.includes(g))) return 'gas'
  if (coalNames.some(c => n.includes(c))) return 'coal'
  return 'other'
}

function parsePsRows(rows: any[], region: NemRegion): PsRow[] {
  const pctKey = `${region}.PercentSetting`
  return rows
    .map(r => ({
      station: String(r.DateTime ?? ''),
      pct: Math.round(Number(r[pctKey] ?? 0) * 1000) / 10,
      fuel: stationFuel(String(r.DateTime ?? '')),
    }))
    .filter(r => r.station && r.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 25)
}

// ── Data processing ───────────────────────────────────────────────────────────
function parseBands(row: any) {
  const out: { price: number; mw: number; duids: string[] }[] = []
  for (const [key, val] of Object.entries(row) as [string, any][]) {
    if (!key.startsWith('.$')) continue
    const mw = Number(val)
    if (!mw || mw <= 0 || !isFinite(mw)) continue
    const parts = key.slice(2).split(',').map((s: string) => s.trim())
    const price = parseFloat(parts[0])
    const duids = parts.slice(1).filter(Boolean)
    if (isNaN(price) || !duids.length) continue
    out.push({ price, mw, duids })
  }
  return out
}

function bucketOf(p: number) {
  for (const b of BUCKETS) if (p >= b.lo && p < b.hi) return b.k
  return '$1k+'
}

// ── Merit order bid stack ─────────────────────────────────────────────────────
// For a given interval, extract each gas DUID's bid: price → MW
// Returns segments sorted by price (merit order), each segment = one station bid
interface MeritSegment {
  station:   string   // display name
  duid:      string
  price:     number   // $/MWh
  mw:        number   // MW offered at this price
  cumMwFrom: number   // x-axis start
  cumMwTo:   number   // x-axis end
}

function buildMeritOrder(row: any): MeritSegment[] {
  // Collect all gas DUID bids from the row bands
  const bids: { duid: string; station: string; price: number; mw: number }[] = []

  for (const [key, val] of Object.entries(row) as [string, any][]) {
    if (!key.startsWith('.$')) continue
    const mw = Number(val)
    if (!mw || mw <= 0 || !isFinite(mw)) continue
    const parts = key.slice(2).split(',').map((s: string) => s.trim())
    const price = parseFloat(parts[0])
    if (isNaN(price)) continue
    const duids = parts.slice(1).filter(Boolean)
    const gasDuids = duids.filter(d => GAS_DUIDS.has(d))
    if (!gasDuids.length) continue
    // Split MW proportionally among gas DUIDs only
    const mwPerDuid = mw * gasDuids.length / (duids.length || 1) / (gasDuids.length || 1)
    for (const duid of gasDuids) {
      bids.push({
        duid,
        station: DUID_STATION[duid] || duid,
        price,
        mw: Math.round(mwPerDuid),
      })
    }
  }

  // Sort by price ascending (merit order)
  bids.sort((a, b) => a.price - b.price || a.station.localeCompare(b.station))

  // Build cumulative MW (x-axis positions)
  let cumMw = 0
  return bids.map(b => {
    const seg: MeritSegment = {
      ...b,
      cumMwFrom: cumMw,
      cumMwTo:   cumMw + b.mw,
    }
    cumMw += b.mw
    return seg
  })
}

// Build merit order chart data — pick one interval per hour (or specific time)
// Returns: array of { time, segments } for a time selector
function buildMeritSnapshots(rows: any[]): Array<{ time: string; dateTime: string; segments: MeritSegment[] }> {
  if (!rows.length) return []
  // Sample every 12 rows = 1 hour
  return rows
    .filter((_, i) => i % 12 === 0)
    .map(row => {
      const dt = String(row.DateTime || '')
      return {
        time:     fmtDT(dt),
        dateTime: dt,
        segments: buildMeritOrder(row),
      }
    })
    .filter(s => s.segments.length > 0)
}

// For the recharts bar chart: convert segments to a single row with station keys
// Each station gets a key like "Colongra|0" (station|segmentIndex to handle multiple bids)
interface MeritChartRow { [key: string]: any }

function segmentsToChartRow(segments: MeritSegment[]): {
  row: MeritChartRow
  keys: string[]
  stationKeys: Record<string, string>  // key → station name
} {
  const row: MeritChartRow = {}
  const keys: string[]     = []
  const stationKeys: Record<string, string> = {}
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const k   = `s${i}`
    row[k]    = seg.mw
    keys.push(k)
    stationKeys[k] = seg.station
    // Store price metadata for tooltip
    row[`${k}_price`] = seg.price
  }
  return { row, keys, stationKeys }
}

// Chart 1: station bid prices over time (volume-weighted avg per station)
function buildPriceRows(rows: any[], mode: FuelMode) {
  const stationSet = new Set<string>()
  const chartRows = rows.filter((_, i) => i % 6 === 0).map(row => {
    const rec: Record<string, any> = { time: fmtDT(String(row.DateTime || '')) }
    const wsum: Record<string, number> = {}
    const wmw:  Record<string, number> = {}
    for (const band of parseBands(row)) {
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
      if (mw > 0) { rec[stn] = Math.round((wsum[stn] / mw) * 10) / 10; stationSet.add(stn) }
    }
    return rec
  })
  return { chartRows, stations: Array.from(stationSet).sort() }
}

// Chart 2: bid stack (MW by price band)
function buildStackRows(rows: any[], mode: FuelMode) {
  return rows.filter((_, i) => i % 6 === 0).map(row => {
    const rec: Record<string, any> = { time: fmtDT(String(row.DateTime || '')) }
    const pk = Object.keys(row).find(k => k.includes('Price 5min'))
    rec.spot = pk ? Number(row[pk]) : null
    for (const b of BUCKETS) rec[b.k] = 0
    for (const band of parseBands(row)) {
      const gasDuids  = band.duids.filter(d => GAS_DUIDS.has(d))
      const coalDuids = band.duids.filter(d => COAL_DUIDS.has(d))
      const total = band.duids.length || 1
      if ((mode === 'gas'  || mode === 'both') && gasDuids.length) {
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

// Chart 3: avg MW per station
function buildStationAvgs(rows: any[], mode: FuelMode) {
  if (!rows.length) return []
  const sums: Record<string, { fuel: 'gas'|'coal'; total: number }> = {}
  for (const row of rows) {
    for (const band of parseBands(row)) {
      const process = (duids: string[], fuel: 'gas'|'coal') => {
        if (!duids.length || (mode === 'gas' && fuel !== 'gas') || (mode === 'coal' && fuel !== 'coal')) return
        const share = band.mw / (band.duids.length || 1)
        const grouped: Record<string, number> = {}
        for (const d of duids) { const s = DUID_STATION[d]||d; grouped[s]=(grouped[s]||0)+1 }
        for (const [s, cnt] of Object.entries(grouped)) {
          if (!sums[s]) sums[s] = { fuel, total: 0 }
          sums[s].total += share * cnt
        }
      }
      process(band.duids.filter(d => GAS_DUIDS.has(d)),  'gas')
      process(band.duids.filter(d => COAL_DUIDS.has(d)), 'coal')
    }
  }
  return Object.entries(sums)
    .map(([name, { fuel, total }]) => ({ name, fuel, avgMw: Math.round(total / rows.length) }))
    .filter(s => s.avgMw > 0).sort((a, b) => b.avgMw - a.avgMw).slice(0, 20)
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)',
      borderRadius:12, padding:'1.25rem', marginBottom:'0.75rem', ...style }}>
      {children}
    </div>
  )
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem',
      marginBottom:'0.75rem', flexWrap:'wrap' }}>
      <h3 style={{ margin:0, fontWeight:600, fontSize:'0.85rem', color:'var(--text)' }}>{title}</h3>
      {sub && <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>{sub}</span>}
    </div>
  )
}

function Pills({ value, onChange, opts }: {
  value: string; onChange: (v: string) => void
  opts: { v: string; label: string }[]
}) {
  return (
    <div style={{ display:'flex', background:'var(--surface-2)',
      border:'1px solid var(--border)', borderRadius:8, padding:2, gap:2 }}>
      {opts.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding:'0.25rem 0.65rem', borderRadius:6, border:'none', cursor:'pointer',
          fontFamily:'var(--font-ui)', fontSize:'0.72rem', transition:'all 0.15s',
          fontWeight: value === v ? 600 : 400,
          background: value === v ? 'var(--accent)' : 'transparent',
          color:      value === v ? '#fff' : 'var(--muted)',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BidsDashboard() {
  // Date range state — default last 7 days
  const [fromDate, setFromDate] = useState(() => offsetDate(7))
  const [toDate,   setToDate]   = useState(() => offsetDate(1))
  const [region,   setRegion]   = useState<NemRegion>('NSW1')
  const [mode,     setMode]     = useState<FuelMode>('both')
  const [rows,     setRows]     = useState<any[]>([])
  const [selectedSnap, setSelectedSnap] = useState(0)
  const [psRows,   setPsRows]   = useState<any[]>([])
  const [psFrom,   setPsFrom]   = useState(() => {
    // Default: 3 weeks ago so Three Days period covers completed data
    const d = new Date(); d.setUTCDate(d.getUTCDate() - 21); return toIso(d)
  })
  const [loading,  setLoading]  = useState(false)
  const [psLoading,setPsLoading]= useState(false)
  const [progress, setProgress] = useState('')
  const [error,    setError]    = useState<string | null>(null)

  const maxDate = offsetDate(1)  // yesterday (today has incomplete data)

  // Apply a quick preset
  function applyPreset(days: number) {
    setFromDate(offsetDate(days))
    setToDate(offsetDate(1))
  }

  const dates = useMemo(() => buildDateRange(fromDate, toDate), [fromDate, toDate])
  const activePreset = PRESETS.find(p => {
    const pFrom = offsetDate(p.days)
    const pTo   = offsetDate(1)
    return pFrom === fromDate && pTo === toDate
  })?.label ?? 'Custom'

  useEffect(() => {
    if (!dates.length) return
    let cancelled = false
    setLoading(true); setError(null); setRows([]); setProgress('')

    async function run() {
      const all: any[] = []
      const seen = new Set<string>()
      // Fetch in batches of 3
      for (let i = 0; i < dates.length; i += 3) {
        if (cancelled) return
        const batch = dates.slice(i, i + 3)
        setProgress(`Loading ${Math.min(i + 3, dates.length)}/${dates.length} days…`)
        const results = await Promise.all(
          batch.map(d => fetchOneDay(d, `GEN;${region}`))
        )
        for (const dayRows of results) {
          for (const row of dayRows) {
            const k = String(row.DateTime || '')
            if (!seen.has(k)) { seen.add(k); all.push(row) }
          }
        }
      }
      all.sort((a, b) => String(a.DateTime||'').localeCompare(String(b.DateTime||'')))
      if (!cancelled) { setRows(all); setLoading(false); setProgress(''); setSelectedSnap(0) }
    }

    run().catch(e => { if (!cancelled) { setError(String(e?.message || e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [region, dates.join(',')])

  // Fetch price setter separately (uses its own from date)
  useEffect(() => {
    let cancelled = false
    setPsLoading(true); setPsRows([])
    fetchPriceSetter(region, psFrom)
      .then(data => { if (!cancelled) { setPsRows(data); setPsLoading(false) } })
      .catch(() => { if (!cancelled) setPsLoading(false) })
    return () => { cancelled = true }
  }, [region, psFrom])

  const psData = useMemo(() => parsePsRows(psRows, region), [psRows, region])

  const { chartRows: priceRows, stations } = useMemo(
    () => buildPriceRows(rows, mode), [rows, mode]
  )
  const stackRows      = useMemo(() => buildStackRows(rows, mode),      [rows, mode])
  const stationAvgs    = useMemo(() => buildStationAvgs(rows, mode),    [rows, mode])
  const meritSnapshots = useMemo(() => buildMeritSnapshots(rows),       [rows])

  const hasSpot = stackRows.some(r => r.spot != null && isFinite(r.spot))

  return (
    <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom:'1.25rem' }}>
        <h2 style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--text)',
          letterSpacing:'-0.02em', margin:0 }}>Generator Bids</h2>
        <p style={{ margin:'0.25rem 0 0', color:'var(--muted)',
          fontFamily:'var(--font-data)', fontSize:'0.65rem' }}>
          NEOpoint · Gas generators · {RLABEL[region]} · {fromDate} → {toDate}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.75rem',
        alignItems:'center', marginBottom:'1.25rem' }}>

        {/* Region */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
          {REGIONS.map(r => (
            <button key={r} onClick={() => setRegion(r)} style={{
              padding:'0.4rem 0.9rem', border:'none', background:'transparent',
              cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
              fontWeight: r === region ? 600 : 400,
              color: r === region ? RCOL[r] : 'var(--muted)',
              borderBottom: r === region ? `2px solid ${RCOL[r]}` : '2px solid transparent',
              marginBottom:-1, transition:'all 0.15s',
            }}>{RLABEL[r]}</button>
          ))}
        </div>

        {/* Date range */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem',
          background:'var(--surface-2)', border:'1px solid var(--border)',
          borderRadius:8, padding:'0.25rem 0.6rem' }}>
          <label style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem',
            color:'var(--muted)', whiteSpace:'nowrap' }}>From</label>
          <input type="date" value={fromDate} max={toDate}
            onChange={e => setFromDate(e.target.value)}
            style={{ fontFamily:'var(--font-data)', fontSize:'0.7rem',
              color:'var(--text)', background:'transparent',
              border:'none', outline:'none', cursor:'pointer' }} />
          <span style={{ color:'var(--muted)', fontSize:'0.65rem' }}>→</span>
          <input type="date" value={toDate} min={fromDate} max={maxDate}
            onChange={e => setToDate(e.target.value)}
            style={{ fontFamily:'var(--font-data)', fontSize:'0.7rem',
              color:'var(--text)', background:'transparent',
              border:'none', outline:'none', cursor:'pointer' }} />
        </div>

        {/* Quick presets */}
        <Pills
          value={activePreset}
          onChange={v => { const p = PRESETS.find(x => x.label === v); if (p) applyPreset(p.days) }}
          opts={PRESETS.map(p => ({ v: p.label, label: p.label }))}
        />



        {loading && (
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--muted)' }}>
            {progress || 'Loading…'}
          </span>
        )}
      </div>

      {error && (
        <Card style={{ borderColor:'var(--negative)' }}>
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.75rem',
            color:'var(--negative)' }}>Error: {error}</span>
        </Card>
      )}

      {loading && !rows.length && (
        <Card>
          <div style={{ textAlign:'center', padding:'2rem', color:'var(--muted)',
            fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
            {progress || 'Loading bid data from NEOpoint…'}
          </div>
        </Card>
      )}

      {/* ── Gas merit order bid stack ── */}
      {meritSnapshots.length > 0 && (() => {
        const snap = meritSnapshots[selectedSnap] ?? meritSnapshots[0]
        const { row, keys, stationKeys } = segmentsToChartRow(snap.segments)
        const totalMw = snap.segments.reduce((s, seg) => s + seg.mw, 0)
        const spotRow = stackRows.find(r => r.time === snap.time)
        const spotPrice = spotRow?.spot

        // Unique stations for legend
        const legendStations = Array.from(
          new Set(snap.segments.map(s => s.station))
        )

        return (
          <Card>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
              flexWrap:'wrap', gap:'0.75rem', marginBottom:'0.75rem' }}>
              <SectionHead
                title={`Gas Merit Order Bid Stack · ${RLABEL[region]}`}
                sub={`${snap.time} · ${totalMw.toLocaleString()} MW total gas capacity offered`}
              />
              {/* Time selector */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <button onClick={() => setSelectedSnap(s => Math.max(0, s - 1))}
                  disabled={selectedSnap === 0}
                  style={{ padding:'0.2rem 0.5rem', borderRadius:6, border:'1px solid var(--border)',
                    background:'var(--surface)', color:'var(--text)', cursor:'pointer',
                    fontFamily:'var(--font-ui)', fontSize:'0.72rem',
                    opacity: selectedSnap === 0 ? 0.4 : 1 }}>‹</button>
                <span style={{ fontFamily:'var(--font-data)', fontSize:'0.7rem',
                  color:'var(--text)', minWidth:90, textAlign:'center' }}>
                  {snap.time}
                </span>
                <button onClick={() => setSelectedSnap(s => Math.min(meritSnapshots.length - 1, s + 1))}
                  disabled={selectedSnap === meritSnapshots.length - 1}
                  style={{ padding:'0.2rem 0.5rem', borderRadius:6, border:'1px solid var(--border)',
                    background:'var(--surface)', color:'var(--text)', cursor:'pointer',
                    fontFamily:'var(--font-ui)', fontSize:'0.72rem',
                    opacity: selectedSnap === meritSnapshots.length - 1 ? 0.4 : 1 }}>›</button>
                <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>
                  {selectedSnap + 1}/{meritSnapshots.length}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem 0.8rem', marginBottom:'0.75rem' }}>
              {legendStations.map(s => (
                <span key={s} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                  fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--text)' }}>
                  <span style={{ width:9, height:9, borderRadius:2,
                    background: stationColour(s), display:'inline-block', flexShrink:0 }} />
                  {s}
                </span>
              ))}
              {spotPrice != null && (
                <span style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                  fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)',
                  marginLeft:'auto' }}>
                  Spot: <strong style={{ color:'var(--text)' }}>${spotPrice.toFixed(2)}/MWh</strong>
                </span>
              )}
            </div>

            {/* Merit order chart: X = cumulative MW, Y = price */}
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={[row]}
                layout="horizontal"
                margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
                barCategoryGap={0}
                barGap={0}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  domain={[0, totalMw]}
                  tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                  tickFormatter={(v: number) => `${v} MW`}
                  label={{ value:'Cumulative MW →', position:'insideBottom', offset:-12,
                    style:{ fill:'var(--muted)', fontSize:9, fontFamily:'var(--font-data)' } }}
                />
                <YAxis
                  tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                  tickFormatter={(v: number) => `$${Math.round(v)}`}
                  width={46}
                  label={{ value:'$/MWh', angle:-90, position:'insideLeft',
                    style:{ fill:'var(--muted)', fontSize:9, fontFamily:'var(--font-data)' } }}
                />
                <Tooltip
                  contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
                    borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
                  formatter={(_: any, k: string) => {
                    const seg = snap.segments[parseInt(k.slice(1))]
                    if (!seg) return ['-', k]
                    return [`${seg.mw} MW @ $${seg.price.toFixed(2)}/MWh`, seg.station]
                  }}
                />
                {spotPrice != null && (
                  <ReferenceLine
                    y={spotPrice}
                    stroke="rgba(255,255,255,0.6)"
                    strokeDasharray="4 3"
                    label={{ value:`Spot $${spotPrice.toFixed(0)}`, position:'right',
                      style:{ fill:'var(--muted)', fontSize:8, fontFamily:'var(--font-data)' } }}
                  />
                )}
                {keys.map(k => {
                  const seg = snap.segments[parseInt(k.slice(1))]
                  if (!seg) return null
                  return (
                    <Bar key={k} dataKey={k} stackId="merit"
                      fill={stationColour(seg.station)}
                      maxBarSize={9999}
                    >
                      <Cell fill={stationColour(seg.station)} />
                    </Bar>
                  )
                })}
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)',
              marginTop:'0.5rem' }}>
              Each bar = one DUID bid · width = MW offered · height = bid price · use ‹ › to step through intervals
            </div>
          </Card>
        )
      })()}

      {/* ── Chart 3: Station avg MW ── */}
      {stationAvgs.length > 0 && (
        <Card>
          <SectionHead
            title={`Average MW Offered by Station · ${RLABEL[region]}`}
            sub="top 20 · derived from region bids"
          />
          <div style={{ display:'flex', gap:'1rem', marginBottom:'0.5rem' }}>
            {(['gas','coal'] as const).map(f => (
              <span key={f} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--text)' }}>
                <span style={{ width:9, height:9, borderRadius:2,
                  background: f === 'gas' ? '#FF9F0A' : '#636366',
                  display:'inline-block' }} />
                {f}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(200, stationAvgs.length * 22)}>
            <BarChart data={stationAvgs} layout="vertical"
              margin={{ top:4, right:56, bottom:0, left:120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number"
                tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                tickFormatter={(v: number) => `${v} MW`} />
              <YAxis type="category" dataKey="name" width={115}
                tick={{ fill:'var(--text)', fontSize:9, fontFamily:'var(--font-data)' }} />
              <Tooltip
                contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
                  borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
                formatter={(v: any, _: any, p: any) =>
                  [`${v} MW avg`, `${p?.payload?.name||''} · ${p?.payload?.fuel||''}`]}
              />
              <Bar dataKey="avgMw" radius={[0,3,3,0]}>
                {stationAvgs.map(s => (
                  <Cell key={s.name}
                    fill={s.fuel === 'gas' ? '#FF9F0A' : '#636366'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <Card>
          <div style={{ textAlign:'center', padding:'2rem', color:'var(--muted)',
            fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
            No data returned for {RLABEL[region]} in this date range.
          </div>
        </Card>
      )}

      {/* ── Price Setter section ── */}
      <div style={{ marginTop:'1.5rem' }}>
        {/* Section header with its own date control */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:'0.75rem', marginBottom:'0.75rem',
          paddingBottom:'0.5rem', borderBottom:'1px solid var(--border)' }}>
          <div>
            <span style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem',
              color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
              Price Setter by Station
            </span>
            <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem',
              color:'var(--muted)', marginLeft:'0.5rem' }}>
              % of dispatch intervals as price setter · 3-day window
            </span>
          </div>
          {/* PS date picker */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem',
            background:'var(--surface-2)', border:'1px solid var(--border)',
            borderRadius:8, padding:'0.25rem 0.6rem' }}>
            <label style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem',
              color:'var(--muted)', whiteSpace:'nowrap' }}>Period start</label>
            <input type="date" value={psFrom}
              max={offsetDate(3)}
              onChange={e => setPsFrom(e.target.value)}
              style={{ fontFamily:'var(--font-data)', fontSize:'0.7rem',
                color:'var(--text)', background:'transparent',
                border:'none', outline:'none', cursor:'pointer' }} />
            {psLoading && (
              <span style={{ fontFamily:'var(--font-data)', fontSize:'0.62rem',
                color:'var(--muted)' }}>Loading…</span>
            )}
          </div>
        </div>

        {psData.length > 0 ? (
          <Card>
            <SectionHead
              title={`Price Setting by Station · ${RLABEL[region]}`}
              sub={`3 days from ${psFrom} · % of intervals as price setter`}
            />
            <div style={{ display:'flex', gap:'1rem', marginBottom:'0.5rem' }}>
              {(['gas','coal','other'] as const).filter(f => psData.some(s => s.fuel === f)).map(f => (
                <span key={f} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                  fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--text)' }}>
                  <span style={{ width:9, height:9, borderRadius:2, display:'inline-block',
                    background: f === 'gas' ? '#FF9F0A' : f === 'coal' ? '#636366' : '#64D2FF' }} />
                  {f}
                </span>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(220, psData.length * 22)}>
              <BarChart data={psData} layout="vertical"
                margin={{ top:4, right:64, bottom:0, left:160 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number"
                  tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                  tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="station" width={155}
                  tick={{ fill:'var(--text)', fontSize:9, fontFamily:'var(--font-data)' }} />
                <Tooltip
                  contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
                    borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
                  formatter={(v: any) => [`${v}%`, '% of intervals as price setter']}
                />
                <Bar dataKey="pct" radius={[0,3,3,0]}>
                  {psData.map(s => (
                    <Cell key={s.station}
                      fill={s.fuel === 'gas' ? '#FF9F0A' : s.fuel === 'coal' ? '#636366' : '#64D2FF'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : !psLoading && (
          <Card style={{ padding:'1rem' }}>
            <div style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.72rem' }}>
              No price setter data for {RLABEL[region]} starting {psFrom}.
              Try moving the period start date — data must be from a completed 3-day window.
            </div>
          </Card>
        )}
      </div>

      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', marginTop:'1rem',
        fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)',
        display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.25rem' }}>
        <span>Source: NEOpoint · 104 Bids - Region Bids at Actual Prices 5min · {rows.length} intervals loaded</span>
        <span>Price setter not available in subscription · DUID classification from AEMO registration list</span>
      </div>
    </div>
  )
}
