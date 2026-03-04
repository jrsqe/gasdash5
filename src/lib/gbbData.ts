// ─── GBB data fetcher ────────────────────────────────────────────────────────
// Source: https://nemweb.com.au/Reports/Current/GBB/GasBBActualFlowStorage.zip
// Plain CSV (no AEMO I/D/C prefixes), header on row 0:
//   GasDate,FacilityName,FacilityId,FacilityType,Demand,Supply,TransferIn,
//   TransferOut,HeldInStorage,CushionGasStorage,State,LocationName,LocationId,LastUpdated
//
// Pipeline flow business rules: bb-pipeline-flow-and-capacity-business-rules.pdf

const GBB_ZIP_URL =
  'https://nemweb.com.au/Reports/Current/GBB/GasBBActualFlowStorage.zip'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface GbbRow {
  GasDate:           string
  FacilityName:      string
  FacilityId:        string
  FacilityType:      string   // BBGPG | PROD | STOR | PIPE | COMPRESSOR | BBLARGE | LNGEXPORT
  Demand:            number | null
  Supply:            number | null
  TransferIn:        number | null
  TransferOut:       number | null
  HeldInStorage:     number | null
  CushionGasStorage: number | null
  State:             string
  LocationName:      string
  LocationId:        string
}

export interface GbbTimeseries {
  dates:             string[]
  gpgByState:        Record<string, Record<string, number[]>>
  largeByState:      Record<string, Record<string, number[]>>
  prodByState:       Record<string, Record<string, number[]>>
  storageByFacility: Record<string, {
    state:         string
    heldInStorage: (number | null)[]
    supply:        (number | null)[]
    demand:        (number | null)[]
  }>
  pipelineFlows:     Record<string, { flow: number[]; direction: string; nameplateCapacity: number | null; stcCapacity: number | null }>
}

// ── Capacity URLs ─────────────────────────────────────────────────────────────
const NP_URL  = 'https://nemweb.com.au/Reports/Current/GBB/GasBBNameplateRatingCurrent.csv'
const STC_URL = 'https://nemweb.com.au/Reports/Current/GBB/GasBBShortTermCapacityOutlook.CSV'

// Node pairs (receipt→delivery) per pipeline shortName.
// For pipelines with multiple segments, we take min (bottleneck).
// Bidirectional pipelines list both directions; we take max flow direction capacity.
// For bidirectional pipes we tag each segment with which flow sign it applies to.
// 'any' = unidirectional (always use this segment).
// 'positive' = use when flow >= 0,  'negative' = use when flow < 0.
// For multi-segment unidirectional pipes we take min (bottleneck).
const PIPELINE_NODES: Record<string, { receipt: string; delivery: string; when?: 'positive'|'negative'|'any' }[]> = {
  'EGP':     [{ receipt: '1302000', delivery: '1202003' }],
  'MSP':     [{ receipt: '1502045', delivery: '1202052', when: 'positive' },
              { receipt: '1202038', delivery: '1502057', when: 'negative' }],
  'MAPS':    [{ receipt: '1505013', delivery: '1505035', when: 'positive' },
              { receipt: '1505035', delivery: '1505013', when: 'negative' }],
  'CGP':     [{ receipt: '1404227', delivery: '1404079' },
              { receipt: '1404225', delivery: '1404074' }],
  'SWQP':    [{ receipt: '1504232', delivery: '1404216', when: 'positive' },
              { receipt: '1404217', delivery: '1504233', when: 'negative' }],
  'QGP':     [{ receipt: '1404003', delivery: '1404009' }],
  'RBP':     [{ receipt: '1404107', delivery: '1404090' }],
  // VTS-LMP: always flows West (positive), single segment
  'VTS-LMP': [{ receipt: '1303000', delivery: '1303046' }],
  // VTS-SWP: positive = East (Otway→Wollert), negative = West (Wollert→Brooklyn)
  'VTS-SWP': [{ receipt: '1303008', delivery: '1303084', when: 'positive' },
              { receipt: '1303084', delivery: '1303007', when: 'negative' }],
  // VTS-VNI: positive = South (withdraw from Culcairn), negative = North (inject)
  'VTS-VNI': [{ receipt: '1303054', delivery: '1203004', when: 'positive' },
              { receipt: '1203003', delivery: '1303054', when: 'negative' }],
  'TGP':     [{ receipt: '1307000', delivery: '1707012' }],
  'PCA':     [{ receipt: '1305050', delivery: '1505088' }],
  'GLNG':    [{ receipt: '1404172', delivery: '1404160' }],
  'APLNG':   [{ receipt: '1404048', delivery: '1404050' }],
  'WGP':     [{ receipt: '1404143', delivery: '1404194' }],
}

// Maps pipeline shortName → exact FacilityName string in capacity CSVs
// (where shortName differs from the CSV facility name)
const CAPACITY_FAC_NAME: Record<string, string> = {
  'VTS-LMP':  'VTS',
  'VTS-SWP':  'VTS',
  'VTS-VNI':  'VTS',
  'GLNG':     'GLNG Pipeline',
  'APLNG':    'APLNG Pipeline',
}

async function fetchCapacities(mostRecentGasDate: string, latestSignedFlows: Record<string, number | null>): Promise<{
  nameplate: Record<string, number | null>
  stc:       Record<string, number | null>
}> {
  const nameplate: Record<string, number | null> = {}
  const stc:       Record<string, number | null> = {}

  // Helper: parse CSV text into array-of-objects, handling quoted fields
  function parseFlatCsv(text: string) {
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return { rows: [], col: (_n: string) => -1 }

    function splitCsvLine(line: string): string[] {
      const result: string[] = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++ }
          else inQ = !inQ
        } else if (ch === ',' && !inQ) {
          result.push(cur.trim()); cur = ''
        } else {
          cur += ch
        }
      }
      result.push(cur.trim())
      return result
    }

    const headers = splitCsvLine(lines[0])
    const col = (name: string) => {
      const lo = name.toLowerCase()
      return headers.findIndex(h => h.toLowerCase() === lo)
    }
    const rows = lines.slice(1).map(l => splitCsvLine(l))
    return { rows, col }
  }

  try {
    // ── Nameplate ratings ──────────────────────────────────────────────────
    // Columns: facilityname, facilitytype, capacitytype, receiptlocation,
    //          deliverylocation, flowdirection, capacityquantity
    const npRes  = await fetch(NP_URL, { cache: 'no-store' })
    const npText = await npRes.text()
    const { rows: npRows, col: npCol } = parseFlatCsv(npText)

    const iNpFac  = npCol('facilityname')
    const iNpType = npCol('facilitytype')
    const iNpCt   = npCol('capacitytype')
    const iNpRec  = npCol('receiptlocation')
    const iNpDel  = npCol('deliverylocation')
    const iNpCap  = npCol('capacityquantity')

    // Filter to PIPE, MDQ rows only
    const npPipe = npRows.filter(r =>
      r[iNpType]?.toUpperCase() === 'PIPE' &&
      r[iNpCt]?.toUpperCase()   === 'MDQ'
    )

    for (const [pipe, pairs] of Object.entries(PIPELINE_NODES)) {
      const facName   = CAPACITY_FAC_NAME[pipe] ?? pipe
      const flowVal   = latestSignedFlows[pipe] ?? null
      // Filter pairs by direction: 'positive'/'negative' only when we know flow direction
      const activePairs = pairs.filter(p => {
        if (!p.when || p.when === 'any') return true
        if (flowVal === null) return true // include all if no flow data
        return p.when === 'positive' ? flowVal >= 0 : flowVal < 0
      })
      const caps = activePairs.map(({ receipt, delivery }) => {
        const row = npPipe.find(r =>
          r[iNpFac]?.toUpperCase() === facName.toUpperCase() &&
          String(r[iNpRec]).trim() === receipt &&
          String(r[iNpDel]).trim() === delivery
        )
        return row ? parseFloat(row[iNpCap]) : null
      }).filter((v): v is number => v !== null && !isNaN(v) && v > 0)
      nameplate[pipe] = caps.length > 0 ? Math.min(...caps) : null
    }
  } catch (e) {
    console.error('Nameplate fetch error:', e)
  }

  try {
    // ── Short-term capacity outlook ────────────────────────────────────────
    // Columns: FacilityId, FacilityName, CapacityType, FlowDirection,
    //          GasDate (YYYY/MM/DD), OutlookQuantity, ReceiptLocation, DeliveryLocation
    // We want the row matching the most recent GBB gas date (same date as flow data)
    const stcRes  = await fetch(STC_URL, { cache: 'no-store' })
    const stcText = await stcRes.text()
    const { rows: stcRows, col: stcCol } = parseFlatCsv(stcText)

    const iStcFac  = stcCol('FacilityName')
    const iStcCt   = stcCol('CapacityType')
    const iStcDate = stcCol('GasDate')
    const iStcRec  = stcCol('ReceiptLocation')
    const iStcDel  = stcCol('DeliveryLocation')
    const iStcCap  = stcCol('OutlookQuantity')

    // Most recent GBB gas date is YYYY-MM-DD — convert to YYYY/MM/DD for STC match
    const targetDate = mostRecentGasDate.replace(/-/g, '/')

    // Filter to MDQ rows for the target date
    const stcMdq = stcRows.filter(r =>
      r[iStcCt]?.toUpperCase()   === 'MDQ' &&
      r[iStcDate]?.trim()        === targetDate
    )

    for (const [pipe, pairs] of Object.entries(PIPELINE_NODES)) {
      const facName   = CAPACITY_FAC_NAME[pipe] ?? pipe
      const flowVal   = latestSignedFlows[pipe] ?? null
      const activePairs = pairs.filter(p => {
        if (!p.when || p.when === 'any') return true
        if (flowVal === null) return true
        return p.when === 'positive' ? flowVal >= 0 : flowVal < 0
      })
      const caps = activePairs.map(({ receipt, delivery }) => {
        const row = stcMdq.find(r =>
          r[iStcFac]?.toUpperCase() === facName.toUpperCase() &&
          String(r[iStcRec]).trim() === receipt &&
          String(r[iStcDel]).trim() === delivery
        )
        return row ? parseFloat(row[iStcCap]) : null
      }).filter((v): v is number => v !== null && !isNaN(v) && v > 0)
      stc[pipe] = caps.length > 0 ? Math.min(...caps) : null
    }
  } catch (e) {
    console.error('STC fetch error:', e)
  }

  return { nameplate, stc }
}

// ── Fetch + unzip ─────────────────────────────────────────────────────────────
async function fetchCsvText(): Promise<string> {
  const res = await fetch(GBB_ZIP_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GBB ZIP fetch failed: ${res.status}`)

  const zipBuf = Buffer.from(await res.arrayBuffer())

  // Scan for ZIP local file header (0x04034b50)
  for (let offset = 0; offset < zipBuf.length - 30; offset++) {
    if (zipBuf.readUInt32LE(offset) !== 0x04034b50) continue

    const compression    = zipBuf.readUInt16LE(offset + 8)
    const compressedSize = zipBuf.readUInt32LE(offset + 18)
    const fnameLen       = zipBuf.readUInt16LE(offset + 26)
    const extraLen       = zipBuf.readUInt16LE(offset + 28)
    const dataStart      = offset + 30 + fnameLen + extraLen
    const compData       = zipBuf.slice(dataStart, dataStart + compressedSize)

    if (compression === 0) return compData.toString('latin1')
    if (compression === 8) {
      const { inflateRawSync } = await import('zlib')
      return inflateRawSync(compData).toString('latin1')
    }
    throw new Error(`Unsupported ZIP compression method: ${compression}`)
  }
  throw new Error('No ZIP local file header found')
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseNum(s: string): number | null {
  const t = s.trim()
  if (!t || t === 'NULL') return null
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

function parseDate(s: string): string {
  // "2024/03/01" → "2024-03-01"
  return s.trim().slice(0, 10).replace(/\//g, '-')
}

function parseCsv(text: string): GbbRow[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  // Row 0 is the plain header — no I/D/C prefixes
  const cols = lines[0].split(',').map(c => c.trim())
  const idx  = (name: string) => cols.indexOf(name)

  const iDate    = idx('GasDate')
  const iName    = idx('FacilityName')
  const iId      = idx('FacilityId')
  const iType    = idx('FacilityType')
  const iDemand  = idx('Demand')
  const iSupply  = idx('Supply')
  const iTxIn    = idx('TransferIn')
  const iTxOut   = idx('TransferOut')
  const iStorage = idx('HeldInStorage')
  const iCushion = idx('CushionGasStorage')
  const iState   = idx('State')
  const iLocName = idx('LocationName')
  const iLocId   = idx('LocationId')

  const rows: GbbRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const p = line.split(',')
    if (p.length < 11) continue

    const gasDate = parseDate(p[iDate] ?? '')
    if (gasDate.length < 10) continue

    rows.push({
      GasDate:           gasDate,
      FacilityName:      (p[iName]  ?? '').trim(),
      FacilityId:        (p[iId]    ?? '').trim(),
      FacilityType:      (p[iType]  ?? '').trim(),
      Demand:            parseNum(p[iDemand]  ?? ''),
      Supply:            parseNum(p[iSupply]  ?? ''),
      TransferIn:        parseNum(p[iTxIn]    ?? ''),
      TransferOut:       parseNum(p[iTxOut]   ?? ''),
      HeldInStorage:     parseNum(p[iStorage] ?? ''),
      CushionGasStorage: parseNum(p[iCushion] ?? ''),
      State:             (p[iState]   ?? '').trim(),
      LocationName:      (p[iLocName] ?? '').trim(),
      LocationId:        (p[iLocId]   ?? '').trim(),
    })
  }
  return rows
}

// ── Pipeline flow calculations (per AEMO business rules PDF) ──────────────────
// For each pipeline: (Supply + TransferIn) - (Demand + TransferOut) at the
// specified location. Returns signed value; direction label derived from sign.

interface PipelineRule {
  shortName:    string
  facilityName: string   // substring match on FacilityName
  locationName: string   // substring match on LocationName
  // For QGP and RBP the calc is different (total demand, not net flow)
  useTotalDemand?: boolean
  directionFn: (signed: number) => string
}

const PIPELINE_RULES: PipelineRule[] = [
  { shortName: 'EGP',     facilityName: 'EGP',                          locationName: 'Longford',    directionFn: () => 'North' },
  { shortName: 'MSP',     facilityName: 'MSP',                          locationName: 'Moomba',      directionFn: v => v >= 0 ? 'South' : 'North' },
  { shortName: 'MAPS',    facilityName: 'MAPS',                         locationName: 'Moomba',      directionFn: () => 'South' },
  { shortName: 'CGP',     facilityName: 'CGP',                          locationName: 'Ballera',     directionFn: v => v >= 0 ? 'North' : 'South' },
  { shortName: 'SWQP',    facilityName: 'SWQP',                         locationName: 'Wallumbilla', directionFn: v => v >= 0 ? 'West' : 'East' },
  { shortName: 'QGP',     facilityName: 'QGP',                          locationName: '',            useTotalDemand: true, directionFn: () => 'North' },
  { shortName: 'RBP',     facilityName: 'RBP',                          locationName: 'Brisbane',    useTotalDemand: true, directionFn: () => 'East' },
  { shortName: 'VTS-LMP', facilityName: 'VTS', locationName: 'Longford Hub', directionFn: () => 'West' },
  { shortName: 'VTS-SWP', facilityName: 'VTS', locationName: 'Iona Hub',     directionFn: v => v >= 0 ? 'East' : 'West' },
  { shortName: 'VTS-VNI', facilityName: 'VTS', locationName: 'Culcairn',     directionFn: v => v >= 0 ? 'South' : 'North' },
  { shortName: 'TGP',     facilityName: 'TGP',                          locationName: 'Longford',    directionFn: () => 'South' },
  { shortName: 'PCA',     facilityName: 'PCA',                          locationName: 'Iona',        directionFn: () => 'West' },
  // LNG export pipelines — flow = Demand at Curtis Island
  { shortName: 'GLNG',    facilityName: 'GLNG Pipeline',                locationName: 'Curtis Island', useTotalDemand: true, directionFn: () => 'North' },
  { shortName: 'APLNG',   facilityName: 'APLNG Pipeline',               locationName: 'Curtis Island', useTotalDemand: true, directionFn: () => 'North' },
  { shortName: 'WGP',     facilityName: 'WGP',                          locationName: 'Curtis Island', useTotalDemand: true, directionFn: () => 'North' },
]

function calcPipelineFlow(rows: GbbRow[], rule: PipelineRule): number {
  const nameUpper = rule.facilityName.toUpperCase()
  const locUpper  = rule.locationName.toUpperCase()

  const matching = rows.filter(r => {
    const nameMatch = r.FacilityName.toUpperCase() === nameUpper
    const locMatch  = !locUpper || r.LocationName.toUpperCase().includes(locUpper)
    return nameMatch && locMatch
  })

  if (matching.length === 0) return 0

  if (rule.useTotalDemand) {
    return matching.reduce((s, r) => s + (r.Demand ?? 0), 0)
  }

  return matching.reduce((s, r) =>
    s + (r.Supply ?? 0) + (r.TransferIn ?? 0) - (r.Demand ?? 0) - (r.TransferOut ?? 0), 0
  )
}

// ── Build timeseries ──────────────────────────────────────────────────────────
export async function getGbbData(): Promise<GbbTimeseries> {
  const csvText = await fetchCsvText()
  const allRows = parseCsv(csvText)

  if (allRows.length === 0) throw new Error('GBB CSV parsed 0 rows')

  // Only keep the last 31 days to match the dashboard window
  const allDates    = Array.from(new Set(allRows.map(r => r.GasDate))).sort()
  const recentDates = allDates.slice(-365)
  const mostRecentGasDate = recentDates[recentDates.length - 1] // YYYY-MM-DD
  const rows = allRows.filter(r => recentDates.includes(r.GasDate))

  // Helper: get or create array
  const ensureArr = (obj: Record<string, any>, key: string, len: number) => {
    if (!obj[key]) obj[key] = new Array(len).fill(null)
    return obj[key] as (number | null)[]
  }

  // ── GPG demand: BBGPG, NSW + VIC ──
  const gpgByState: GbbTimeseries['gpgByState'] = {}
  for (const row of rows.filter(r => r.FacilityType === 'BBGPG' && ['NSW', 'VIC'].includes(r.State))) {
    if (!gpgByState[row.State]) gpgByState[row.State] = {}
    const arr = ensureArr(gpgByState[row.State], row.FacilityName, recentDates.length)
    const i   = recentDates.indexOf(row.GasDate)
    if (i >= 0) arr[i] = (arr[i] ?? 0) + (row.Demand ?? 0)
  }

  // ── Large industry demand: BBLARGE, NSW + VIC ──
  const largeByState: GbbTimeseries['largeByState'] = {}
  for (const row of rows.filter(r => r.FacilityType === 'BBLARGE' && ['NSW', 'VIC'].includes(r.State))) {
    if (!largeByState[row.State]) largeByState[row.State] = {}
    const arr = ensureArr(largeByState[row.State], row.FacilityName, recentDates.length)
    const i   = recentDates.indexOf(row.GasDate)
    if (i >= 0) arr[i] = (arr[i] ?? 0) + (row.Demand ?? 0)
  }

  // ── Production: PROD, NSW + VIC + SA + QLD ──
  const prodByState: GbbTimeseries['prodByState'] = {}
  for (const row of rows.filter(r => r.FacilityType === 'PROD' && ['NSW', 'VIC', 'SA', 'QLD'].includes(r.State))) {
    if (!prodByState[row.State]) prodByState[row.State] = {}
    const arr = ensureArr(prodByState[row.State], row.FacilityName, recentDates.length)
    const i   = recentDates.indexOf(row.GasDate)
    if (i >= 0) arr[i] = (arr[i] ?? 0) + (row.Supply ?? 0)
  }

  // ── Storage: STOR, NSW + VIC + SA ──
  const storageByFacility: GbbTimeseries['storageByFacility'] = {}
  for (const row of rows.filter(r => r.FacilityType === 'STOR' && ['NSW', 'VIC', 'SA'].includes(r.State))) {
    if (!storageByFacility[row.FacilityName]) {
      storageByFacility[row.FacilityName] = {
        state:         row.State,
        heldInStorage: new Array(recentDates.length).fill(null),
        supply:        new Array(recentDates.length).fill(null),
        demand:        new Array(recentDates.length).fill(null),
      }
    }
    const i = recentDates.indexOf(row.GasDate)
    if (i < 0) continue
    const f = storageByFacility[row.FacilityName]
    if (row.HeldInStorage != null) f.heldInStorage[i] = row.HeldInStorage
    // A facility may have multiple location rows — accumulate supply/demand
    f.supply[i] = (f.supply[i] ?? 0) + (row.Supply ?? 0)
    f.demand[i] = (f.demand[i] ?? 0) + (row.Demand ?? 0)
  }

  // ── Pipeline flows: group rows by date then apply rules ──
  const byDate = new Map<string, GbbRow[]>()
  for (const row of rows.filter(r => r.FacilityType === 'PIPE')) {
    const arr = byDate.get(row.GasDate) ?? []
    arr.push(row)
    byDate.set(row.GasDate, arr)
  }

  const pipelineFlows: GbbTimeseries['pipelineFlows'] = {}
  for (const [date, dateRows] of Array.from(byDate.entries())) {
    const i = recentDates.indexOf(date)
    if (i < 0) continue
    for (const rule of PIPELINE_RULES) {
      const signed = calcPipelineFlow(dateRows, rule)
      if (!pipelineFlows[rule.shortName]) {
        pipelineFlows[rule.shortName] = {
          flow:              new Array(recentDates.length).fill(null),
          direction:         rule.directionFn(signed),
          nameplateCapacity: null,
          stcCapacity:       null,
        }
      }
      pipelineFlows[rule.shortName].flow[i] = Math.abs(signed)
      // Update direction label based on latest sign
      pipelineFlows[rule.shortName].direction = rule.directionFn(signed)
    }
  }

  // Attach capacity data to each pipeline entry.
  // We need the SIGNED latest flow (not abs) to determine direction for
  // bidirectional pipelines (VTS-SWP, VTS-VNI, MSP, etc.)
  // Re-derive signed values from the raw data for the most recent date.
  const latestSignedFlows: Record<string, number | null> = {}
  if (recentDates.length > 0) {
    // Walk dates from most recent backwards until we find a date with data
    for (let di = recentDates.length - 1; di >= 0; di--) {
      const d = recentDates[di]
      const dateRows = byDate.get(d)
      if (!dateRows) continue
      let anyFound = false
      for (const rule of PIPELINE_RULES) {
        if (latestSignedFlows[rule.shortName] !== undefined) continue
        const signed = calcPipelineFlow(dateRows, rule)
        if (signed !== 0 || dateRows.length > 0) {
          latestSignedFlows[rule.shortName] = signed
          anyFound = true
        }
      }
      if (anyFound && Object.keys(latestSignedFlows).length >= PIPELINE_RULES.length) break
    }
  }
  console.log('[gbbData] latestSignedFlows:', JSON.stringify(latestSignedFlows))
  const capacities = await fetchCapacities(mostRecentGasDate, latestSignedFlows)
  console.log('[gbbData] nameplate capacities:', JSON.stringify(capacities.nameplate))
  console.log('[gbbData] stc capacities:', JSON.stringify(capacities.stc))
  for (const pipe of Object.keys(pipelineFlows)) {
    pipelineFlows[pipe].nameplateCapacity = capacities.nameplate[pipe] ?? null
    pipelineFlows[pipe].stcCapacity       = capacities.stc[pipe]       ?? null
  }
  // Log VTS entries specifically for debugging
  for (const p of ['VTS-LMP','VTS-SWP','VTS-VNI']) {
    if (pipelineFlows[p]) {
      console.log(`[gbbData] ${p}: np=${pipelineFlows[p].nameplateCapacity} stc=${pipelineFlows[p].stcCapacity} flow=${pipelineFlows[p].flow.slice(-1)[0]}`)
    }
  }

  return {
    dates:             recentDates,
    gpgByState,
    largeByState,
    prodByState,
    storageByFacility,
    pipelineFlows,
  }
}
