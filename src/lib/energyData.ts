const BASE_URL = 'https://api.openelectricity.org.au/v4'
const GAS_FUELTECHS = new Set(['gas_ccgt', 'gas_ocgt', 'gas_recip', 'gas_steam', 'gas_wcmg'])
const REGIONS = ['NSW1', 'VIC1', 'QLD1', 'SA1']

const FUEL_MIX_ORDER = ['Coal','Gas','Hydro','Wind','Solar','Battery','Imports']


const FIVE_MIN_PERIODS: Record<string, number> = {
  '5m': 1, '1h': 12, '1d': 288, '7d': 2016,
  '1M': 8928, '3M': 26784, '1y': 105120, 'fy': 105120,
}

export type IntervalOption = '5m' | '1h' | '1d'

export interface EnergyParams {
  interval: IntervalOption
}

function getHeaders() {
  const token = process.env.OE_API_TOKEN
  if (!token) throw new Error('OE_API_TOKEN environment variable not set')
  return { Authorization: `Bearer ${token}` }
}

async function apiFetch(url: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${url}${qs}`, { headers: getHeaders(), cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function fetchGasFacilities() {
  const data = await apiFetch(`${BASE_URL}/facilities/`, { network_code: 'NEM' })
  const result: { code: string; name: string; region: string }[] = []
  const seen = new Set<string>()
  for (const f of data.data ?? []) {
    if (!REGIONS.includes(f.network_region)) continue
    const hasGas = (f.units ?? []).some(
      (u: any) => GAS_FUELTECHS.has(u.fueltech_id) && u.status_id === 'operating'
    )
    if (hasGas && !seen.has(f.code)) {
      result.push({ code: f.code, name: f.name, region: f.network_region })
      seen.add(f.code)
    }
  }
  return result
}

function parseTimeseries(apiResponse: any): Record<string, [string, number][]> {
  const result: Record<string, [string, number][]> = {}
  for (const series of apiResponse.data ?? []) {
    if (series.results) {
      for (const item of series.results) {
        const label = item.columns?.unit_code ?? item.name ?? 'unknown'
        const pts: [string, number][] = []
        for (const entry of item.data ?? []) {
          if (Array.isArray(entry) && entry.length === 2) pts.push([entry[0], entry[1]])
        }
        if (pts.length) result[label] = pts
      }
    } else if (series.history?.start) {
      const label = series.unit_code ?? series.id ?? 'unknown'
      const { start, data: values, interval: iv } = series.history
      const mins = iv === '5m' ? 5 : iv === '1h' ? 60 : 1440
      let dt = new Date(start)
      const pts: [string, number][] = []
      for (const v of values ?? []) {
        pts.push([dt.toISOString(), v])
        dt = new Date(dt.getTime() + mins * 60000)
      }
      result[label] = pts
    }
  }
  return result
}

function toAEST(isoString: string): string {
  const d = new Date(isoString)
  return new Date(d.getTime() + 10 * 3600000).toISOString().replace('T', ' ').slice(0, 16)
}

function aggregateFacility(unitSeries: Record<string, [string, number][]>, interval: string) {
  const combined: Record<string, number> = {}
  for (const pts of Object.values(unitSeries)) {
    for (const [ts, v] of pts) {
      const key = toAEST(ts)
      combined[key] = (combined[key] ?? 0) + (v ?? 0)
    }
  }
  const divisor = FIVE_MIN_PERIODS[interval] ?? 1
  const result: Record<string, number> = {}
  for (const [k, v] of Object.entries(combined)) result[k] = v / divisor
  return result
}


export async function fetchFuelMix(region: string, interval: string): Promise<{
  dates: string[]
  series: Record<string, (number | null)[]>
}> {
  // Correct API call per docs:
  // GET /v4/data/network/NEM
  //   primary_grouping=network_region
  //   secondary_grouping=fueltech_group   ← groups by fuel tech group
  //   network_region=NSW1
  const resp = await apiFetch(`${BASE_URL}/data/network/NEM`, {
    metrics:           'power',
    network_region:    region,
    interval,
    primary_grouping:  'network_region',
    secondary_grouping:'fueltech_group',
  })

  const raw: Record<string, Record<string, number>> = {}

  // Response: data[] → each item has results[] → each result has columns.fueltech_group
  // and data[] of [datetime, value] pairs
  for (const item of resp.data ?? []) {
    for (const result of item.results ?? []) {
      // Guard on result-level region (API returns region in result.columns.region)
      const resultRegion: string = (result.columns?.region ?? '').toUpperCase()
      if (resultRegion && resultRegion !== region.toUpperCase()) continue
      // The fueltech_group label comes from result columns
      const ftGroup: string = result.columns?.fueltech_group ?? ''
      if (!ftGroup) continue

      // Map OE fueltech_group labels → our display categories
      // Actual API keys confirmed from /api/fuelmixdebug response
      const group = ({
        'coal':                 'Coal',
        'gas':                  'Gas',
        'wind':                 'Wind',
        'solar':                'Solar',
        'battery_discharging':  'Battery',  // positive MW discharge only
        'battery':              null,        // net (negative when charging) — skip
        'battery_charging':     null,        // charging draw — skip
        'hydro':                'Hydro',
        'bioenergy':            null,        // minor
        'pumps':                null,        // exclude pumped hydro
        'distillate':           null,        // minor
        'imports':              'Imports',
      } as Record<string, string | null>)[ftGroup.toLowerCase()]

      if (!group) continue
      if (!raw[group]) raw[group] = {}

      for (const entry of result.data ?? []) {
        if (Array.isArray(entry) && entry.length === 2) {
          const ts  = String(entry[0])
          const val = Number(entry[1])
          if (!isNaN(val) && val >= 0) {
            const key = toAEST(ts)
            raw[group][key] = (raw[group][key] ?? 0) + val
          }
        }
      }
    }
  }

  // Divide accumulated MWh totals by number of 5-min periods to get MW
  const divisor = FIVE_MIN_PERIODS[interval] ?? 1
  for (const grp of Object.keys(raw)) {
    for (const dt of Object.keys(raw[grp])) {
      raw[grp][dt] = raw[grp][dt] / divisor
    }
  }

  const allDates = Array.from(
    new Set(Object.values(raw).flatMap(m => Object.keys(m)))
  ).sort()

  // battery_storage from OE is discharge power — include even if values are small
  // battery_charging is excluded (mapped to null) to avoid double-counting
  const series: Record<string, (number | null)[]> = {}
  for (const grp of FUEL_MIX_ORDER) {
    if (raw[grp] && Object.keys(raw[grp]).length > 0) {
      series[grp] = allDates.map(d => raw[grp][d] ?? null)
    }
  }
  return { dates: allDates, series }
}


export async function getEnergyData({ interval }: EnergyParams) {
  const facilities = await fetchGasFacilities()
  const regionData: Record<string, any> = {}

  for (const region of REGIONS) {
    const label       = region.replace('1', '')
    const rFacilities = facilities.filter(f => f.region === region)

    // Spot price — use API default range (max available)
    let prices: Record<string, number> = {}
    try {
      const priceResp = await apiFetch(`${BASE_URL}/market/network/NEM`, {
        metrics: 'price', network_region: region,
        interval, primary_grouping: 'network_region',
      })
      const firstSeries = Object.values(parseTimeseries(priceResp))[0] ?? []
      for (const [ts, v] of firstSeries) prices[toAEST(ts)] = v
    } catch (e) { console.warn(`Price fetch failed for ${region}:`, e) }

    // Generation — use API default range (max available)
    const facilitySeriesMap: { name: string; data: Record<string, number> }[] = []
    for (const f of rFacilities) {
      try {
        const genResp = await apiFetch(`${BASE_URL}/data/facilities/NEM`, {
          facility_code: f.code, metrics: 'power', interval,
        })
        const unitSeries = parseTimeseries(genResp)
        if (Object.keys(unitSeries).length > 0)
          facilitySeriesMap.push({ name: f.name, data: aggregateFacility(unitSeries, interval) })
      } catch (e) { console.warn(`Skipping ${f.code}:`, e) }
    }

    const allTimes = Array.from(new Set([
      ...Object.keys(prices),
      ...facilitySeriesMap.flatMap(f => Object.keys(f.data)),
    ])).sort()

    // Return ALL rows — client will filter by date range
    const rows = allTimes.map(ts => ({
      datetime: ts,
      price: prices[ts] ?? null,
      ...Object.fromEntries(facilitySeriesMap.map(f => [f.name, f.data[ts] ?? null])),
    }))

    const priceVals = Object.values(prices) as number[]
    const totalGenPerTime: Record<string, number> = {}
    for (const f of facilitySeriesMap)
      for (const [ts, v] of Object.entries(f.data))
        if (v !== null) totalGenPerTime[ts] = (totalGenPerTime[ts] ?? 0) + v
    const totalGenVals = Object.values(totalGenPerTime)

    const fuelMix = await fetchFuelMix(region, interval)

    regionData[label] = {
      facilities: facilitySeriesMap.map(f => f.name),
      rows,
      fuelMix,
      summary: {
        avgPrice:      priceVals.length ? priceVals.reduce((a, b) => a + b, 0) / priceVals.length : null,
        maxPrice:      priceVals.length ? Math.max(...priceVals) : null,
        minPrice:      priceVals.length ? Math.min(...priceVals) : null,
        avgTotalGen:   totalGenVals.length ? totalGenVals.reduce((a, b) => a + b, 0) / totalGenVals.length : null,
        peakTotalGen:  totalGenVals.length ? Math.max(...totalGenVals) : null,
        facilityCount: facilitySeriesMap.length,
      },
    }
  }

  return { ok: true, interval, data: regionData }
}
