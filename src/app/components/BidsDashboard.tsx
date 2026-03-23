'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ComposedChart, Line,
} from 'recharts'

// ── DUID fuel classification ──────────────────────────────────────────────────
// Built from actual DUIDs seen in NEOpoint region bids data
const GAS_DUIDS = new Set([
  // NSW gas
  'CG1','CG2','CG3','CG4',           // Colongra
  'TALWA1','TALWB1',                  // Tallawarra A/B
  'URANQ11','URANQ12','URANQ13','URANQ14', // Uranquinty
  'HEZ1',                             // Hunter Energy (Marulan)
  'HUNTER1','HUNTER2',               // Hunter Valley Energy Centre
  'SITHE01',                          // Smithfield
  // VIC gas
  'MORTLK1','MORTLK2',               // Mortlake
  'JEERALANG1','JEERALANG2','JEERALANG3',
  'LAVERTON1','LAVERTON2',
  'SOMETONS1',                        // Somerton
  'NEWPTB1',                          // Newport
  'BAIRNS1',                          // Bairnsdale
  'VP5','VP6',                        // Valley Power (Jeeralang) peakers
  // QLD gas
  'DALBYR1','DALBYR2',
  'CONDM1',
  'BRAEMAR1','BRAEMAR2','BRAEMAR3',
  'OAKEY1','OAKEY2',
  'SWANBANK4',
  'ROMA_7','MCKAY1',
  // SA gas
  'TORRB1','TORRB2','TORRB3','TORRB4',
  'TORRA1','TORRA2','TORRA3','TORRA4',
  'OSBORNE1',
  'PELICAN1',
  'HALLWF1','HALLNTH1',
  'LADBROKE1',
  'QPS1','QPS2','QPS3','QPS4','QPS5',
  'SNUGGERY1',
])

const COAL_DUIDS = new Set([
  // NSW coal
  'ER01','ER02','ER03','ER04','ERB01', // Eraring
  'BW01','BW02','BW03','BW04',         // Bayswater
  'MP1','MP2',                          // Mt Piper
  'WTAHB1',                             // Wallerawang (transitional)
  // VIC coal
  'LYAB1','LYAB2','LYAB3','LYAB4',     // Loy Yang A
  'LOYYB1','LOYYB2','LOYYB3','LOYYB4', // Loy Yang B
  'YPS_1','YPS_2','YPS_3','YPS_4',     // Yallourn
  // QLD coal
  'TARONG1','TARONG2','TARONG3','TARONG4',
  'TNPS1',                              // Tarong North
  'CALL_B_1','CALL_B_2',
  'CALL_C_1','CALL_C_2',
  'STAN_1','STAN_2','STAN_3','STAN_4', // Stanwell
  'MILM1',
  'GSTONE1','GSTONE2','GSTONE3','GSTONE4','GSTONE5','GSTONE6',
  'KOGAN1',
])

function duidFuel(duid: string): 'gas'|'coal'|'other' {
  if (GAS_DUIDS.has(duid))  return 'gas'
  if (COAL_DUIDS.has(duid)) return 'coal'
  return 'other'
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Region     = 'NSW1'|'VIC1'|'QLD1'|'SA1'
type Window     = '1d'|'3d'|'7d'
type FuelFilter = 'gas'|'coal'|'both'

const REGIONS: Region[] = ['NSW1','VIC1','QLD1','SA1']
const RLABEL: Record<Region,string> = { NSW1:'NSW', VIC1:'VIC', QLD1:'QLD', SA1:'SA' }
const RCOL:   Record<Region,string> = {
  NSW1:'#0071E3', VIC1:'#30C254', QLD1:'#FF9F0A', SA1:'#AF52DE'
}

// ── Price buckets ─────────────────────────────────────────────────────────────
const BUCKETS: { key: string; lo: number; hi: number; col: string }[] = [
  { key:'< $0',     lo:-Infinity, hi:0,    col:'#636366' },
  { key:'$0–50',    lo:0,         hi:50,   col:'#30C254' },
  { key:'$50–100',  lo:50,        hi:100,  col:'#64D2FF' },
  { key:'$100–200', lo:100,       hi:200,  col:'#0071E3' },
  { key:'$200–300', lo:200,       hi:300,  col:'#FF9F0A' },
  { key:'$300–500', lo:300,       hi:500,  col:'#FF6B35' },
  { key:'$500–1k',  lo:500,       hi:1000, col:'#FF453A' },
  { key:'$1k–MPC',  lo:1000,      hi:Infinity, col:'#BF5AF2' },
]

// ── NEO fetch ─────────────────────────────────────────────────────────────────
async function neoJson(f: string, from: string, instances: string): Promise<any[]> {
  const p = new URLSearchParams({
    report: f, from: `${from} 00:00`, period: 'Daily', instances, section: '-1'
  })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.error ?? 'NEOpoint error')
  if (Array.isArray(j.data))       return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

function daysAgo(n: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function fmtDT(s: string) {
  if (!s) return ''
  const [date, time] = s.replace('T',' ').split(' ')
  const [,mm,dd] = (date??'').split('-')
  return `${dd}/${mm} ${(time??'').slice(0,5)}`
}

// ── Core data parser ──────────────────────────────────────────────────────────
// Each column key: ".$84.79, MP1, MP2"  →  price=84.79, duids=[MP1, MP2], value=MW
// Returns per-row arrays of { price, mw, duids, fuel }
interface Band { price: number; mw: number; duids: string[]; fuel: 'gas'|'coal'|'other' }

function parseBands(row: any, filter: FuelFilter): Band[] {
  const out: Band[] = []
  for (const [key, mwRaw] of Object.entries(row)) {
    if (!key.startsWith('.$')) continue
    const mw = Number(mwRaw)
    if (!isFinite(mw) || mw <= 0) continue

    const parts  = key.slice(2).split(',').map((s: string) => s.trim())
    const price  = parseFloat(parts[0])
    const duids  = parts.slice(1)
    if (isNaN(price) || !duids.length) continue

    // Dominant fuel of DUIDs in this band
    let gasN = 0, coalN = 0
    for (const d of duids) {
      if (duidFuel(d) === 'gas')  gasN++
      if (duidFuel(d) === 'coal') coalN++
    }
    const fuel: 'gas'|'coal'|'other' =
      gasN > 0 && gasN >= coalN ? 'gas' :
      coalN > 0                 ? 'coal' : 'other'

    if (filter === 'gas'  && fuel !== 'gas')  continue
    if (filter === 'coal' && fuel !== 'coal') continue
    if (filter === 'both' && fuel === 'other') continue

    out.push({ price, mw, duids, fuel })
  }
  return out
}

// Build time-series bid stack rows (sampled every 6 × 5min = 30 min)
function buildStack(rows: any[], filter: FuelFilter) {
  const PRICE_COL = 'NSW1.Price 5min'  // present in row[1] onwards; detect dynamically
  return rows
    .filter((_,i) => i % 6 === 0)
    .map(row => {
      const bands  = parseBands(row, filter)
      const out: Record<string,any> = { time: fmtDT(String(row.DateTime ?? '')) }
      // Spot price — find first key ending in "Price 5min"
      const priceKey = Object.keys(row).find(k => k.endsWith('Price 5min'))
      out.spotPrice = priceKey ? Number(row[priceKey]) : null
      BUCKETS.forEach(({ key, lo, hi }) => {
        out[key] = Math.round(
          bands.filter(b => b.price >= lo && b.price < hi)
               .reduce((s, b) => s + b.mw, 0)
        )
      })
      return out
    })
}

// Build DUID summary: avg MW per DUID across all rows
function buildDuidSummary(rows: any[], filter: FuelFilter) {
  const totals: Record<string, { fuel: 'gas'|'coal'|'other'; mwSum: number; n: number }> = {}
  for (const row of rows) {
    const bands = parseBands(row, filter)
    for (const { mw, duids, fuel } of bands) {
      const share = mw / duids.length
      for (const d of duids) {
        const f = duidFuel(d) === 'other' ? fuel : duidFuel(d)
        if (!totals[d]) totals[d] = { fuel: f, mwSum: 0, n: 0 }
        totals[d].mwSum += share
        totals[d].n     += 1
      }
    }
  }
  return Object.entries(totals)
    .map(([duid, { fuel, mwSum, n }]) => ({ duid, fuel, avgMw: Math.round(mwSum / n) }))
    .filter(x => x.avgMw > 1)
    .sort((a, b) => b.avgMw - a.avgMw)
    .slice(0, 25)
}

// ── Small components ──────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem', ...style }}>{children}</div>
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem',
      paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)' }}>{text}</div>
  )
}

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

// ── Bid Stack Chart ───────────────────────────────────────────────────────────
function BidStackChart({ rows, region, filter, win }: {
  rows: any[]; region: Region; filter: FuelFilter; win: Window
}) {
  const chartRows = useMemo((): Record<string,any>[] => buildStack(rows, filter), [rows, filter])
  const presentBuckets = BUCKETS.filter(b => chartRows.some(r => (r[b.key] ?? 0) > 0))
  const hasSpot = chartRows.some(r => r.spotPrice != null && !isNaN(r.spotPrice))
  const fuelLabel = filter === 'both' ? 'Gas & Coal' : filter === 'gas' ? 'Gas' : 'Coal'

  if (!chartRows.length) return null

  return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem',
        marginBottom:'0.75rem', flexWrap:'wrap' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
          {fuelLabel} Bid Stack · {RLABEL[region]}
        </h3>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>
          MW offered by price band · 30-min sample · last {win}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem 0.8rem', marginBottom:'0.75rem' }}>
        {presentBuckets.map(b => (
          <span key={b.key} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
            fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--text)' }}>
            <span style={{ width:9, height:9, borderRadius:2, background:b.col, display:'inline-block' }} />
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
          <YAxis yAxisId="mw" tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            width={44} tickFormatter={(v:number) => `${(v/1000).toFixed(1)}GW`} />
          {hasSpot && (
            <YAxis yAxisId="price" orientation="right"
              tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
              width={44} tickFormatter={(v:number) => `$${Math.round(v)}`} />
          )}
          <Tooltip
            contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.65rem' }}
            formatter={(v:any, name:string) =>
              name === 'spotPrice'
                ? [`$${Number(v).toFixed(2)}/MWh`, 'Spot price']
                : [`${Number(v).toLocaleString()} MW`, name]
            }
          />
          {presentBuckets.map((b, i) => (
            <Bar key={b.key} yAxisId="mw" dataKey={b.key} stackId="s"
              fill={b.col} radius={i === presentBuckets.length-1 ? [2,2,0,0] : undefined} />
          ))}
          {hasSpot && (
            <Line yAxisId="price" type="monotone" dataKey="spotPrice"
              stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} connectNulls name="spotPrice" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── DUID summary chart ────────────────────────────────────────────────────────
function DuidChart({ rows, region, filter }: {
  rows: any[]; region: Region; filter: FuelFilter
}) {
  const duids = useMemo((): { duid:string; fuel:'gas'|'coal'|'other'; avgMw:number }[] =>
    buildDuidSummary(rows, filter)
  , [rows, filter])

  if (!duids.length) return null

  const FUEL_COL = { gas:'#FF9F0A', coal:'#636366', other:'#64D2FF' }

  return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
          Average MW Offered by Unit · {RLABEL[region]}
        </h3>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>
          top gas &amp; coal DUIDs for selected period
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
      <ResponsiveContainer width="100%" height={Math.max(220, duids.length * 22)}>
        <BarChart data={duids} layout="vertical"
          margin={{ top:4, right:56, bottom:0, left:72 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => `${v} MW`} />
          <YAxis type="category" dataKey="duid" width={68}
            tick={{ fill:'var(--text)', fontSize:9, fontFamily:'var(--font-data)' }} />
          <Tooltip
            contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
            formatter={(v:any, _:string, props:any) =>
              [`${v} MW avg`, `${props?.payload?.duid} · ${props?.payload?.fuel}`]}
          />
          <Bar dataKey="avgMw" radius={[0,3,3,0]}>
            {duids.map(d => <Cell key={d.duid} fill={FUEL_COL[d.fuel]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── Price setter placeholder ──────────────────────────────────────────────────
function PriceSetterSection({ rows, region, reportName }: {
  rows: any[]; region: Region; reportName: string
}) {
  if (!rows.length) return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.5rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
          Price Setter · {RLABEL[region]}
        </h3>
      </div>
      <div style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>
        No data returned for <em>{reportName}</em>. Visit{' '}
        <strong>/api/neodebug</strong> — the updated debug endpoint is now hunting for the
        correct report name across 7 variants. Once deployed, share that output and
        we can wire up the exact report name.
      </div>
    </Card>
  )

  const isTimeSeries = 'DateTime' in rows[0]
  const dataKeys = Object.keys(rows[0]).filter(k => k !== 'DateTime')

  const colOf = (k: string) => {
    const l = k.toLowerCase()
    if (l.includes('gas'))   return '#FF9F0A'
    if (l.includes('coal') || l.includes('thermal')) return '#636366'
    if (l.includes('wind'))  return '#30C254'
    if (l.includes('solar')) return '#FFD60A'
    if (l.includes('hydro')) return '#0071E3'
    if (l.includes('batt'))  return '#AF52DE'
    if (duidFuel(k) === 'gas')  return '#FF9F0A'
    if (duidFuel(k) === 'coal') return '#636366'
    return '#64D2FF'
  }

  if (isTimeSeries) {
    const chartRows = rows.filter((_,i) => i%6===0).map(r => {
      const out: Record<string,any> = { time: fmtDT(String(r.DateTime ?? '')) }
      dataKeys.forEach(k => { out[k] = r[k] != null ? Number(r[k]) : null })
      return out
    })
    const maxVal = Math.max(...chartRows.flatMap(r => dataKeys.map(k => Number(r[k] ?? 0))))
    const isPercent = maxVal > 1
    const fmt = (v: number) => isPercent ? `${v.toFixed(1)}%` : `${(v*100).toFixed(1)}%`

    return (
      <Card>
        <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem' }}>
          <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
            {reportName} · {RLABEL[region]}
          </h3>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem 0.8rem', marginBottom:'0.75rem' }}>
          {dataKeys.map(k => (
            <span key={k} style={{ display:'flex', alignItems:'center', gap:'0.3rem',
              fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--text)' }}>
              <span style={{ width:9, height:9, borderRadius:2, background:colOf(k),
                display:'inline-block' }} />
              {k.replace(/\.PERCENTSETTING|_PERCENTSETTING/g,'')}
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartRows} margin={{ top:4, right:16, bottom:0, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="time" tick={{ fill:'#555', fontSize:8, fontFamily:'var(--font-data)' }}
              interval={Math.max(0, Math.floor(chartRows.length/10)-1)} />
            <YAxis tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
              tickFormatter={fmt} width={40} />
            <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
              formatter={(v:any, k:string) => [fmt(Number(v)),
                k.replace(/\.PERCENTSETTING|_PERCENTSETTING/g,'')]} />
            {dataKeys.map((k,i) => (
              <Bar key={k} dataKey={k} stackId="a" fill={colOf(k)}
                radius={i===dataKeys.length-1 ? [2,2,0,0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>
    )
  }

  // Summary rows
  const summaryRows = rows
    .map(r => ({
      name: String(r.Station ?? r.Name ?? r.DUID ?? dataKeys[0] ?? '?'),
      pct:  Math.round(Number(r.PERCENTSETTING ?? r[dataKeys[0]] ?? 0) * 1000) / 10,
    }))
    .filter(r => r.pct > 0).sort((a,b) => b.pct - a.pct).slice(0, 20)

  return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', marginBottom:'0.75rem' }}>
        <h3 style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text)', margin:0 }}>
          {reportName} · {RLABEL[region]}
        </h3>
        <span style={{ color:'var(--muted)', fontFamily:'var(--font-data)', fontSize:'0.62rem' }}>
          % of dispatch intervals as price setter
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, summaryRows.length * 24)}>
        <BarChart data={summaryRows} layout="vertical"
          margin={{ top:4, right:48, bottom:0, left:140 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fill:'#555', fontSize:9, fontFamily:'var(--font-data)' }}
            tickFormatter={(v:number) => `${v}%`} />
          <YAxis type="category" dataKey="name" width={135}
            tick={{ fill:'var(--text)', fontSize:9, fontFamily:'var(--font-data)' }} />
          <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:8, fontFamily:'var(--font-data)', fontSize:'0.72rem' }}
            formatter={(v:any) => [`${v}%`, '% of intervals']} />
          <Bar dataKey="pct" radius={[0,3,3,0]}>
            {summaryRows.map(r => <Cell key={r.name} fill={colOf(r.name)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BidsDashboard() {
  const [region,     setRegion]     = useState<Region>('NSW1')
  const [win,        setWin]        = useState<Window>('7d')
  const [filter,     setFilter]     = useState<FuelFilter>('both')
  const [bidRows,    setBidRows]    = useState<any[]>([])
  const [psRows1,    setPsRows1]    = useState<any[]>([])
  const [psRows2,    setPsRows2]    = useState<any[]>([])
  const [bidLoading, setBidLoading] = useState(true)
  const [psLoading,  setPsLoading]  = useState(true)
  const [bidError,   setBidError]   = useState<string|null>(null)
  const [psError,    setPsError]    = useState<string|null>(null)
  const [psName1,    setPsName1]    = useState('Pricesetter fueltype 30min')
  const [psName2,    setPsName2]    = useState('Pricesetter station 30min')

  const days     = win === '1d' ? 1 : win === '3d' ? 3 : 7
  const fromDate = daysAgo(days)

  // Bids
  useEffect(() => {
    setBidLoading(true); setBidError(null)
    neoJson('104 Bids - Energy\\Region Bids at Actual Prices 5min', fromDate, `GEN;${region}`)
      .then(rows => { setBidRows(rows); setBidLoading(false) })
      .catch(e   => { setBidError(e.message); setBidLoading(false) })
  }, [region, fromDate])

  // Price setter — try multiple names, use first that returns data
  useEffect(() => {
    setPsLoading(true); setPsError(null)

    async function tryNames(names: string[]): Promise<{ rows: any[]; name: string }> {
      for (const n of names) {
        try {
          const rows = await neoJson(n, fromDate, region)
          if (rows.length > 0) return { rows, name: n.split('\\').pop()! }
        } catch { /* try next */ }
      }
      return { rows: [], name: names[0].split('\\').pop()! }
    }

    Promise.all([
      tryNames([
        '108 Price Setter\\Pricesetter fueltype 30min',
        '108 Price Setter\\Pricesetter fueltype and region demand 30min',
        '108 Price Setter\\Pricesetter fueltype and system demand 30min',
        '108 Price Setter\\Pricesetter fueltype 5min',
        '108 Price Setter\\Energy Pricesetter Plant Bandcost',
      ]),
      tryNames([
        '108 Price Setter\\Pricesetter station 30min',
        '108 Price Setter\\Pricesetter station 5min',
        '108 Price Setter\\Pricesetter All Data Table',
        '108 Price Setter\\Pricesetter unit and fuel by region',
        '108 Price Setter\\Energy Pricesetting by Station',
      ]),
    ]).then(([r1, r2]) => {
      setPsRows1(r1.rows); setPsName1(r1.name)
      setPsRows2(r2.rows); setPsName2(r2.name)
      setPsLoading(false)
    }).catch(e => { setPsError(e.message); setPsLoading(false) })
  }, [region, fromDate])

  return (
    <div style={{ maxWidth: 1400, margin:'0 auto', padding:'1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom:'1.25rem' }}>
        <h2 style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--text)',
          letterSpacing:'-0.02em', margin:0 }}>Bids &amp; Price Setter</h2>
        <div style={{ color:'var(--muted)', fontFamily:'var(--font-data)',
          fontSize:'0.65rem', marginTop:'0.25rem' }}>
          NEOpoint · gas &amp; coal generators · {fromDate} → today
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
                color: active ? RCOL[r] : 'var(--muted)',
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
      </div>

      {/* Bids */}
      <SectionLabel text="Generator Bids" />
      {bidLoading ? (
        <Card><div style={{ textAlign:'center', color:'var(--muted)',
          fontFamily:'var(--font-data)', fontSize:'0.75rem', padding:'1rem' }}>
          Loading bid data from NEOpoint…
        </div></Card>
      ) : bidError ? (
        <Card style={{ color:'var(--negative)' }}>
          <div style={{ fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>{bidError}</div>
        </Card>
      ) : (
        <>
          <BidStackChart rows={bidRows} region={region} filter={filter} win={win} />
          <DuidChart     rows={bidRows} region={region} filter={filter} />
        </>
      )}

      {/* Price Setter */}
      <div style={{ marginTop:'1.5rem' }}>
        <SectionLabel text={`Price Setter — ${RLABEL[region]}`} />
        {psLoading ? (
          <Card><div style={{ textAlign:'center', color:'var(--muted)',
            fontFamily:'var(--font-data)', fontSize:'0.75rem', padding:'1rem' }}>
            Loading price setter data… (trying multiple report names)
          </div></Card>
        ) : psError ? (
          <Card style={{ color:'var(--negative)' }}>
            <div style={{ fontFamily:'var(--font-data)', fontSize:'0.75rem' }}>{psError}</div>
          </Card>
        ) : (
          <>
            <PriceSetterSection rows={psRows1} region={region} reportName={psName1} />
            <PriceSetterSection rows={psRows2} region={region} reportName={psName2} />
          </>
        )}
      </div>

      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', marginTop:'1rem',
        fontFamily:'var(--font-data)', fontSize:'0.62rem', color:'var(--muted)',
        display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.25rem' }}>
        <span>Source: NEOpoint by IES · 104 Bids - Energy · 108 Price Setter</span>
        <span>DUID classification from NEM generator registry · <strong>/api/neodebug</strong> for diagnostics</span>
      </div>
    </div>
  )
}
