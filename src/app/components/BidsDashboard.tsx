'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type Region  = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'
type Window  = '1d' | '3d' | '7d'
type FuelFilter = 'gas' | 'coal' | 'both'

const REGIONS: Region[]   = ['NSW1', 'VIC1', 'QLD1', 'SA1']
const RLABEL: Record<Region, string> = { NSW1:'NSW', VIC1:'VIC', QLD1:'QLD', SA1:'SA' }
const RCOL:   Record<Region, string> = { NSW1:'#0071E3', VIC1:'#30C254', QLD1:'#FF9F0A', SA1:'#AF52DE' }

// Standard NEM price bands
const BANDS = [
  { key:'B1',  label:'< $0',       col:'#636366' },
  { key:'B2',  label:'$0–50',      col:'#30C254' },
  { key:'B3',  label:'$50–100',    col:'#64D2FF' },
  { key:'B4',  label:'$100–200',   col:'#0071E3' },
  { key:'B5',  label:'$200–300',   col:'#FF9F0A' },
  { key:'B6',  label:'$300–500',   col:'#FF6B35' },
  { key:'B7',  label:'$500–1000',  col:'#FF453A' },
  { key:'B8',  label:'$1k–5k',     col:'#BF5AF2' },
  { key:'B9',  label:'$5k–MPC',    col:'#FF2D55' },
  { key:'B10', label:'MPC',        col:'#1C1C1E' },
]

// ── NEO fetch ─────────────────────────────────────────────────────────────────
async function neoJson(f: string, from: string, instances: string): Promise<any[]> {
  const p = new URLSearchParams({ report: f, from: `${from} 00:00`, period: 'Daily', instances, section: '-1' })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.error ?? 'NEOpoint error')
  if (Array.isArray(j.data))        return j.data
  if (Array.isArray(j.data?.data))  return j.data.data
  return []
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
function fmtDateTime(s: string) {
  // "2026-03-23 14:35:00" → "14:35" or "23/03 14:35"
  if (!s) return ''
  const parts = s.replace('T', ' ').split(' ')
  const time  = (parts[1] ?? '').slice(0, 5)
  const [, mm, dd] = (parts[0] ?? '').split('-')
  return `${dd}/${mm} ${time}`
}

// ── Station list ─────────────────────────────────────────────────────────────
interface Station { name: string; region: Region; fuel: 'gas'|'coal' }

// Static fallback list of major NEM gas + coal stations (station names as NEOpoint expects)
const STATIC_STATIONS: Station[] = [
  // NSW gas
  { name:'Tallawarra',          region:'NSW1', fuel:'gas'  },
  { name:'Colongra',            region:'NSW1', fuel:'gas'  },
  { name:'Uranquinty',          region:'NSW1', fuel:'gas'  },
  { name:'Marulan',             region:'NSW1', fuel:'gas'  },
  { name:'Hunter Valley Energy Centre', region:'NSW1', fuel:'gas' },
  // NSW coal
  { name:'Bayswater',           region:'NSW1', fuel:'coal' },
  { name:'Eraring',             region:'NSW1', fuel:'coal' },
  { name:'Vales Point B',       region:'NSW1', fuel:'coal' },
  { name:'Mt Piper',            region:'NSW1', fuel:'coal' },
  { name:'Liddell',             region:'NSW1', fuel:'coal' },
  // VIC gas
  { name:'Mortlake Power Station', region:'VIC1', fuel:'gas' },
  { name:'Jeeralang',           region:'VIC1', fuel:'gas'  },
  { name:'Laverton North',      region:'VIC1', fuel:'gas'  },
  { name:'Somerton',            region:'VIC1', fuel:'gas'  },
  { name:'Newport Power Station', region:'VIC1', fuel:'gas' },
  { name:'Bairnsdale Power Station', region:'VIC1', fuel:'gas' },
  // VIC coal
  { name:'Loy Yang A',          region:'VIC1', fuel:'coal' },
  { name:'Loy Yang B',          region:'VIC1', fuel:'coal' },
  { name:'Yallourn',            region:'VIC1', fuel:'coal' },
  // QLD gas
  { name:'Darling Downs Power Station', region:'QLD1', fuel:'gas' },
  { name:'Condamine Power Station', region:'QLD1', fuel:'gas' },
  { name:'Braemar Power Station', region:'QLD1', fuel:'gas' },
  { name:'Braemar 2 Power Station', region:'QLD1', fuel:'gas' },
  { name:'Swanbank E Gas Turbine', region:'QLD1', fuel:'gas' },
  { name:'Oakey Power Station', region:'QLD1', fuel:'gas'  },
  { name:'Roma Gas Turbine',    region:'QLD1', fuel:'gas'  },
  { name:'Mackay Gas Turbine',  region:'QLD1', fuel:'gas'  },
  // QLD coal
  { name:'Tarong',              region:'QLD1', fuel:'coal' },
  { name:'Tarong North',        region:'QLD1', fuel:'coal' },
  { name:'Callide B',           region:'QLD1', fuel:'coal' },
  { name:'Callide C',           region:'QLD1', fuel:'coal' },
  { name:'Stanwell',            region:'QLD1', fuel:'coal' },
  { name:'Millmerran',          region:'QLD1', fuel:'coal' },
  { name:'Gladstone',           region:'QLD1', fuel:'coal' },
  { name:'Kogan Creek',         region:'QLD1', fuel:'coal' },
  // SA gas
  { name:'Torrens Island Power Station A', region:'SA1', fuel:'gas' },
  { name:'Torrens Island Power Station B', region:'SA1', fuel:'gas' },
  { name:'Osborne Power Station', region:'SA1', fuel:'gas' },
  { name:'Pelican Point Power Station', region:'SA1', fuel:'gas' },
  { name:'Hallett Power Station', region:'SA1', fuel:'gas' },
  { name:'Ladbroke Grove',      region:'SA1', fuel:'gas'  },
  { name:'Quarantine Power Station', region:'SA1', fuel:'gas' },
  { name:'Snuggery Power Station', region:'SA1', fuel:'gas' },
]

// ── Utility ───────────────────────────────────────────────────────────────────
function parseBandCols(row: any, stationOrRegion: string): Record<string, number> {
  const out: Record<string, number> = {}
  const keys = Object.keys(row)
  // Try patterns: Eraring_B1_MW, B1_MW, B1
  BANDS.forEach(({ key }) => {
    const val =
      row[`${stationOrRegion}_${key}_MW`] ??
      row[`${stationOrRegion.replace(/ /g,'_')}_${key}_MW`] ??
      row[`${key}_MW`] ??
      row[key] ??
      // Fallback: find any key containing B1/B2 etc.
      keys.find(k => k.toUpperCase().endsWith(`_${key}_MW`) || k.toUpperCase().endsWith(`_${key}`))
        ? row[keys.find(k => k.toUpperCase().endsWith(`_${key}_MW`) || k.toUpperCase().endsWith(`_${key}`))!]
        : null
    out[key] = val != null ? Math.round(Number(val)) : 0
  })
  return out
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="sq-card" style={{ padding: '2rem', textAlign: 'center',
      color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
      {text}
    </div>
  )
}

function ErrorCard({ msg }: { msg: string }) {
  return (
    <div className="sq-card" style={{ padding: '1.25rem',
      color: 'var(--negative)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
      {msg}
      <div style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.65rem' }}>
        Visit <strong>/api/neodebug</strong> to check the API response structure
      </div>
    </div>
  )
}

// ── Station Bid Stack ─────────────────────────────────────────────────────────
function StationBidChart({ station, rows, fuel }: {
  station: string; rows: any[]; fuel: 'gas'|'coal'
}) {
  const FUEL_COL = { gas: '#FF9F0A', coal: '#636366' }
  const accentCol = FUEL_COL[fuel]

  const chartRows = useMemo((): Record<string, any>[] => {
    if (!rows.length) return []
    return rows
      .filter((_, i) => i % 6 === 0)   // sample every 30 min (6 × 5min)
      .map(r => {
        const bands = parseBandCols(r, station)
        return {
          time: fmtDateTime(String(r.DateTime ?? '')),
          ...bands,
          total: BANDS.reduce((s, b) => s + (bands[b.key] ?? 0), 0),
        } as Record<string, any>
      })
  }, [rows, station])

  const presentBands = BANDS.filter(b => chartRows.some(r => (r[b.key] ?? 0) > 0))
  if (!chartRows.length || chartRows.every(r => r.total === 0)) return null

  return (
    <div className="sq-card" style={{ padding: '1rem', marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.75rem', fontWeight: 700,
          color: accentCol }}>{station}</span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fuel}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartRows} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
            interval={Math.max(0, Math.floor(chartRows.length / 8) - 1)} />
          <YAxis tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
            width={35} tickFormatter={(v: number) => `${v}`} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.65rem' }}
            formatter={(v: any, name: string) =>
              [`${v} MW`, BANDS.find(b => b.key === name)?.label ?? name]}
          />
          {presentBands.map((b, i) => (
            <Bar key={b.key} dataKey={b.key} stackId="a" fill={b.col}
              radius={i === presentBands.length - 1 ? [2, 2, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Price Setter Plant Bandcost ───────────────────────────────────────────────
function PriceSetterBandChart({ rows, region }: { rows: any[]; region: Region }) {
  const chartRows = useMemo((): Record<string, any>[] => {
    if (!rows.length) return []
    return rows.filter((_, i) => i % 6 === 0).map(r => {
      const out: Record<string, any> = { time: fmtDateTime(String(r.DateTime ?? '')) }
      Object.keys(r).filter(k => k !== 'DateTime').forEach(k => {
        out[k] = r[k] != null ? Math.round(Number(r[k]) * 10) / 10 : null
      })
      return out
    })
  }, [rows])

  const dataKeys = useMemo(() =>
    rows.length ? Object.keys(rows[0]).filter(k => k !== 'DateTime') : []
  , [rows])

  if (!chartRows.length) return null

  const colOf = (k: string) => {
    const l = k.toLowerCase()
    if (l.includes('gas'))   return '#FF9F0A'
    if (l.includes('coal'))  return '#636366'
    if (l.includes('wind'))  return '#30C254'
    if (l.includes('solar')) return '#FFD60A'
    if (l.includes('hydro')) return '#0071E3'
    if (l.includes('batt'))  return '#AF52DE'
    return '#98989D'
  }

  return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
          Price Setter Plant &amp; Band Cost · {RLABEL[region]}
        </h3>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
          $/MWh marginal cost of price-setting unit
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', marginBottom: '0.75rem' }}>
        {dataKeys.map(k => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--text)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colOf(k),
              display: 'inline-block', flexShrink: 0 }} />
            {k}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartRows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            interval={Math.max(0, Math.floor(chartRows.length / 10) - 1)} />
          <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickFormatter={(v: number) => `$${v}`} width={42} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
            formatter={(v: any, k: string) => [`$${v}/MWh`, k]}
          />
          {dataKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={colOf(k)}
              radius={i === dataKeys.length - 1 ? [2, 2, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Price Setting % by Station ────────────────────────────────────────────────
function PriceSettingByStationChart({ rows, region }: { rows: any[]; region: Region }) {
  // This report gives each station's % of intervals as price setter
  // Rows: [{ Station: 'Loy Yang A', PERCENTSETTING: 0.42 }, ...]
  // OR:   [{ DateTime, StationA: pct, StationB: pct, ... }]
  const isTimeSeries = rows.length > 0 && 'DateTime' in rows[0]

  const summaryRows = useMemo(() => {
    if (!rows.length) return []
    if (!isTimeSeries) {
      // Already summary: { Station, PERCENTSETTING } or similar
      return rows
        .map(r => ({
          station: String(r.Station ?? r.Name ?? r.DUID ?? Object.keys(r)[0]),
          pct:     Math.round(Number(r.PERCENTSETTING ?? r.Pct ?? r.Value ?? 0) * 100) / 100,
        }))
        .filter(r => r.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 15)
    } else {
      // Time-series: average each column
      const keys = Object.keys(rows[0]).filter(k => k !== 'DateTime')
      return keys.map(k => ({
        station: k,
        pct: Math.round(rows.reduce((s, r) =>
          s + (Number(r[k] ?? 0)), 0) / rows.length * 1000) / 10,
      }))
        .filter(r => r.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 15)
    }
  }, [rows, isTimeSeries])

  if (!summaryRows.length) return null

  const colOf = (name: string) => {
    const l = name.toLowerCase()
    if (l.includes('gas') || l.includes('torrens') || l.includes('mortlake') ||
        l.includes('tallawarra') || l.includes('darling') || l.includes('pelican') ||
        l.includes('osborne') || l.includes('hallett') || l.includes('braemar') ||
        l.includes('ladbroke') || l.includes('colongra') || l.includes('uranquinty')) return '#FF9F0A'
    if (l.includes('loy yang') || l.includes('bayswater') || l.includes('eraring') ||
        l.includes('vales') || l.includes('tarong') || l.includes('stanwell') ||
        l.includes('callide') || l.includes('gladstone') || l.includes('kogan') ||
        l.includes('millmerran')) return '#636366'
    if (l.includes('wind') || l.includes('wf')) return '#30C254'
    if (l.includes('solar')) return '#FFD60A'
    if (l.includes('hydro') || l.includes('tumut') || l.includes('murray')) return '#0071E3'
    if (l.includes('batt')) return '#AF52DE'
    return '#64D2FF'
  }

  return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
          Price Setting by Station · {RLABEL[region]}
        </h3>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
          % of dispatch intervals as price setter
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(180, summaryRows.length * 22)}>
        <BarChart data={summaryRows} layout="vertical"
          margin={{ top: 4, right: 40, bottom: 0, left: 140 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-data)' }}
            tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="category" dataKey="station" width={135}
            tick={{ fill: 'var(--text)', fontSize: 9, fontFamily: 'var(--font-data)' }} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'var(--font-data)', fontSize: '0.72rem' }}
            formatter={(v: any) => [`${v}%`, '% of intervals']}
          />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
            {summaryRows.map((r) => (
              <Cell key={r.station} fill={colOf(r.station)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Window pill group ─────────────────────────────────────────────────────────
function WindowPills({ value, onChange }: { value: Window; onChange: (v: Window) => void }) {
  const opts: { v: Window; label: string }[] = [
    { v: '1d', label: '1 day' },
    { v: '3d', label: '3 days' },
    { v: '7d', label: '7 days' },
  ]
  return (
    <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 2, gap: 2 }}>
      {opts.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '0.25rem 0.65rem', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: '0.72rem', fontWeight: value === v ? 600 : 400,
          background: value === v ? 'var(--accent)' : 'transparent',
          color: value === v ? '#fff' : 'var(--muted)', transition: 'all 0.15s',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function BidsDashboard() {
  const [region,      setRegion]      = useState<Region>('NSW1')
  const [window,      setWindow]      = useState<Window>('7d')
  const [fuelFilter,  setFuelFilter]  = useState<FuelFilter>('both')

  // Bid data: stationName → rows[]
  const [bidData,     setBidData]     = useState<Record<string, any[]>>({})
  const [bidLoading,  setBidLoading]  = useState(false)
  const [bidError,    setBidError]    = useState<string|null>(null)

  // Price setter data
  const [psPlantRows, setPsPlantRows] = useState<any[]>([])
  const [psStaRows,   setPsStaRows]   = useState<any[]>([])
  const [psLoading,   setPsLoading]   = useState(false)
  const [psError,     setPsError]     = useState<string|null>(null)

  const days = window === '1d' ? 1 : window === '3d' ? 3 : 7
  const fromDate = daysAgo(days)

  // Filtered stations for current region + fuel filter — use static list directly
  const filteredStations = useMemo(() =>
    STATIC_STATIONS.filter(s =>
      s.region === region &&
      (fuelFilter === 'both' || s.fuel === fuelFilter)
    )
  , [region, fuelFilter])

  // Fetch bid data — stable primitive deps (region, fuelFilter, fromDate)
  useEffect(() => {
    const stations = STATIC_STATIONS.filter(s =>
      s.region === region && (fuelFilter === 'both' || s.fuel === fuelFilter)
    )
    if (!stations.length) { setBidLoading(false); return }
    setBidLoading(true); setBidError(null); setBidData({})

    const fetches = stations.map(async s => {
      const rows = await neoJson(
        '104 Bids - Energy\\Station Bids at Actual Prices 5min',
        fromDate,
        `GEN;${s.name}`
      )
      return { name: s.name, rows }
    })

    Promise.allSettled(fetches).then(results => {
      const data: Record<string, any[]> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') data[r.value.name] = r.value.rows
      }
      setBidData(data)
      setBidLoading(false)
    }).catch(e => { setBidError(e.message); setBidLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, fuelFilter, fromDate])

  // Fetch price setter
  useEffect(() => {
    setPsLoading(true); setPsError(null)
    Promise.all([
      neoJson('108 Price Setter\\Energy Pricesetter Plant Bandcost', fromDate, region),
      neoJson('108 Price Setter\\Energy Pricesetting by Station',    fromDate, region),
    ]).then(([plant, sta]) => {
      setPsPlantRows(plant); setPsStaRows(sta); setPsLoading(false)
    }).catch(e => { setPsError(e.message); setPsLoading(false) })
  }, [region, fromDate])

  const hasBidData = Object.values(bidData).some(rows => rows.length > 0)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>Bids &amp; Price Setter</h2>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)',
          fontSize: '0.65rem', marginTop: '0.25rem' }}>
          NEOpoint · gas &amp; coal generators only · data from neopoint.com.au
        </div>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        alignItems: 'center', marginBottom: '1.25rem' }}>

        {/* Region tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {REGIONS.map(r => {
            const active = r === region
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                padding: '0.4rem 0.9rem', border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
                fontWeight: active ? 600 : 400,
                color: active ? RCOL[r] : 'var(--muted)',
                borderBottom: active ? `2px solid ${RCOL[r]}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}>{RLABEL[r]}</button>
            )
          })}
        </div>

        {/* Time window */}
        <WindowPills value={window} onChange={setWindow} />

        {/* Fuel filter */}
        <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 2, gap: 2 }}>
          {([['both','Gas & Coal'],['gas','Gas only'],['coal','Coal only']] as [FuelFilter,string][]).map(([v, label]) => (
            <button key={v} onClick={() => setFuelFilter(v)} style={{
              padding: '0.25rem 0.65rem', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: '0.72rem', fontWeight: fuelFilter === v ? 600 : 400,
              background: fuelFilter === v ? 'var(--accent)' : 'transparent',
              color: fuelFilter === v ? '#fff' : 'var(--muted)', transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)' }}>
          {fromDate} → today · {filteredStations.length} stations
        </span>
      </div>

      {/* ── Bids section ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem',
          paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)' }}>
          Generator Bid Stacks by Price Band (MW offered · 30-min sample)
        </div>

        {bidLoading ? (
          <LoadingCard text={`Loading bids for ${filteredStations.length} stations…`} />
        ) : bidError ? (
          <ErrorCard msg={bidError} />
        ) : !hasBidData ? (
          <div className="sq-card" style={{ padding: '1.25rem', color: 'var(--muted)',
            fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
            No bid data returned. Visit <strong>/api/neodebug</strong> to verify station names match NEOpoint.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '0.75rem' }}>
            {filteredStations.map(s => {
              const rows = bidData[s.name]
              if (!rows?.length) return null
              return <StationBidChart key={s.name} station={s.name} rows={rows} fuel={s.fuel} />
            })}
          </div>
        )}
      </div>

      {/* ── Price setter section ── */}
      <div>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem', color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem',
          paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)' }}>
          Price Setter Analysis — {RLABEL[region]}
        </div>

        {psLoading ? (
          <LoadingCard text="Loading price setter data…" />
        ) : psError ? (
          <ErrorCard msg={psError} />
        ) : (
          <>
            {psPlantRows.length > 0
              ? <PriceSetterBandChart rows={psPlantRows} region={region} />
              : <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem',
                  color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
                  No plant band cost data. Check /api/neodebug for correct report name.
                </div>
            }
            {psStaRows.length > 0
              ? <PriceSettingByStationChart rows={psStaRows} region={region} />
              : <div className="sq-card" style={{ padding: '1.25rem',
                  color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
                  No station price setting data. Check /api/neodebug.
                </div>
            }
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '1rem',
        fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>Source: NEOpoint by IES · neopoint.com.au · 104 Bids &amp; 108 Price Setter</span>
        <span>Station names must match NEOpoint exactly — visit <strong>/api/neodebug</strong> if data is missing</span>
      </div>
    </div>
  )
}
