'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line,
} from 'recharts'

// ── Station registry ──────────────────────────────────────────────────────────
// Names must exactly match NEOpoint (confirmed: "Bayswater" works)
// Others will be validated by neodebug — update once that runs
interface Station { name: string; region: Region; fuel: 'gas'|'coal' }

const STATIONS: Station[] = [
  // ── NSW coal ──
  { name: 'Bayswater',                       region: 'NSW1', fuel: 'coal' },
  { name: 'Eraring',                         region: 'NSW1', fuel: 'coal' },
  { name: 'Mt Piper',                        region: 'NSW1', fuel: 'coal' },
  { name: 'Vales Point B',                   region: 'NSW1', fuel: 'coal' },
  // ── NSW gas ──
  { name: 'Colongra',                        region: 'NSW1', fuel: 'gas'  },
  { name: 'Tallawarra',                      region: 'NSW1', fuel: 'gas'  },
  { name: 'Uranquinty',                      region: 'NSW1', fuel: 'gas'  },
  { name: 'Hunter Valley Energy Centre',     region: 'NSW1', fuel: 'gas'  },
  { name: 'Marulan',                         region: 'NSW1', fuel: 'gas'  },
  // ── VIC coal ──
  { name: 'Loy Yang A',                      region: 'VIC1', fuel: 'coal' },
  { name: 'Loy Yang B',                      region: 'VIC1', fuel: 'coal' },
  { name: 'Yallourn',                        region: 'VIC1', fuel: 'coal' },
  // ── VIC gas ──
  { name: 'Mortlake Power Station',          region: 'VIC1', fuel: 'gas'  },
  { name: 'Jeeralang',                       region: 'VIC1', fuel: 'gas'  },
  { name: 'Laverton North',                  region: 'VIC1', fuel: 'gas'  },
  { name: 'Somerton',                        region: 'VIC1', fuel: 'gas'  },
  { name: 'Newport Power Station',           region: 'VIC1', fuel: 'gas'  },
  { name: 'Bairnsdale Power Station',        region: 'VIC1', fuel: 'gas'  },
  { name: 'Valley Power Peaker',             region: 'VIC1', fuel: 'gas'  },
  // ── QLD coal ──
  { name: 'Tarong',                          region: 'QLD1', fuel: 'coal' },
  { name: 'Tarong North',                    region: 'QLD1', fuel: 'coal' },
  { name: 'Callide B',                       region: 'QLD1', fuel: 'coal' },
  { name: 'Callide C',                       region: 'QLD1', fuel: 'coal' },
  { name: 'Stanwell',                        region: 'QLD1', fuel: 'coal' },
  { name: 'Millmerran',                      region: 'QLD1', fuel: 'coal' },
  { name: 'Gladstone',                       region: 'QLD1', fuel: 'coal' },
  { name: 'Kogan Creek',                     region: 'QLD1', fuel: 'coal' },
  // ── QLD gas ──
  { name: 'Darling Downs Power Station',     region: 'QLD1', fuel: 'gas'  },
  { name: 'Condamine Power Station',         region: 'QLD1', fuel: 'gas'  },
  { name: 'Braemar Power Station',           region: 'QLD1', fuel: 'gas'  },
  { name: 'Braemar 2 Power Station',         region: 'QLD1', fuel: 'gas'  },
  { name: 'Oakey Power Station',             region: 'QLD1', fuel: 'gas'  },
  { name: 'Swanbank E Gas Turbine',          region: 'QLD1', fuel: 'gas'  },
  // ── SA gas ──
  { name: 'Torrens Island Power Station A',  region: 'SA1',  fuel: 'gas'  },
  { name: 'Torrens Island Power Station B',  region: 'SA1',  fuel: 'gas'  },
  { name: 'Osborne Power Station',           region: 'SA1',  fuel: 'gas'  },
  { name: 'Pelican Point Power Station',     region: 'SA1',  fuel: 'gas'  },
  { name: 'Quarantine Power Station',        region: 'SA1',  fuel: 'gas'  },
  { name: 'Snuggery Power Station',          region: 'SA1',  fuel: 'gas'  },
  { name: 'Ladbroke Grove Power Station',    region: 'SA1',  fuel: 'gas'  },
]

// ── Price buckets ─────────────────────────────────────────────────────────────
const BUCKETS = [
  { key: '< $0',     lo: -Infinity, hi: 0,       col: '#636366' },
  { key: '$0–50',    lo: 0,         hi: 50,      col: '#30C254' },
  { key: '$50–100',  lo: 50,        hi: 100,     col: '#64D2FF' },
  { key: '$100–200', lo: 100,       hi: 200,     col: '#0071E3' },
  { key: '$200–300', lo: 200,       hi: 300,     col: '#FF9F0A' },
  { key: '$300–500', lo: 300,       hi: 500,     col: '#FF6B35' },
  { key: '$500–1k',  lo: 500,       hi: 1000,    col: '#FF453A' },
  { key: '$1k+',     lo: 1000,      hi: Infinity, col: '#BF5AF2' },
]

// ── Types ─────────────────────────────────────────────────────────────────────
type Region     = 'NSW1'|'VIC1'|'QLD1'|'SA1'
type Window     = '1d'|'3d'|'7d'
type FuelFilter = 'gas'|'coal'|'both'

const REGIONS: Region[] = ['NSW1','VIC1','QLD1','SA1']
const RLABEL: Record<Region,string> = { NSW1:'NSW', VIC1:'VIC', QLD1:'QLD', SA1:'SA' }
const RCOL:   Record<Region,string> = {
  NSW1:'#0071E3', VIC1:'#30C254', QLD1:'#FF9F0A', SA1:'#AF52DE'
}
const FUEL_COL = { gas: '#FF9F0A', coal: '#636366' }

// ── NEO fetch ─────────────────────────────────────────────────────────────────
async function neoJson(f: string, from: string, instances: string): Promise<any[]> {
  const p = new URLSearchParams({
    report: f, from: `${from} 00:00`, period: 'Daily', instances, section: '-1',
  })
  const r = await fetch(`/api/neopoint?${p}`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.error ?? 'NEOpoint error')
  if (Array.isArray(j.data))       return j.data
  if (Array.isArray(j.data?.data)) return j.data.data
  return []
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(n: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
function fmtDT(s: string) {
  const [date, time] = (s ?? '').replace('T', ' ').split(' ')
  const [, mm, dd]   = (date ?? '').split('-')
  return `${dd}/${mm} ${(time ?? '').slice(0, 5)}`
}

// Parse ".$84.79, BW03, BW01, BW04, BW02" → price=84.79, mw=value
function parseBands(row: any): { price: number; mw: number }[] {
  return Object.entries(row)
    .filter(([k]) => k.startsWith('.$'))
    .map(([k, v]) => ({
      price: parseFloat(k.slice(2).split(',')[0]),
      mw:    Number(v),
    }))
    .filter(b => isFinite(b.price) && b.mw > 0)
}

// Build 30-min sampled stack rows for a single station
function buildStack(rows: any[]): Record<string, any>[] {
  return rows.filter((_, i) => i % 6 === 0).map(row => {
    const bands = parseBands(row)
    const out: Record<string, any> = { time: fmtDT(String(row.DateTime ?? '')) }
    BUCKETS.forEach(({ key, lo, hi }) => {
      out[key] = Math.round(bands.filter(b => b.price >= lo && b.price < hi)
        .reduce((s, b) => s + b.mw, 0))
    })
    // Spot price from any key like "NSW1.Price 5min"
    const pk = Object.keys(row).find(k => /Price 5min/.test(k))
    out.spot = pk ? Number(row[pk]) : null
    return out
  })
}

// ── Station bid chart (mini, one per station) ─────────────────────────────────
function StationBidChart({ station, rows, fuel }: {
  station: Station; rows: any[]; fuel: FuelFilter
}) {
  const chartRows = useMemo((): Record<string, any>[] => buildStack(rows), [rows])
  const presentBuckets = BUCKETS.filter(b => chartRows.some(r => (r[b.key] ?? 0) > 0))
  const hasSpot = chartRows.some(r => r.spot != null)
  const totalMW = chartRows.length
    ? Math.round(chartRows.reduce((s, r) =>
        s + BUCKETS.reduce((bs, b) => bs + (r[b.key] ?? 0), 0), 0) / chartRows.length)
    : 0

  if (!chartRows.length || !presentBuckets.length) return null

  return (
    <div className="sq-card" style={{ padding: '1rem' }}>
      {/* Station header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.8rem',
            color: FUEL_COL[station.fuel], fontFamily: 'var(--font-ui)' }}>
            {station.name}
          </span>
          <span style={{ fontSize: '0.6rem', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: 'var(--font-data)' }}>
            {station.fuel}
          </span>
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)',
          fontFamily: 'var(--font-data)' }}>
          avg {totalMW.toLocaleString()} MW
        </span>
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={chartRows}
          margin={{ top: 2, right: hasSpot ? 36 : 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="time"
            tick={{ fill: '#555', fontSize: 7, fontFamily: 'var(--font-data)' }}
            interval={Math.max(0, Math.floor(chartRows.length / 6) - 1)} />
          <YAxis yAxisId="mw" width={36}
            tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
          {hasSpot && (
            <YAxis yAxisId="price" orientation="right" width={32}
              tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
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
            <Bar key={b.key} yAxisId="mw" dataKey={b.key} stackId="s"
              fill={b.col} radius={i === presentBuckets.length - 1 ? [2, 2, 0, 0] : undefined} />
          ))}
          {hasSpot && (
            <Line yAxisId="price" type="monotone" dataKey="spot"
              stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray="3 2"
              dot={false} connectNulls name="spot" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Combined overview chart (all stations for region stacked) ─────────────────
function RegionOverviewChart({ stationData, filter, region }: {
  stationData: Record<string, any[]>; filter: FuelFilter; region: Region
}) {
  // Build a time-aligned combined view: total MW by bucket across all stations
  const allStations = STATIONS.filter(s =>
    s.region === region && (filter === 'both' || s.fuel === filter)
  )

  const chartRows = useMemo((): Record<string, any>[] => {
    // Use the first station with data to get time axis, then sum all
    const withData = allStations.filter(s => (stationData[s.name]?.length ?? 0) > 0)
    if (!withData.length) return []

    const ref      = stationData[withData[0].name]
    const sampled  = ref.filter((_, i) => i % 6 === 0)

    return sampled.map((refRow, idx) => {
      const out: Record<string, any> = { time: fmtDT(String(refRow.DateTime ?? '')) }
      // Spot price from reference station
      const pk = Object.keys(refRow).find(k => /Price 5min/.test(k))
      out.spot = pk ? Number(refRow[pk]) : null

      BUCKETS.forEach(({ key, lo, hi }) => {
        let total = 0
        for (const s of withData) {
          const rows = stationData[s.name]
          const row  = rows[idx * 6] ?? rows[rows.length - 1]
          if (row) {
            total += parseBands(row)
              .filter(b => b.price >= lo && b.price < hi)
              .reduce((sum, b) => sum + b.mw, 0)
          }
        }
        out[key] = Math.round(total)
      })
      return out
    })
  }, [stationData, filter, region])

  const presentBuckets = BUCKETS.filter(b => chartRows.some(r => (r[b.key] ?? 0) > 0))
  const hasSpot = chartRows.some(r => r.spot != null)
  if (!chartRows.length || !presentBuckets.length) return null

  const fuelLabel = filter === 'both' ? 'Gas & Coal' : filter === 'gas' ? 'Gas' : 'Coal'

  return (
    <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem',
        marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
          {fuelLabel} Combined Bid Stack · {RLABEL[region]}
        </h3>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.62rem' }}>
          all stations combined · MW offered by price band · 30-min sample
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', marginBottom: '0.75rem' }}>
        {presentBuckets.map(b => (
          <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--text)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: b.col,
              display: 'inline-block', flexShrink: 0 }} />
            {b.key}
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

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartRows}
          margin={{ top: 4, right: hasSpot ? 48 : 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="time"
            tick={{ fill: '#555', fontSize: 8, fontFamily: 'var(--font-data)' }}
            interval={Math.max(0, Math.floor(chartRows.length / 12) - 1)} />
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
            <Bar key={b.key} yAxisId="mw" dataKey={b.key} stackId="s"
              fill={b.col} radius={i === presentBuckets.length - 1 ? [2, 2, 0, 0] : undefined} />
          ))}
          {hasSpot && (
            <Line yAxisId="price" type="monotone" dataKey="spot"
              stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} connectNulls name="spot" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Controls ──────────────────────────────────────────────────────────────────
function Pills<T extends string>({ value, onChange, opts }: {
  value: T; onChange: (v: T) => void
  opts: { v: T; label: string }[]
}) {
  return (
    <div style={{ display: 'flex', background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
      {opts.map(({ v, label }) => (
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BidsDashboard() {
  const [region,      setRegion]      = useState<Region>('NSW1')
  const [win,         setWin]         = useState<Window>('7d')
  const [filter,      setFilter]      = useState<FuelFilter>('both')
  const [stationData, setStationData] = useState<Record<string, any[]>>({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [loadedCount, setLoadedCount] = useState(0)

  const days     = win === '1d' ? 1 : win === '3d' ? 3 : 7
  const fromDate = daysAgo(days)

  const visibleStations = useMemo(() =>
    STATIONS.filter(s => s.region === region && (filter === 'both' || s.fuel === filter))
  , [region, filter])

  useEffect(() => {
    setLoading(true); setError(null); setStationData({}); setLoadedCount(0)

    const toFetch = STATIONS.filter(s => s.region === region)
    let completed = 0
    const results: Record<string, any[]> = {}

    const fetches = toFetch.map(async s => {
      try {
        const rows = await neoJson(
          '104 Bids - Energy\\Station Bids at Actual Prices 5min',
          fromDate, `GEN;${s.name}`
        )
        if (rows.length > 0) results[s.name] = rows
      } catch { /* station name not found in NEOpoint — skip silently */ }
      completed++
      setLoadedCount(completed)
    })

    Promise.all(fetches).then(() => {
      setStationData({ ...results })
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [region, fromDate])

  const stationsWithData = visibleStations.filter(s => (stationData[s.name]?.length ?? 0) > 0)
  const totalStations    = STATIONS.filter(s => s.region === region).length

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)',
          letterSpacing: '-0.02em', margin: 0 }}>Generator Bids</h2>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-data)',
          fontSize: '0.65rem', marginTop: '0.25rem' }}>
          NEOpoint · gas &amp; coal · station-level bid stacks · {fromDate} → today
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {REGIONS.map(r => {
            const active = r === region
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                padding: '0.4rem 0.9rem', border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
                fontWeight: active ? 600 : 400,
                color:       active ? RCOL[r] : 'var(--muted)',
                borderBottom: active ? `2px solid ${RCOL[r]}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}>{RLABEL[r]}</button>
            )
          })}
        </div>

        <Pills value={win} onChange={setWin}
          opts={[{ v:'1d', label:'1 day' }, { v:'3d', label:'3 days' }, { v:'7d', label:'7 days' }]} />
        <Pills value={filter} onChange={setFilter}
          opts={[{ v:'both', label:'Gas & Coal' }, { v:'gas', label:'Gas only' }, { v:'coal', label:'Coal only' }]} />

        {/* Progress */}
        {loading && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)' }}>
            Loading {loadedCount}/{totalStations} stations…
          </span>
        )}
        {!loading && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)' }}>
            {stationsWithData.length} of {visibleStations.length} stations have data
            {visibleStations.length - stationsWithData.length > 0 &&
              ` · ${visibleStations.length - stationsWithData.length} name mismatches — run /api/neodebug`}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="sq-card" style={{ padding: '1.25rem', marginBottom: '0.75rem',
          color: 'var(--negative)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && loadedCount === 0 && (
        <div className="sq-card" style={{ padding: '3rem', textAlign: 'center',
          color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
          Fetching bid data from NEOpoint…
        </div>
      )}

      {/* Combined overview */}
      {!loading && (
        <RegionOverviewChart
          stationData={stationData}
          filter={filter}
          region={region}
        />
      )}

      {/* Per-station grid */}
      {!loading && stationsWithData.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.6rem',
            color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em',
            marginBottom: '0.75rem', paddingBottom: '0.35rem',
            borderBottom: '1px solid var(--border)' }}>
            Per-station bid stacks · MW by price band · 30-min sample
          </div>

          {/* Shared legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem',
            marginBottom: '0.75rem' }}>
            {BUCKETS.map(b => (
              <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--text)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: b.col,
                  display: 'inline-block', flexShrink: 0 }} />
                {b.key}
              </span>
            ))}
          </div>

          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '0.75rem' }}>
            {stationsWithData.map(s => (
              <StationBidChart
                key={s.name}
                station={s}
                rows={stationData[s.name]}
                fuel={filter}
              />
            ))}
          </div>
        </>
      )}

      {/* No data */}
      {!loading && stationsWithData.length === 0 && !error && (
        <div className="sq-card" style={{ padding: '1.5rem',
          color: 'var(--muted)', fontFamily: 'var(--font-data)', fontSize: '0.75rem' }}>
          No station bid data returned for {RLABEL[region]}.
          Visit <strong>/api/neodebug</strong> — the updated debug endpoint checks all station
          name variants and will show exactly which names work in your NEOpoint subscription.
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
        marginTop: '1.25rem', fontFamily: 'var(--font-data)', fontSize: '0.62rem',
        color: 'var(--muted)', display: 'flex', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>Source: NEOpoint by IES · 104 Bids - Energy · Station Bids at Actual Prices 5min</span>
        <span>Price setter reports not available in current subscription</span>
      </div>
    </div>
  )
}
