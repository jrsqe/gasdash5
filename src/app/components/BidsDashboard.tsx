'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line, Cell,
} from 'recharts'

// ── DUID classifications (from AEMO registration list) ────────────────────────
// Gas DUIDs still operating
const GAS_DUIDS = new Set([
  // NSW
  'CG1','CG2','CG3','CG4',                         // Colongra (Snowy Hydro)
  'TALWA1','TALWB1',                                 // Tallawarra (Energy Australia)
  'URANQ11','URANQ12','URANQ13','URANQ14',           // Uranquinty (Origin)
  'HUNTER1','HUNTER2',                               // Hunter Power Station (Snowy Hydro)
  'SITHE01',                                         // Smithfield Energy Facility (Iberdrola)
  // VIC
  'MORTLK11','MORTLK12',                             // Mortlake (Origin)
  'JLA01','JLA02','JLA03','JLA04',                   // Jeeralang A (Energy Australia)
  'JLB01','JLB02','JLB03',                           // Jeeralang B (Energy Australia)
  'LNGS1','LNGS2',                                   // Laverton North (Snowy Hydro)
  'AGLSOM',                                          // Somerton (AGL)
  'NPS',                                             // Newport (Energy Australia)
  'BDL01','BDL02',                                   // Bairnsdale (Alinta)
  'VPGS1','VPGS2','VPGS3','VPGS4','VPGS5','VPGS6',  // Valley Power Peaking (Snowy Hydro)
  // QLD
  'DDPS1',                                           // Darling Downs (Origin)
  'CPSA',                                            // Condamine A (QGC)
  'BRAEMAR1','BRAEMAR2','BRAEMAR3',                  // Braemar Power (Alinta)
  'BRAEMAR5','BRAEMAR6','BRAEMAR7',                  // Braemar 2 Power (Arrow Energy)
  'OAKEY1','OAKEY2',                                 // Oakey (ERM Power)
  'SWAN_E',                                          // Swanbank E (CleanCo)
  'YABULU','YABULU2',                                // Townsville Gas Turbine (Ratch)
  'YARWUN_1',                                        // Yarwun (RTA)
  'ROMA_7','ROMA_8',                                 // Roma (Origin)
  // SA
  'TORRB1','TORRB2','TORRB3','TORRB4',              // Torrens Island B (AGL)
  'OSB-AG',                                          // Osborne (Origin)
  'PPCCGT',                                          // Pelican Point (ENGIE)
  'QPS1','QPS2','QPS3','QPS4','QPS5',               // Quarantine (Origin)
  'LADBROK1','LADBROK2',                             // Ladbroke Grove (Origin)
  'DRYCGT1','DRYCGT2','DRYCGT3',                     // Dry Creek GT (ENGIE)
  'MINTARO',                                         // Mintaro GT (ENGIE)
  'AGLHAL',                                          // Hallett (Energy Australia)
  'BARKIPS1',                                        // Barker Inlet (AGL)
])

// Coal DUIDs still operating
const COAL_DUIDS = new Set([
  // NSW black coal
  'BW01','BW02','BW03','BW04',                       // Bayswater (AGL)
  'ER01','ER02','ER03','ER04',                        // Eraring (Origin)
  'MP1','MP2',                                        // Mt Piper (Energy Australia)
  'VP5','VP6',                                        // Vales Pt (Delta Electricity)
  // VIC brown coal
  'LYA1','LYA2','LYA3','LYA4',                       // Loy Yang A (AGL)
  'LOYYB1','LOYYB2',                                  // Loy Yang B (Alinta)
  'YWPS1','YWPS2','YWPS3','YWPS4',                    // Yallourn (Energy Australia)
  // QLD black coal
  'CALL_B_1','CALL_B_2',                             // Callide B (CS Energy)
  'CPP_3','CPP_4',                                    // Callide C (Callide Power Trading)
  'MPP_1','MPP_2',                                    // Millmerran (InterGen)
  'KPP_1',                                            // Kogan Creek (CS Energy)
  'STAN-1','STAN-2','STAN-3','STAN-4',               // Stanwell (Stanwell Corp)
  'TARONG#1','TARONG#2','TARONG#3','TARONG#4',       // Tarong (Stanwell Corp)
  'TNPS1',                                            // Tarong North (Stanwell Corp)
  'GSTONE1','GSTONE2','GSTONE3','GSTONE4','GSTONE5','GSTONE6', // Gladstone (CS Energy)
])

// Human-readable station names for DUIDs
const DUID_STATION: Record<string, string> = {
  // NSW gas
  CG1:'Colongra', CG2:'Colongra', CG3:'Colongra', CG4:'Colongra',
  TALWA1:'Tallawarra', TALWB1:'Tallawarra',
  URANQ11:'Uranquinty', URANQ12:'Uranquinty', URANQ13:'Uranquinty', URANQ14:'Uranquinty',
  HUNTER1:'Hunter PS', HUNTER2:'Hunter PS',
  SITHE01:'Smithfield',
  // VIC gas
  MORTLK11:'Mortlake', MORTLK12:'Mortlake',
  JLA01:'Jeeralang A', JLA02:'Jeeralang A', JLA03:'Jeeralang A', JLA04:'Jeeralang A',
  JLB01:'Jeeralang B', JLB02:'Jeeralang B', JLB03:'Jeeralang B',
  LNGS1:'Laverton North', LNGS2:'Laverton North',
  AGLSOM:'Somerton', NPS:'Newport',
  BDL01:'Bairnsdale', BDL02:'Bairnsdale',
  VPGS1:'Valley Power', VPGS2:'Valley Power', VPGS3:'Valley Power',
  VPGS4:'Valley Power', VPGS5:'Valley Power', VPGS6:'Valley Power',
  // QLD gas
  DDPS1:'Darling Downs', CPSA:'Condamine',
  BRAEMAR1:'Braemar', BRAEMAR2:'Braemar', BRAEMAR3:'Braemar',
  BRAEMAR5:'Braemar 2', BRAEMAR6:'Braemar 2', BRAEMAR7:'Braemar 2',
  OAKEY1:'Oakey', OAKEY2:'Oakey',
  SWAN_E:'Swanbank E', YABULU:'Townsville GT', YABULU2:'Townsville GT',
  YARWUN_1:'Yarwun', ROMA_7:'Roma', ROMA_8:'Roma',
  // SA gas
  TORRB1:'Torrens Island B', TORRB2:'Torrens Island B',
  TORRB3:'Torrens Island B', TORRB4:'Torrens Island B',
  'OSB-AG':'Osborne', PPCCGT:'Pelican Point',
  QPS1:'Quarantine', QPS2:'Quarantine', QPS3:'Quarantine', QPS4:'Quarantine', QPS5:'Quarantine',
  LADBROK1:'Ladbroke Grove', LADBROK2:'Ladbroke Grove',
  DRYCGT1:'Dry Creek GT', DRYCGT2:'Dry Creek GT', DRYCGT3:'Dry Creek GT',
  MINTARO:'Mintaro GT', AGLHAL:'Hallett', BARKIPS1:'Barker Inlet',
  // NSW coal
  BW01:'Bayswater', BW02:'Bayswater', BW03:'Bayswater', BW04:'Bayswater',
  ER01:'Eraring', ER02:'Eraring', ER03:'Eraring', ER04:'Eraring',
  MP1:'Mt Piper', MP2:'Mt Piper', VP5:'Vales Pt', VP6:'Vales Pt',
  // VIC coal
  LYA1:'Loy Yang A', LYA2:'Loy Yang A', LYA3:'Loy Yang A', LYA4:'Loy Yang A',
  LOYYB1:'Loy Yang B', LOYYB2:'Loy Yang B',
  YWPS1:'Yallourn', YWPS2:'Yallourn', YWPS3:'Yallourn', YWPS4:'Yallourn',
  // QLD coal
  CALL_B_1:'Callide B', CALL_B_2:'Callide B',
  CPP_3:'Callide C', CPP_4:'Callide C',
  MPP_1:'Millmerran', MPP_2:'Millmerran', KPP_1:'Kogan Creek',
  'STAN-1':'Stanwell', 'STAN-2':'Stanwell', 'STAN-3':'Stanwell', 'STAN-4':'Stanwell',
  'TARONG#1':'Tarong', 'TARONG#2':'Tarong', 'TARONG#3':'Tarong', 'TARONG#4':'Tarong',
  TNPS1:'Tarong North',
  GSTONE1:'Gladstone', GSTONE2:'Gladstone', GSTONE3:'Gladstone',
  GSTONE4:'Gladstone', GSTONE5:'Gladstone', GSTONE6:'Gladstone',
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Region     = 'NSW1'|'VIC1'|'QLD1'|'SA1'
type TimeWindow = '1d'|'3d'|'7d'
type FuelFilter = 'gas'|'coal'|'both'

const REGIONS: Region[] = ['NSW1','VIC1','QLD1','SA1']
const RLABEL: Record<Region,string> = { NSW1:'NSW', VIC1:'VIC', QLD1:'QLD', SA1:'SA' }
const RCOL:   Record<Region,string> = {
  NSW1:'#0071E3', VIC1:'#30C254', QLD1:'#FF9F0A', SA1:'#AF52DE'
}

// ── Price buckets ─────────────────────────────────────────────────────────────
const BUCKETS = [
  { key:'< $0',     lo:-Infinity, hi:0,       col:'#636366' },
  { key:'$0–50',    lo:0,         hi:50,      col:'#30C254' },
  { key:'$50–100',  lo:50,        hi:100,     col:'#64D2FF' },
  { key:'$100–200', lo:100,       hi:200,     col:'#0071E3' },
  { key:'$200–300', lo:200,       hi:300,     col:'#FF9F0A' },
  { key:'$300–500', lo:300,       hi:500,     col:'#FF6B35' },
  { key:'$500–1k',  lo:500,       hi:1000,    col:'#FF453A' },
  { key:'$1k+',     lo:1000,      hi:Infinity,col:'#BF5AF2' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
async function neoJson(f: string, from: string, instances: string): Promise<any[]> {
  const p = new URLSearchParams({ report:f, from:`${from} 00:00`, period:'Daily', instances, section:'-1' })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.error ?? 'NEOpoint error')
  if (Array.isArray(j.data)) return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

function daysAgo(n: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
function fmtDT(s: string) {
  const [date, time] = (s ?? '').replace('T',' ').split(' ')
  const [,mm,dd] = (date ?? '').split('-')
  return `${dd}/${mm} ${(time ?? '').slice(0,5)}`
}

// Parse ".$84.79, BW01, BW02, ..." → { price, mw, duids[] }
interface RawBand { price:number; mw:number; duids:string[] }
function parseRawBands(row: any): RawBand[] {
  const out: RawBand[] = []
  for (const [key, val] of Object.entries(row)) {
    if (!key.startsWith('.$')) continue
    const mw = Number(val)
    if (!isFinite(mw) || mw <= 0) continue
    const parts = key.slice(2).split(',').map((s:string) => s.trim())
    const price = parseFloat(parts[0])
    const duids = parts.slice(1).filter(Boolean)
    if (isNaN(price) || !duids.length) continue
    out.push({ price, mw, duids })
  }
  return out
}

// Filter bands to only gas or coal DUIDs, splitting MW proportionally
function filterBands(raw: RawBand[], filter: FuelFilter): RawBand[] {
  return raw.flatMap(band => {
    const gasDuids  = band.duids.filter(d => GAS_DUIDS.has(d))
    const coalDuids = band.duids.filter(d => COAL_DUIDS.has(d))
    const total     = band.duids.length

    const results: RawBand[] = []
    if ((filter === 'gas' || filter === 'both') && gasDuids.length > 0) {
      results.push({ price: band.price, mw: band.mw * gasDuids.length / total, duids: gasDuids })
    }
    if ((filter === 'coal' || filter === 'both') && coalDuids.length > 0) {
      results.push({ price: band.price, mw: band.mw * coalDuids.length / total, duids: coalDuids })
    }
    return results
  })
}

// ── Build time-series bid stack ───────────────────────────────────────────────
function buildStack(rows: any[], filter: FuelFilter): Record<string,any>[] {
  if (!rows?.length) return []
  return rows.filter((_,i) => i % 6 === 0).map(row => {
    const bands = filterBands(parseRawBands(row), filter)
    const out: Record<string,any> = { time: fmtDT(String(row.DateTime ?? '')) }
    const priceKey = Object.keys(row).find(k => /Price 5min/.test(k))
    out.spot = priceKey ? Number(row[priceKey]) : null
    BUCKETS.forEach(({ key, lo, hi }) => {
      out[key] = Math.round(
        bands.filter(b => b.price >= lo && b.price < hi).reduce((s,b) => s + b.mw, 0)
      )
    })
    return out
  })
}

// ── Build per-station summary ─────────────────────────────────────────────────
interface StationSummary {
  station: string
  fuel: 'gas'|'coal'
  avgMwTotal: number
  // price bucket breakdown (avg MW in each bucket)
  buckets: Record<string, number>
}

function buildStationSummary(rows: any[], filter: FuelFilter): StationSummary[] {
  if (!rows?.length) return []
  // Accumulate MW per station per bucket across all rows
  const acc: Record<string, { fuel:'gas'|'coal'; bucketSums: Record<string,number>; count:number }> = {}

  for (const row of rows) {
    const raw = parseRawBands(row)
    for (const band of raw) {
      const gasDuids  = band.duids.filter(d => GAS_DUIDS.has(d))
      const coalDuids = band.duids.filter(d => COAL_DUIDS.has(d))
      const total     = band.duids.length

      const process = (duids: string[], fuel: 'gas'|'coal') => {
        if (!duids.length) return
        if (filter === 'gas'  && fuel !== 'gas')  return
        if (filter === 'coal' && fuel !== 'coal') return

        const mwEach = (band.mw * duids.length / total) / duids.length
        // Group by station name
        const stationGroups: Record<string, string[]> = {}
        for (const d of duids) {
          const stn = DUID_STATION[d] ?? d
          if (!stationGroups[stn]) stationGroups[stn] = []
          stationGroups[stn].push(d)
        }

        for (const [stn, stnDuids] of Object.entries(stationGroups)) {
          if (!acc[stn]) acc[stn] = { fuel, bucketSums: {}, count: 0 }
          acc[stn].count++
          const bucketKey = BUCKETS.find(b => band.price >= b.lo && band.price < b.hi)?.key ?? '$1k+'
          acc[stn].bucketSums[bucketKey] = (acc[stn].bucketSums[bucketKey] ?? 0) + mwEach * stnDuids.length
        }
      }
      process(gasDuids, 'gas')
      process(coalDuids, 'coal')
    }
  }

  return Object.entries(acc)
    .map(([station, { fuel, bucketSums, count }]) => {
      const buckets: Record<string,number> = {}
      let total = 0
      BUCKETS.forEach(({ key }) => {
        const v = Math.round((bucketSums[key] ?? 0) / rows.length)
        buckets[key] = v
        total += v
      })
      return { station, fuel, avgMwTotal: total, buckets }
    })
    .filter(s => s.avgMwTotal > 1)
    .sort((a,b) => b.avgMwTotal - a.avgMwTotal)
}

// ── Charts ────────────────────────────────────────────────────────────────────
const FUEL_COL = { gas: '#FF9F0A', coal: '#636366' }

function BidStackChart({ chartRows, region, filter, win }: {
  chartRows: Record<string,any>[]; region: Region; filter: FuelFilter; win: TimeWindow
}) {
  const present = BUCKETS.filter(b => chartRows.some(r => (r[b.key] ?? 0) > 0))
  const hasSpot = chartRows.some(r => r.spot != null && !isNaN(r.spot))
  const fuelLabel = filter === 'both' ? 'Gas & Coal' : filter === 'gas' ? 'Gas' : 'Coal'
  if (!present.length) return null

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
          {fuelLabel} Bid Stack · {RLABEL[region]}
        </h3>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>
          MW offered by price band · 30-min sample · {win}
        </span>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem 0.8rem', marginBottom:'0.75rem' }}>
        {present.map(b => (
          <span key={b.key} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
            fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--text)' }}>
            <span style={{ width:9, height:9, borderRadius:2, background:b.col, display:'inline-block', flexShrink:0 }} />
            {b.key}
          </span>
        ))}
        {hasSpot && (
          <span style={{ display:'flex', alignItems:'center', gap:'0.3rem',
            fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)' }}>
            <span style={{ width:16, height:0, borderTop:'2px dashed var(--muted)', display:'inline-block' }} />
            Spot price
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartRows} margin={{ top:4, right: hasSpot ? 48 : 16, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
            interval={Math.max(0, Math.floor(chartRows.length / 12) - 1)} />
          <YAxis yAxisId="mw" width={46}
            tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => `${(v/1000).toFixed(1)}GW`} />
          {hasSpot && (
            <YAxis yAxisId="price" orientation="right" width={44}
              tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
              tickFormatter={(v:number) => `$${Math.round(v)}`} />
          )}
          <Tooltip
            contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
            formatter={(v:any, name:string) =>
              name === 'spot' ? [`$${Number(v).toFixed(2)}/MWh`, 'Spot price']
                              : [`${Number(v).toLocaleString()} MW`, name]}
          />
          {present.map((b,i) => (
            <Bar key={b.key} yAxisId="mw" dataKey={b.key} stackId="s" fill={b.col}
              radius={i === present.length-1 ? [2,2,0,0] : undefined} />
          ))}
          {hasSpot && (
            <Line yAxisId="price" type="monotone" dataKey="spot"
              stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} connectNulls name="spot" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function StationSummaryChart({ summaries, filter }: {
  summaries: StationSummary[]; filter: FuelFilter
}) {
  if (!summaries.length) return null
  const top = summaries.slice(0, 20)

  return (
    <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
          Average MW Offered by Station
        </h3>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>
          derived from region bids · top 20 gas &amp; coal stations
        </span>
      </div>
      <div style={{ display:'flex', gap:'1rem', marginBottom:'0.5rem' }}>
        {(['gas','coal'] as const).map(f => (
          <span key={f} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
            fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--text)' }}>
            <span style={{ width:9, height:9, borderRadius:2, background:FUEL_COL[f], display:'inline-block' }} />
            {f}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, top.length * 22)}>
        <BarChart data={top} layout="vertical"
          margin={{ top:4, right:56, bottom:0, left:120 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => `${v} MW`} />
          <YAxis type="category" dataKey="station" width={115}
            tick={{ fill:'var(--text)', fontSize:9, fontFamily:'var(--font-data)' }} />
          <Tooltip
            contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
            formatter={(v:any, _:string, p:any) =>
              [`${v} MW avg`, `${p?.payload?.station} · ${p?.payload?.fuel}`]}
          />
          <Bar dataKey="avgMwTotal" radius={[0,3,3,0]}>
            {top.map(s => <Cell key={s.station} fill={FUEL_COL[s.fuel]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Individual station mini chart
function StationDetailChart({ summary }: { summary: StationSummary }) {
  const data = BUCKETS
    .map(b => ({ name: b.key, mw: summary.buckets[b.key] ?? 0, col: b.col }))
    .filter(d => d.mw > 0)
  if (!data.length) return null

  return (
    <div className="sq-card" style={{ padding:'1rem' }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'0.5rem' }}>
        <span style={{ fontWeight:700, fontSize:'0.78rem', color:FUEL_COL[summary.fuel],
          fontFamily:'var(--font-ui)' }}>{summary.station}</span>
        <span style={{ fontSize:'0.62rem', color:'var(--muted)', fontFamily:'var(--font-data)' }}>
          avg {summary.avgMwTotal.toLocaleString()} MW · {summary.fuel}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={data} layout="vertical" margin={{ top:0, right:32, bottom:0, left:52 }}>
          <XAxis type="number" tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => `${v}`} />
          <YAxis type="category" dataKey="name" width={48}
            tick={{ fill:'var(--muted)', fontSize:8, fontFamily:'var(--font-data)' }} />
          <Tooltip
            contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:6, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
            formatter={(v:any) => [`${v} MW avg`, 'offered']}
          />
          <Bar dataKey="mw" radius={[0,3,3,0]}>
            {data.map(d => <Cell key={d.name} fill={d.col} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Controls ──────────────────────────────────────────────────────────────────
function Pills<T extends string>({ value, onChange, opts }: {
  value: T; onChange: (v: T) => void; opts: { v: T; label: string }[]
}) {
  return (
    <div style={{ display:'flex', background:'var(--surface-2)', border:'1px solid var(--border)',
      borderRadius:8, padding:2, gap:2 }}>
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
  const [region,  setRegion]  = useState<Region>('NSW1')
  const [win,     setWin]     = useState<TimeWindow>('7d')
  const [filter,  setFilter]  = useState<FuelFilter>('both')
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)

  const days     = win === '1d' ? 1 : win === '3d' ? 3 : 7
  const fromDate = daysAgo(days)

  useEffect(() => {
    setLoading(true); setError(null)
    neoJson('104 Bids - Energy\\Region Bids at Actual Prices 5min', fromDate, `GEN;${region}`)
      .then(r => { setRows(r); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [region, fromDate])

  const stackRows  = useMemo((): Record<string,any>[] => buildStack(rows, filter), [rows, filter])
  const summaries  = useMemo(() => buildStationSummary(rows, filter), [rows, filter])

  return (
    <div style={{ maxWidth:1400, margin:'0 auto', padding:'1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom:'1.25rem' }}>
        <h2 style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--text)',
          letterSpacing:'-0.02em', margin:0 }}>Generator Bids</h2>
        <div style={{ color:'var(--muted)', fontFamily:'var(--font-data)',
          fontSize:'0.65rem', marginTop:'0.25rem' }}>
          NEOpoint · region bids filtered to gas &amp; coal DUIDs · {fromDate} → today
        </div>
      </div>

      {/* Controls */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.75rem',
        alignItems:'center', marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
          {REGIONS.map(r => {
            const active = r === region
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                padding:'0.4rem 0.9rem', border:'none', background:'transparent',
                cursor:'pointer', fontFamily:'var(--font-ui)', fontSize:'0.78rem',
                fontWeight: active ? 600 : 400,
                color:       active ? RCOL[r] : 'var(--muted)',
                borderBottom: active ? `2px solid ${RCOL[r]}` : '2px solid transparent',
                marginBottom:-1, transition:'all 0.15s',
              }}>{RLABEL[r]}</button>
            )
          })}
        </div>
        <Pills value={win} onChange={setWin}
          opts={[{v:'1d',label:'1 day'},{v:'3d',label:'3 days'},{v:'7d',label:'7 days'}]} />
        <Pills value={filter} onChange={setFilter}
          opts={[{v:'both',label:'Gas & Coal'},{v:'gas',label:'Gas only'},{v:'coal',label:'Coal only'}]} />
        {loading && (
          <span style={{ fontFamily:'var(--font-data)', fontSize:'0.65rem', color:'var(--muted)' }}>
            Loading…
          </span>
        )}
      </div>

      {error && (
        <div className="sq-card" style={{ padding:'1.25rem', marginBottom:'0.75rem',
          color:'var(--negative)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="sq-card" style={{ padding:'3rem', textAlign:'center',
          color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
          Loading bid data from NEOpoint…
        </div>
      ) : (
        <>
          {/* Combined bid stack */}
          <BidStackChart chartRows={stackRows} region={region} filter={filter} win={win} />

          {/* Station summary bar chart */}
          <StationSummaryChart summaries={summaries} filter={filter} />

          {/* Per-station mini charts */}
          {summaries.length > 0 && (
            <>
              <div style={{ fontFamily:'var(--font-data)', fontSize:'0.6rem', color:'var(--muted)',
                textTransform:'uppercase', letterSpacing:'0.07em', margin:'1.25rem 0 0.75rem',
                paddingBottom:'0.35rem', borderBottom:'1px solid var(--border)' }}>
                Bid profile by station — avg MW per price band
              </div>
              <div style={{ display:'grid',
                gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:'0.6rem' }}>
                {summaries.slice(0, 24).map(s => (
                  <StationDetailChart key={s.station} summary={s} />
                ))}
              </div>
            </>
          )}

          {!stackRows.length && !summaries.length && (
            <div className="sq-card" style={{ padding:'1.5rem', color:'var(--muted)',
              fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
              No gas or coal bids found in {RLABEL[region]} data for this period.
              This region may have no active thermal generators matching the DUID list.
            </div>
          )}
        </>
      )}

      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', marginTop:'1.25rem',
        fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)',
        display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.25rem' }}>
        <span>Source: NEOpoint 104 Bids - Region Bids at Actual Prices 5min · DUID classification from AEMO registration list</span>
        <span>MW split proportionally where multiple fuels share a price band</span>
      </div>
    </div>
  )
}
