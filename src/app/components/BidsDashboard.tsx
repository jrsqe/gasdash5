'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Cell, LineChart, ReferenceLine,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type NemRegion = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'
type FuelMode  = 'both' | 'gas' | 'coal'

const REGIONS: NemRegion[] = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const RLABEL: Record<NemRegion, string> = { NSW1:'NSW', VIC1:'VIC', QLD1:'QLD', SA1:'SA' }
const RCOL:   Record<NemRegion, string> = {
  NSW1:'#0071E3', VIC1:'#30C254', QLD1:'#FF9F0A', SA1:'#AF52DE',
}

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
  CG1:'Colongra',CG2:'Colongra',CG3:'Colongra',CG4:'Colongra',
  TALWA1:'Tallawarra',TALWB1:'Tallawarra',
  URANQ11:'Uranquinty',URANQ12:'Uranquinty',URANQ13:'Uranquinty',URANQ14:'Uranquinty',
  HUNTER1:'Hunter PS',HUNTER2:'Hunter PS',SITHE01:'Smithfield',
  MORTLK11:'Mortlake',MORTLK12:'Mortlake',
  JLA01:'Jeeralang A',JLA02:'Jeeralang A',JLA03:'Jeeralang A',JLA04:'Jeeralang A',
  JLB01:'Jeeralang B',JLB02:'Jeeralang B',JLB03:'Jeeralang B',
  LNGS1:'Laverton North',LNGS2:'Laverton North',
  AGLSOM:'Somerton',NPS:'Newport',
  BDL01:'Bairnsdale',BDL02:'Bairnsdale',
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
  CALL_B_1:'Callide B',CALL_B_2:'Callide B',
  CPP_3:'Callide C',CPP_4:'Callide C',
  MPP_1:'Millmerran',MPP_2:'Millmerran',KPP_1:'Kogan Creek',
  'STAN-1':'Stanwell','STAN-2':'Stanwell','STAN-3':'Stanwell','STAN-4':'Stanwell',
  'TARONG#1':'Tarong','TARONG#2':'Tarong','TARONG#3':'Tarong','TARONG#4':'Tarong',
  TNPS1:'Tarong North',
  GSTONE1:'Gladstone',GSTONE2:'Gladstone',GSTONE3:'Gladstone',
  GSTONE4:'Gladstone',GSTONE5:'Gladstone',GSTONE6:'Gladstone',
}

// Stations in each region — for ordering charts
const REGION_STATIONS: Record<NemRegion, Array<{ name: string; fuel: 'gas'|'coal' }>> = {
  NSW1: [
    { name:'Eraring', fuel:'coal' },{ name:'Bayswater', fuel:'coal' },
    { name:'Mt Piper', fuel:'coal' },{ name:'Vales Pt', fuel:'coal' },
    { name:'Tallawarra', fuel:'gas' },{ name:'Colongra', fuel:'gas' },
    { name:'Uranquinty', fuel:'gas' },{ name:'Hunter PS', fuel:'gas' },
    { name:'Smithfield', fuel:'gas' },
  ],
  VIC1: [
    { name:'Loy Yang A', fuel:'coal' },{ name:'Loy Yang B', fuel:'coal' },
    { name:'Yallourn', fuel:'coal' },
    { name:'Mortlake', fuel:'gas' },{ name:'Jeeralang A', fuel:'gas' },
    { name:'Jeeralang B', fuel:'gas' },{ name:'Laverton North', fuel:'gas' },
    { name:'Somerton', fuel:'gas' },{ name:'Newport', fuel:'gas' },
    { name:'Bairnsdale', fuel:'gas' },{ name:'Valley Power', fuel:'gas' },
  ],
  QLD1: [
    { name:'Gladstone', fuel:'coal' },{ name:'Tarong', fuel:'coal' },
    { name:'Tarong North', fuel:'coal' },{ name:'Stanwell', fuel:'coal' },
    { name:'Callide B', fuel:'coal' },{ name:'Callide C', fuel:'coal' },
    { name:'Millmerran', fuel:'coal' },{ name:'Kogan Creek', fuel:'coal' },
    { name:'Darling Downs', fuel:'gas' },{ name:'Braemar', fuel:'gas' },
    { name:'Braemar 2', fuel:'gas' },{ name:'Condamine', fuel:'gas' },
    { name:'Oakey', fuel:'gas' },{ name:'Swanbank E', fuel:'gas' },
    { name:'Townsville GT', fuel:'gas' },{ name:'Yarwun', fuel:'gas' },
  ],
  SA1: [
    { name:'Torrens Isl B', fuel:'gas' },{ name:'Pelican Point', fuel:'gas' },
    { name:'Osborne', fuel:'gas' },{ name:'Quarantine', fuel:'gas' },
    { name:'Ladbroke Grove', fuel:'gas' },{ name:'Dry Creek GT', fuel:'gas' },
    { name:'Hallett', fuel:'gas' },{ name:'Barker Inlet', fuel:'gas' },
    { name:'Mintaro GT', fuel:'gas' },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toIsoDate(d: Date) { return d.toISOString().slice(0, 10) }
function offsetDate(base: string, days: number) {
  const d = new Date(base); d.setUTCDate(d.getUTCDate() + days); return toIsoDate(d)
}
function fmtDT(s: string) {
  const clean = (s || '').replace('T', ' ')
  const [date = '', time = ''] = clean.split(' ')
  const [, mm = '', dd = ''] = date.split('-')
  return `${dd}/${mm} ${time.slice(0, 5)}`
}

async function neoJson(f: string, from: string, instances: string, period = 'Daily'): Promise<any[]> {
  const p = new URLSearchParams({ report: f, from: `${from} 00:00`, period, instances, section: '-1' })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || 'fetch failed')
  if (Array.isArray(j.data)) return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

// ── Parse region bids ─────────────────────────────────────────────────────────
// Each row column ".$84.79, BW01, BW02" = those DUIDs bid that MW volume at $84.79
interface BidEntry { price: number; mw: number; duids: string[] }

function parseRow(row: any): BidEntry[] {
  const out: BidEntry[] = []
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

// ── Build per-station bid price time series ───────────────────────────────────
// For each 30-min sample, for each station: what was their volume-weighted avg bid price?
// We reconstruct this by finding all price-band entries containing that station's DUIDs.
interface StationBidPoint {
  time: string
  vwap: number | null     // volume-weighted avg bid price (excl. -$1000 and MPC)
  mwLow: number           // MW bid below $0
  mwMid: number           // MW bid $0–$300
  mwHigh: number          // MW bid above $300
  totalMw: number
  spot: number | null
}

function buildStationSeries(
  rows: any[],
  stationDuids: string[],
): StationBidPoint[] {
  const duidSet = new Set(stationDuids)
  const out: StationBidPoint[] = []

  for (let i = 0; i < rows.length; i += 6) {
    const row = rows[i]
    const time = fmtDT(String(row.DateTime || ''))
    const entries = parseRow(row).filter(e => e.duids.some(d => duidSet.has(d)))

    // Find spot price
    let spot: number | null = null
    for (const k of Object.keys(row)) {
      if (k.includes('Price 5min')) { spot = Number(row[k]); break }
    }

    if (!entries.length) {
      out.push({ time, vwap: null, mwLow: 0, mwMid: 0, mwHigh: 0, totalMw: 0, spot })
      continue
    }

    // For each entry, count how many of this station's DUIDs are in it
    let sumPriceMw = 0, sumMw = 0
    let mwLow = 0, mwMid = 0, mwHigh = 0

    for (const e of entries) {
      const stationDuidCount = e.duids.filter(d => duidSet.has(d)).length
      const totalCount = e.duids.length || 1
      const allocatedMw = e.mw * stationDuidCount / totalCount

      // Exclude the "free bid" zones from VWAP (-$1000 floor and $20300 MPC cap)
      if (e.price > -999 && e.price < 19000) {
        sumPriceMw += e.price * allocatedMw
        sumMw      += allocatedMw
      }

      if (e.price < 0)   mwLow  += allocatedMw
      else if (e.price <= 300) mwMid  += allocatedMw
      else               mwHigh += allocatedMw
    }

    out.push({
      time,
      vwap:     sumMw > 0 ? Math.round(sumPriceMw / sumMw * 100) / 100 : null,
      mwLow:    Math.round(mwLow),
      mwMid:    Math.round(mwMid),
      mwHigh:   Math.round(mwHigh),
      totalMw:  Math.round(mwLow + mwMid + mwHigh),
      spot,
    })
  }
  return out
}

// Get all DUIDs for a station name
function stationDuids(stationName: string): string[] {
  return Object.entries(DUID_STATION)
    .filter(([, stn]) => stn === stationName)
    .map(([duid]) => duid)
}

// ── Build bid stack (combined) ────────────────────────────────────────────────
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

function bucketOf(p: number) {
  return BUCKETS.find(b => p >= b.lo && p < b.hi)?.k ?? '$1k+'
}

function buildStackRows(rows: any[], mode: FuelMode) {
  if (!rows.length) return []
  return rows.filter((_, i) => i % 6 === 0).map(row => {
    const rec: Record<string, any> = { time: fmtDT(String(row.DateTime || '')) }
    for (const k of Object.keys(row)) {
      if (k.includes('Price 5min')) { rec.spot = Number(row[k]); break }
    }
    for (const b of BUCKETS) rec[b.k] = 0
    for (const e of parseRow(row)) {
      const gas  = e.duids.filter(d => GAS_DUIDS.has(d))
      const coal = e.duids.filter(d => COAL_DUIDS.has(d))
      const tot  = e.duids.length || 1
      const bk   = bucketOf(e.price)
      if ((mode === 'gas'  || mode === 'both') && gas.length)
        rec[bk] = (rec[bk] || 0) + Math.round(e.mw * gas.length / tot)
      if ((mode === 'coal' || mode === 'both') && coal.length)
        rec[bk] = (rec[bk] || 0) + Math.round(e.mw * coal.length / tot)
    }
    return rec
  })
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function PillGroup<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: Array<{ v: T; label: string }> }) {
  return (
    <div style={{ display:'flex', background:'var(--surface-2)',
      border:'1px solid var(--border)', borderRadius:8, padding:2, gap:2 }}>
      {options.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding:'0.25rem 0.65rem', borderRadius:6, border:'none',
          cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.72rem',
          transition:'all 0.15s', fontWeight: value === v ? 600 : 400,
          background: value === v ? 'var(--accent)' : 'transparent',
          color:      value === v ? '#fff' : 'var(--muted)',
        }}>{label}</button>
      ))}
    </div>
  )
}

function CardWrap({ children, title, sub }: {
  children: React.ReactNode; title: string; sub?: string
}) {
  return (
    <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)',
      borderRadius:12, padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem',
        marginBottom:'0.75rem', flexWrap:'wrap' }}>
        <h3 style={{ margin:0, fontWeight:600, fontSize:'0.85rem', color:'var(--text)' }}>{title}</h3>
        {sub && <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)',
          fontSize:'0.62rem' }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Station bid price chart ───────────────────────────────────────────────────
function StationPriceChart({ name, fuel, series, spotVisible }: {
  name: string; fuel: 'gas'|'coal'; series: StationBidPoint[]; spotVisible: boolean
}) {
  if (!series.length || series.every(p => p.totalMw === 0)) return null

  const fuelCol = fuel === 'gas' ? '#FF9F0A' : '#636366'
  const maxMw   = Math.max(...series.map(p => p.totalMw))
  const hasSpot = spotVisible && series.some(p => p.spot != null)

  return (
    <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)',
      borderRadius:10, padding:'0.9rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between',
        marginBottom:'0.5rem', flexWrap:'wrap', gap:'0.25rem' }}>
        <span style={{ fontWeight:700, fontSize:'0.78rem',
          color:fuelCol, fontFamily:'var(--font-ui)' }}>{name}</span>
        <span style={{ fontSize:'0.6rem', color:'var(--muted)',
          fontFamily:'var(--font-data)', textTransform:'uppercase',
          letterSpacing:'0.05em' }}>{fuel}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={series}
          margin={{ top:4, right: hasSpot ? 36 : 8, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="time"
            tick={{ fill:'#555', fontSize:7, fontFamily:'var(--font-data)' }}
            interval={Math.max(0, Math.floor(series.length / 6) - 1)} />
          {/* MW axis */}
          <YAxis yAxisId="mw" width={36}
            tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
          {/* Price axis */}
          <YAxis yAxisId="price" orientation="right" width={32}
            tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => `$${Math.round(v)}`} />
          <Tooltip
            contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
            formatter={(v:any, n:string) => {
              if (n === 'vwap') return [`$${Number(v).toFixed(2)}/MWh`, 'Avg bid price']
              if (n === 'spot') return [`$${Number(v).toFixed(2)}/MWh`, 'Spot price']
              if (n === 'mwLow')  return [`${v} MW`, 'Bid below $0']
              if (n === 'mwMid')  return [`${v} MW`, 'Bid $0–$300']
              if (n === 'mwHigh') return [`${v} MW`, 'Bid >$300']
              return [v, n]
            }}
          />
          {/* MW stacked bars */}
          <Bar yAxisId="mw" dataKey="mwLow"  stackId="mw" fill="#636366" name="mwLow" />
          <Bar yAxisId="mw" dataKey="mwMid"  stackId="mw" fill={fuelCol} name="mwMid" />
          <Bar yAxisId="mw" dataKey="mwHigh" stackId="mw" fill="#FF453A" name="mwHigh"
            radius={[2, 2, 0, 0]} />
          {/* VWAP line */}
          <Line yAxisId="price" type="monotone" dataKey="vwap" name="vwap"
            stroke="#fff" strokeWidth={2} dot={false} connectNulls />
          {/* Spot price */}
          {hasSpot && (
            <Line yAxisId="price" type="monotone" dataKey="spot" name="spot"
              stroke="rgba(255,255,255,0.35)" strokeWidth={1}
              strokeDasharray="3 2" dot={false} connectNulls />
          )}
          <ReferenceLine yAxisId="price" y={0} stroke="var(--border)" strokeDasharray="2 2" />
        </ComposedChart>
      </ResponsiveContainer>
      {/* Mini legend */}
      <div style={{ display:'flex', gap:'0.7rem', marginTop:'0.35rem' }}>
        {[
          { col:'#636366', label:'Bid <$0' },
          { col:fuelCol,   label:'Bid $0–300' },
          { col:'#FF453A', label:'Bid >$300' },
          { col:'#fff',    label:'Avg bid price (right axis)' },
        ].map(({ col, label }) => (
          <span key={label} style={{ display:'flex', alignItems:'center', gap:'0.25rem',
            fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)' }}>
            <span style={{ width:8, height:8, borderRadius:2,
              background:col, display:'inline-block', flexShrink:0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Price setter section ──────────────────────────────────────────────────────
function PriceSetterSection({ rows1, rows2, region, name1, name2 }: {
  rows1: any[]; rows2: any[]; region: NemRegion; name1: string; name2: string
}) {
  if (!rows1.length && !rows2.length) return (
    <div style={{ padding:'1.25rem', background:'var(--surface-2)', border:'1px solid var(--border)',
      borderRadius:12, color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
      Price setter data not available — this report requires period="Three Days" in NEOpoint.
      The correct URLs were provided but your subscription may restrict access.
      The /api/neodebug endpoint is testing multiple parameter combinations.
    </div>
  )

  const colOf = (k: string) => {
    const l = k.toLowerCase()
    if (l.includes('gas'))   return '#FF9F0A'
    if (l.includes('coal') || l.includes('thermal')) return '#636366'
    if (l.includes('wind'))  return '#30C254'
    if (l.includes('solar')) return '#FFD60A'
    if (l.includes('hydro') || l.includes('water')) return '#0071E3'
    if (l.includes('batt'))  return '#AF52DE'
    if (GAS_DUIDS.has(k))    return '#FF9F0A'
    if (COAL_DUIDS.has(k))   return '#636366'
    return '#64D2FF'
  }

  const renderChart = (rows: any[], title: string) => {
    if (!rows.length) return null
    const isTime = rows.length > 1 && 'DateTime' in rows[0]
    const dataKeys = Object.keys(rows[0]).filter(k => k !== 'DateTime')

    if (isTime) {
      const chartData = rows.filter((_, i) => i % 6 === 0).map(r => {
        const rec: Record<string, any> = { time: fmtDT(String(r.DateTime || '')) }
        dataKeys.forEach(k => { rec[k] = r[k] != null ? Number(r[k]) : null })
        return rec
      })
      const maxVal = Math.max(...chartData.flatMap(r => dataKeys.map(k => Number(r[k] ?? 0))))
      const isPercent = maxVal > 1
      const fmt = (v: number) => isPercent ? `${v.toFixed(1)}%` : `${(v * 100).toFixed(1)}%`
      return (
        <CardWrap title={title} sub={`${RLABEL[region]} · % of intervals`}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem 0.8rem', marginBottom:'0.5rem' }}>
            {dataKeys.map(k => (
              <span key={k} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--text)' }}>
                <span style={{ width:9, height:9, borderRadius:2,
                  background:colOf(k), display:'inline-block', flexShrink:0 }} />
                {k.replace(/\.PERCENTSETTING|_PERCENTSETTING/g, '')}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top:4, right:16, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
                interval={Math.max(0, Math.floor(chartData.length / 10) - 1)} />
              <YAxis tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                tickFormatter={fmt} width={40} />
              <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
                borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
                formatter={(v: any, k: string) => [fmt(Number(v)),
                  k.replace(/\.PERCENTSETTING|_PERCENTSETTING/g, '')]} />
              {dataKeys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={colOf(k)}
                  radius={i === dataKeys.length - 1 ? [2,2,0,0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardWrap>
      )
    }

    // Summary: station → pct
    const summaryRows = rows
      .map(r => ({ name: String(r.Station ?? r.Name ?? r.DUID ?? dataKeys[0] ?? '?'),
        pct: Math.round(Number(r.PERCENTSETTING ?? r[dataKeys[0]] ?? 0) * 1000) / 10 }))
      .filter(r => r.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 20)
    return (
      <CardWrap title={title} sub={`${RLABEL[region]} · % of intervals as price setter`}>
        <ResponsiveContainer width="100%" height={Math.max(180, summaryRows.length * 24)}>
          <BarChart data={summaryRows} layout="vertical"
            margin={{ top:4, right:48, bottom:0, left:130 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
              tickFormatter={(v:number) => `${v}%`} />
            <YAxis type="category" dataKey="name" width={125}
              tick={{ fill:'var(--text)', fontSize:9, fontFamily:'var(--font-data)' }} />
            <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
              formatter={(v:any) => [`${v}%`, '% of intervals']} />
            <Bar dataKey="pct" radius={[0,3,3,0]}>
              {summaryRows.map(r => <Cell key={r.name} fill={colOf(r.name)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardWrap>
    )
  }

  return (
    <>
      {renderChart(rows1, name1)}
      {renderChart(rows2, name2)}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BidsDashboard() {
  const [region,     setRegion]     = useState<NemRegion>('NSW1')
  const [mode,       setMode]       = useState<FuelMode>('both')
  const [showSpot,   setShowSpot]   = useState(true)
  const [activeTab,  setActiveTab]  = useState<'bids'|'prices'|'pricesetter'>('prices')

  // Date range state — default last 7 days
  const defaultEnd   = toIsoDate(new Date())
  const defaultStart = offsetDate(defaultEnd, -7)
  const [startDate,  setStartDate]  = useState(defaultStart)
  const [endDate,    setEndDate]    = useState(defaultEnd)

  // Data state
  const [bidRows,  setBidRows]  = useState<any[]>([])
  const [psRows1,  setPsRows1]  = useState<any[]>([])
  const [psRows2,  setPsRows2]  = useState<any[]>([])
  const [bidLoad,  setBidLoad]  = useState(false)
  const [psLoad,   setPsLoad]   = useState(false)
  const [bidErr,   setBidErr]   = useState<string|null>(null)
  const [psErr,    setPsErr]    = useState<string|null>(null)
  const [psName1,  setPsName1]  = useState('Energy Pricesetter Plant Bandcost')
  const [psName2,  setPsName2]  = useState('Energy Pricesetting by Station')

  // Fetch bids when region or dates change
  useEffect(() => {
    let cancelled = false
    setBidLoad(true); setBidErr(null)
    neoJson('104 Bids - Energy\\Region Bids at Actual Prices 5min', startDate, `GEN;${region}`)
      .then(d => { if (!cancelled) { setBidRows(d); setBidLoad(false) } })
      .catch(e => { if (!cancelled) { setBidErr(String(e.message||e)); setBidLoad(false) } })
    return () => { cancelled = true }
  }, [region, startDate])

  // Fetch price setter when region or dates change
  useEffect(() => {
    let cancelled = false
    setPsLoad(true); setPsErr(null)

    async function tryFetch(names: string[]): Promise<{ rows: any[]; name: string }> {
      for (const name of names) {
        try {
          const rows = await neoJson(name, startDate, region, 'Three Days')
          if (rows.length > 0) return { rows, name: name.split('\\').pop()! }
        } catch { /* try next */ }
      }
      return { rows: [], name: names[0].split('\\').pop()! }
    }

    Promise.all([
      tryFetch(['108 Price Setter\\Energy Pricesetter Plant Bandcost',
                '108 Price Setter\\Pricesetter fueltype 30min']),
      tryFetch(['108 Price Setter\\Energy Pricesetting by Station',
                '108 Price Setter\\Pricesetter station 30min']),
    ]).then(([r1, r2]) => {
      if (!cancelled) {
        setPsRows1(r1.rows); setPsName1(r1.name)
        setPsRows2(r2.rows); setPsName2(r2.name)
        setPsLoad(false)
      }
    }).catch(e => { if (!cancelled) { setPsErr(String(e.message||e)); setPsLoad(false) } })
    return () => { cancelled = true }
  }, [region, startDate])

  const stackRows = useMemo(() => buildStackRows(bidRows, mode), [bidRows, mode])
  const presentBuckets = BUCKETS.filter(b => stackRows.some(r => (r[b.k] || 0) > 0))
  const hasSpot = stackRows.some(r => r.spot != null && isFinite(r.spot))

  const visibleStations = (REGION_STATIONS[region] || []).filter(
    s => mode === 'both' || s.fuel === mode
  )

  // Build per-station series (memoised)
  const stationSeriesMap = useMemo(() => {
    const map: Record<string, StationBidPoint[]> = {}
    for (const { name } of visibleStations) {
      const duids = stationDuids(name)
      if (duids.length) map[name] = buildStationSeries(bidRows, duids)
    }
    return map
  }, [bidRows, region, mode])

  return (
    <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:'1.25rem' }}>
        <h2 style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--text)',
          letterSpacing:'-0.02em', margin:0 }}>Generator Bids</h2>
        <p style={{ margin:'0.25rem 0 0', color:'var(--muted)',
          fontFamily:'var(--font-data)', fontSize:'0.65rem' }}>
          NEOpoint · gas &amp; coal generators · region bids data
        </p>
      </div>

      {/* ── Controls row ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.75rem',
        alignItems:'center', marginBottom:'1.25rem' }}>

        {/* Region tabs */}
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

        <PillGroup value={mode} onChange={setMode} options={[
          { v:'both', label:'Gas & Coal' },
          { v:'gas',  label:'Gas only' },
          { v:'coal', label:'Coal only' },
        ]} />

        {/* Date range pickers */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem',
          fontFamily:'var(--font-data)', fontSize:'0.7rem', color:'var(--muted)' }}>
          <label>From</label>
          <input type="date" value={startDate}
            max={endDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ fontFamily:'var(--font-data)', fontSize:'0.7rem', color:'var(--text)',
              background:'var(--surface-2)', border:'1px solid var(--border)',
              borderRadius:6, padding:'0.2rem 0.45rem', outline:'none' }} />
          <label>To</label>
          <input type="date" value={endDate}
            min={startDate}
            max={toIsoDate(new Date())}
            onChange={e => setEndDate(e.target.value)}
            style={{ fontFamily:'var(--font-data)', fontSize:'0.7rem', color:'var(--text)',
              background:'var(--surface-2)', border:'1px solid var(--border)',
              borderRadius:6, padding:'0.2rem 0.45rem', outline:'none' }} />
          {/* Quick presets */}
          {([['1d',1],['3d',3],['7d',7],['14d',14]] as [string,number][]).map(([label, days]) => (
            <button key={label} onClick={() => {
              const end = toIsoDate(new Date())
              setStartDate(offsetDate(end, -days))
              setEndDate(end)
            }} style={{ padding:'0.2rem 0.5rem', borderRadius:6, border:'1px solid var(--border)',
              background:'var(--surface-2)', cursor:'pointer', fontSize:'0.65rem',
              color:'var(--muted)', fontFamily:'var(--font-data)' }}>
              {label}
            </button>
          ))}
        </div>

        {bidLoad && <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem',
          color:'var(--muted)' }}>Loading…</span>}
      </div>

      {/* ── Sub-tab nav ── */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:'1rem' }}>
        {([
          ['prices',      'Station Bid Prices'],
          ['bids',        'Combined Bid Stack'],
          ['pricesetter', 'Price Setter'],
        ] as [typeof activeTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding:'0.5rem 1rem', border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
            fontWeight: activeTab === key ? 600 : 400,
            color: activeTab === key ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom:-1, transition:'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Error */}
      {bidErr && (
        <div style={{ padding:'1rem', marginBottom:'1rem', borderRadius:10,
          background:'var(--surface-2)', border:'1px solid var(--border)',
          color:'var(--negative)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
          Error: {bidErr}
        </div>
      )}

      {bidLoad && (
        <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)',
          fontFamily:'var(--font-data)', fontSize:'0.75rem',
          background:'var(--surface-2)', borderRadius:12, border:'1px solid var(--border)' }}>
          Loading bid data…
        </div>
      )}

      {/* ── Station Bid Prices tab ── */}
      {!bidLoad && activeTab === 'prices' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            marginBottom:'0.75rem' }}>
            <p style={{ margin:0, color:'var(--muted)', fontFamily:'var(--font-data)',
              fontSize:'0.65rem' }}>
              MW offered (bars) and volume-weighted avg bid price (white line) per station · 30-min sample
            </p>
            <label style={{ display:'flex', alignItems:'center', gap:'0.4rem',
              fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--muted)',
              cursor:'pointer' }}>
              <input type="checkbox" checked={showSpot}
                onChange={e => setShowSpot(e.target.checked)} />
              Show spot price overlay
            </label>
          </div>
          <div style={{ display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))', gap:'0.6rem' }}>
            {visibleStations.map(({ name, fuel }) => {
              const series = stationSeriesMap[name]
              if (!series?.length) return null
              return (
                <StationPriceChart key={name} name={name} fuel={fuel}
                  series={series} spotVisible={showSpot} />
              )
            })}
          </div>
          {visibleStations.length === 0 && (
            <div style={{ padding:'2rem', textAlign:'center', color:'var(--muted)',
              fontFamily:'var(--font-data)', fontSize:'0.75rem',
              background:'var(--surface-2)', borderRadius:12, border:'1px solid var(--border)' }}>
              No {mode === 'both' ? 'gas or coal' : mode} generators in {RLABEL[region]}.
            </div>
          )}
        </>
      )}

      {/* ── Combined Bid Stack tab ── */}
      {!bidLoad && activeTab === 'bids' && stackRows.length > 0 && (
        <CardWrap
          title={`${mode === 'both' ? 'Gas & Coal' : mode === 'gas' ? 'Gas' : 'Coal'} Bid Stack · ${RLABEL[region]}`}
          sub="MW offered by price band · 30-min sample">
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem 0.8rem', marginBottom:'0.75rem' }}>
            {presentBuckets.map(b => (
              <span key={b.k} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--text)' }}>
                <span style={{ width:9, height:9, borderRadius:2,
                  background:b.col, display:'inline-block', flexShrink:0 }} />
                {b.k}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={stackRows}
              margin={{ top:4, right: hasSpot ? 48 : 16, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time"
                tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
                interval={Math.max(0, Math.floor(stackRows.length / 12) - 1)} />
              <YAxis yAxisId="mw" width={46}
                tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                tickFormatter={(v:number) => `${(v/1000).toFixed(1)}GW`} />
              {hasSpot && (
                <YAxis yAxisId="price" orientation="right" width={44}
                  tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
                  tickFormatter={(v:number) => `$${Math.round(v)}`} />
              )}
              <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
                borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
                formatter={(v:any, name:string) =>
                  name === 'spot' ? [`$${Number(v).toFixed(2)}/MWh`, 'Spot price']
                                  : [`${Number(v).toLocaleString()} MW`, name]} />
              {presentBuckets.map((b, i) => (
                <Bar key={b.k} yAxisId="mw" dataKey={b.k} stackId="s" fill={b.col}
                  radius={i === presentBuckets.length - 1 ? [2,2,0,0] : undefined} />
              ))}
              {hasSpot && (
                <Line yAxisId="price" type="monotone" dataKey="spot" name="spot"
                  stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeDasharray="4 3"
                  dot={false} connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardWrap>
      )}

      {/* ── Price Setter tab ── */}
      {activeTab === 'pricesetter' && (
        <>
          {psLoad ? (
            <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)',
              fontFamily:'var(--font-data)', fontSize:'0.75rem',
              background:'var(--surface-2)', borderRadius:12, border:'1px solid var(--border)' }}>
              Loading price setter data…
            </div>
          ) : (
            <PriceSetterSection
              rows1={psRows1} rows2={psRows2}
              region={region} name1={psName1} name2={psName2}
            />
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', marginTop:'1rem',
        fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)',
        display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.25rem' }}>
        <span>Source: NEOpoint · 104 Bids - Energy · 108 Price Setter</span>
        <span>DUID classification from AEMO registration list</span>
      </div>
    </div>
  )
}
