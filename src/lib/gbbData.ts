// ─── GBB data fetcher ────────────────────────────────────────────────────────
// Fetches GasBBActualFlowStorage.zip from AEMO NEMWeb (public, no auth),
// unzips server-side using Node's built-in zlib, parses the CSV inside.
//
// Pipeline flow business rules per:
// bb-pipeline-flow-and-capacity-business-rules.pdf (AEMO 2019)

const GBB_ZIP_URL =
  'https://nemweb.com.au/Reports/Current/GBB/GasBBActualFlowStorage.zip'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GbbRow {
  GasDate:          string   // "YYYY-MM-DD"
  FacilityId:       string
  FacilityName:     string
  FacilityType:     string   // BBGPG | PROD | STOR | PIPE | COMPRESSOR | ...
  State:            string   // NSW | VIC | SA | QLD | TAS
  LocationId:       string
  LocationName:     string
  Demand:           number | null
  Supply:           number | null
  TransferIn:       number | null
  TransferOut:      number | null
  HeldInStorage:    number | null
  CushionGasStorage:number | null
}

export interface GpgDailyRow {
  GasDate:      string
  State:        string
  FacilityName: string
  Demand:       number   // TJ/day GPG demand
}

export interface ProductionRow {
  GasDate:      string
  State:        string
  FacilityName: string
  Supply:       number   // TJ/day
}

export interface StorageRow {
  GasDate:        string
  State:          string
  FacilityName:   string
  HeldInStorage:  number | null   // TJ
  CushionGas:     number | null   // TJ
  Supply:         number | null   // withdrawals (TJ)
  Demand:         number | null   // injections (TJ)
}

export interface PipelineFlowRow {
  GasDate:   string
  Pipeline:  string   // short name e.g. "EGP"
  Flow:      number   // TJ/day, always positive per business rules
  Direction: string   // e.g. "North", "South → North"
}

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseNum(s: string | undefined): number | null {
  if (!s || s.trim() === '' || s.trim() === 'NULL') return null
  const n = parseFloat(s.trim())
  return isNaN(n) ? null : n
}

function fmtDate(raw: string): string {
  // Input is typically "2024/03/01" or "2024-03-01 00:00:00" or ISO
  return raw.trim().slice(0, 10).replace(/\//g, '-')
}

async function fetchGbbCsv(): Promise<GbbRow[]> {
  // Fetch zip as binary
  const res = await fetch(GBB_ZIP_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GBB ZIP fetch failed: ${res.status}`)
  const arrayBuf = await res.arrayBuffer()
  const zipBuf   = Buffer.from(arrayBuf)

  // Parse zip manually: extract first file entry: find the first local file entry and decompress it
  // ZIP local file header magic: 0x04034b50
  let csvText = ''
  let offset = 0
  while (offset < zipBuf.length - 4) {
    const sig = zipBuf.readUInt32LE(offset)
    if (sig !== 0x04034b50) { offset++; continue }
    // Local file header layout:
    // 4 sig, 2 version, 2 flags, 2 compression, 2 mod time, 2 mod date
    // 4 crc, 4 compressed size, 4 uncompressed size, 2 fname len, 2 extra len
    const compression    = zipBuf.readUInt16LE(offset + 8)
    const compressedSize = zipBuf.readUInt32LE(offset + 18)
    const fnameLen       = zipBuf.readUInt16LE(offset + 26)
    const extraLen       = zipBuf.readUInt16LE(offset + 28)
    const dataOffset     = offset + 30 + fnameLen + extraLen
    const compressedData = zipBuf.slice(dataOffset, dataOffset + compressedSize)

    if (compression === 0) {
      // Stored (no compression)
      csvText = compressedData.toString('latin1')
    } else if (compression === 8) {
      // Deflated
      const { inflateRawSync } = await import('zlib')
      csvText = inflateRawSync(compressedData).toString('latin1')
    }
    break
  }

  if (!csvText) throw new Error('Could not extract CSV from GBB zip')
  const text = csvText

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // AEMO CSV format: first line is a header like
  // "I,GBB_ACTUAL_FLOW_STORAGE,...\nD,...fields..."
  // Find the "D" (data) header row to get column names, then parse data rows
  let headerIdx = -1
  const cols: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts[0] === 'I') {
      // Next non-comment line starting with D is the column header
      headerIdx = i
    }
    if (parts[0] === 'D' && headerIdx >= 0 && cols.length === 0) {
      // This is the column name row
      cols.push(...parts.slice(1).map(c => c.trim()))
      headerIdx = i
      continue
    }
  }

  // If we couldn't find AEMO-style header, assume first line is CSV header
  if (cols.length === 0) {
    const firstLine = lines[0].replace(/^[A-Z],/, '')
    cols.push(...firstLine.split(',').map(c => c.trim()))
  }

  const idx = (name: string) => cols.indexOf(name)

  const rows: GbbRow[] = []
  let inData = false

  for (const line of lines) {
    const parts = line.split(',')
    // AEMO data lines start with "D"
    if (parts[0] === 'I') { inData = false; continue }
    if (parts[0] === 'D' && !inData) { inData = true; continue } // header row
    if (!inData && parts[0] !== 'D') continue
    if (parts[0] === 'C') continue // comment/footer rows

    const data = parts.slice(1)

    const get = (name: string) => data[idx(name)]?.trim() ?? ''

    const gasDate = fmtDate(get('GasDate') || get('GASDATE') || get('Gas_Date') || data[0])
    if (!gasDate || gasDate.length < 10) continue

    rows.push({
      GasDate:           gasDate,
      FacilityId:        get('FacilityId') || get('FACILITYID'),
      FacilityName:      get('FacilityName') || get('FACILITYNAME'),
      FacilityType:      get('FacilityType') || get('FACILITYTYPE'),
      State:             get('State') || get('STATE'),
      LocationId:        get('LocationId') || get('LOCATIONID'),
      LocationName:      get('LocationName') || get('LOCATIONNAME'),
      Demand:            parseNum(get('Demand') || get('DEMAND')),
      Supply:            parseNum(get('Supply') || get('SUPPLY')),
      TransferIn:        parseNum(get('TransferIn') || get('TRANSFERIN')),
      TransferOut:       parseNum(get('TransferOut') || get('TRANSFEROUT')),
      HeldInStorage:     parseNum(get('HeldInStorage') || get('HELDINSTORAGE')),
      CushionGasStorage: parseNum(get('CushionGasStorage') || get('CUSHIONGASSTORAGE')),
    })
  }

  return rows
}

// ── GPG demand: filter BBGPG, states NSW+VIC ─────────────────────────────────

function extractGpgDemand(rows: GbbRow[]): GpgDailyRow[] {
  return rows
    .filter(r => r.FacilityType === 'BBGPG' && ['NSW', 'VIC'].includes(r.State))
    .map(r => ({
      GasDate:      r.GasDate,
      State:        r.State,
      FacilityName: r.FacilityName,
      Demand:       r.Demand ?? 0,
    }))
}

// ── Production: PROD facilities, states NSW+VIC+SA+QLD ───────────────────────

function extractProduction(rows: GbbRow[]): ProductionRow[] {
  return rows
    .filter(r => r.FacilityType === 'PROD' && ['NSW', 'VIC', 'SA', 'QLD'].includes(r.State))
    .map(r => ({
      GasDate:      r.GasDate,
      State:        r.State,
      FacilityName: r.FacilityName,
      Supply:       r.Supply ?? 0,
    }))
}

// ── Storage: STOR facilities, states NSW+VIC+SA ───────────────────────────────

function extractStorage(rows: GbbRow[]): StorageRow[] {
  return rows
    .filter(r => r.FacilityType === 'STOR' && ['NSW', 'VIC', 'SA'].includes(r.State))
    .map(r => ({
      GasDate:       r.GasDate,
      State:         r.State,
      FacilityName:  r.FacilityName,
      HeldInStorage: r.HeldInStorage,
      CushionGas:    r.CushionGasStorage,
      Supply:        r.Supply,    // withdrawals
      Demand:        r.Demand,    // injections
    }))
}

// ── Pipeline flows per business rules ────────────────────────────────────────
// Rules: for each pipeline look at specific location + calculation
// then derive a flow value (positive) and direction label.

interface PipelineRule {
  shortName: string
  locationName: string   // match against LocationName in CSV
  facilityName: string   // match against FacilityName
  calcFn: (rows: GbbRow[]) => number  // returns signed value; we show abs + derive direction
  directionFn: (val: number) => string
}

// Convenience: find rows at a location and sum a field
function locSum(
  rows: GbbRow[],
  facilityName: string,
  locationName: string,
  field: keyof GbbRow
): number {
  return rows
    .filter(r =>
      r.FacilityName.toUpperCase().includes(facilityName.toUpperCase()) &&
      r.LocationName.toUpperCase().includes(locationName.toUpperCase())
    )
    .reduce((s, r) => s + ((r[field] as number | null) ?? 0), 0)
}

function calcFlow(rows: GbbRow[], facilityName: string, locationName: string): number {
  const r = rows.find(r =>
    r.FacilityName.toUpperCase().includes(facilityName.toUpperCase()) &&
    r.LocationName.toUpperCase().includes(locationName.toUpperCase())
  )
  if (!r) return 0
  return ((r.Supply ?? 0) + (r.TransferIn ?? 0)) - ((r.Demand ?? 0) + (r.TransferOut ?? 0))
}

const PIPELINE_RULES: PipelineRule[] = [
  {
    shortName: 'EGP',
    facilityName: 'Eastern Gas Pipeline',
    locationName: 'Longford',
    calcFn: (rows) => calcFlow(rows, 'Eastern Gas Pipeline', 'Longford'),
    directionFn: () => 'North',
  },
  {
    shortName: 'MSP',
    facilityName: 'Moomba to Sydney Pipeline',
    locationName: 'Moomba',
    calcFn: (rows) => calcFlow(rows, 'Moomba to Sydney Pipeline', 'Moomba'),
    directionFn: (v) => v >= 0 ? 'South' : 'North',
  },
  {
    shortName: 'MAPS',
    facilityName: 'Moomba to Adelaide Pipeline',
    locationName: 'Moomba',
    calcFn: (rows) => calcFlow(rows, 'Moomba to Adelaide Pipeline', 'Moomba'),
    directionFn: () => 'South',
  },
  {
    shortName: 'CGP',
    facilityName: 'Carpentaria Gas Pipeline',
    locationName: 'Ballera',
    calcFn: (rows) => calcFlow(rows, 'Carpentaria', 'Ballera'),
    directionFn: (v) => v >= 0 ? 'North' : 'South',
  },
  {
    shortName: 'SWQP',
    facilityName: 'South West Queensland Pipeline',
    locationName: 'Wallumbilla',
    calcFn: (rows) => calcFlow(rows, 'South West Queensland Pipeline', 'Wallumbilla'),
    directionFn: (v) => v >= 0 ? 'West' : 'East',
  },
  {
    shortName: 'QGP',
    facilityName: 'Queensland Gas Pipeline',
    locationName: 'Wallumbilla',
    calcFn: (rows) => {
      // Total demand on QGP
      return rows
        .filter(r => r.FacilityName.toUpperCase().includes('QUEENSLAND GAS PIPELINE'))
        .reduce((s, r) => s + (r.Demand ?? 0), 0)
    },
    directionFn: () => 'North',
  },
  {
    shortName: 'RBP',
    facilityName: 'Roma Brisbane Pipeline',
    locationName: 'Brisbane',
    calcFn: (rows) => {
      const r = rows.find(r =>
        r.FacilityName.toUpperCase().includes('ROMA') &&
        r.FacilityName.toUpperCase().includes('BRISBANE') &&
        r.LocationName.toUpperCase().includes('BRISBANE')
      )
      return r ? (r.Demand ?? 0) : 0
    },
    directionFn: () => 'East',
  },
  {
    shortName: 'VTS-LMP',
    facilityName: 'Victorian Transmission System',
    locationName: 'Longford',
    calcFn: (rows) => calcFlow(rows, 'Victorian Transmission System', 'Longford'),
    directionFn: () => 'West',
  },
  {
    shortName: 'VTS-SWP',
    facilityName: 'Victorian Transmission System',
    locationName: 'Iona',
    calcFn: (rows) => calcFlow(rows, 'Victorian Transmission System', 'Iona'),
    directionFn: (v) => v >= 0 ? 'East' : 'West',
  },
  {
    shortName: 'VTS-VNI',
    facilityName: 'Victorian Transmission System',
    locationName: 'Culcairn',
    calcFn: (rows) => calcFlow(rows, 'Victorian Transmission System', 'Culcairn'),
    directionFn: (v) => v >= 0 ? 'South' : 'North',
  },
  {
    shortName: 'TGP',
    facilityName: 'Tasmania Gas Pipeline',
    locationName: 'Longford',
    calcFn: (rows) => calcFlow(rows, 'Tasmania Gas Pipeline', 'Longford'),
    directionFn: () => 'South',
  },
  {
    shortName: 'PCA',
    facilityName: 'Port Campbell to Adelaide',
    locationName: 'Iona',
    calcFn: (rows) => calcFlow(rows, 'Port Campbell', 'Iona'),
    directionFn: () => 'West',
  },
]

function extractPipelineFlows(allRows: GbbRow[]): PipelineFlowRow[] {
  // Group rows by GasDate first
  const byDate = new Map<string, GbbRow[]>()
  for (const r of allRows) {
    const existing = byDate.get(r.GasDate) ?? []
    existing.push(r)
    byDate.set(r.GasDate, existing)
  }

  const result: PipelineFlowRow[] = []
  for (const [date, rows] of byDate.entries()) {
    for (const rule of PIPELINE_RULES) {
      const signed = rule.calcFn(rows)
      if (signed === 0 && !rows.some(r => r.FacilityName.toUpperCase().includes(rule.facilityName.toUpperCase()))) continue
      result.push({
        GasDate:   date,
        Pipeline:  rule.shortName,
        Flow:      Math.abs(signed),
        Direction: rule.directionFn(signed),
      })
    }
  }
  return result.sort((a, b) => a.GasDate.localeCompare(b.GasDate))
}

// ── Aggregate into timeseries by date ────────────────────────────────────────

export interface GbbTimeseries {
  dates:        string[]
  // GPG demand: { NSW: { [facilityName]: number[] }, VIC: {...} }
  gpgByState:   Record<string, Record<string, number[]>>
  // Production: { NSW/VIC/SA/QLD: { [facilityName]: number[] } }
  prodByState:  Record<string, Record<string, number[]>>
  // Storage: { [facilityName]: { heldInStorage, supply, demand }[] }
  storageByFacility: Record<string, { state: string; heldInStorage: (number|null)[]; supply: (number|null)[]; demand: (number|null)[] }>
  // Pipeline: { [shortName]: { flow: number[], direction: string } }
  pipelineFlows: Record<string, { flow: number[]; direction: string }>
}

export async function getGbbData(): Promise<GbbTimeseries> {
  const allRows = await fetchGbbCsv()

  const gpgRows   = extractGpgDemand(allRows)
  const prodRows  = extractProduction(allRows)
  const storRows  = extractStorage(allRows)
  const pipeRows  = extractPipelineFlows(allRows)

  // Collect all dates
  const allDates = Array.from(new Set(allRows.map(r => r.GasDate))).sort()

  // GPG by state → facility
  const gpgByState: Record<string, Record<string, number[]>> = {}
  for (const d of allDates) {
    for (const row of gpgRows.filter(r => r.GasDate === d)) {
      if (!gpgByState[row.State]) gpgByState[row.State] = {}
      if (!gpgByState[row.State][row.FacilityName]) {
        gpgByState[row.State][row.FacilityName] = new Array(allDates.length).fill(null)
      }
      gpgByState[row.State][row.FacilityName][allDates.indexOf(d)] = row.Demand
    }
  }

  // Production by state → facility
  const prodByState: Record<string, Record<string, number[]>> = {}
  for (const d of allDates) {
    for (const row of prodRows.filter(r => r.GasDate === d)) {
      if (!prodByState[row.State]) prodByState[row.State] = {}
      if (!prodByState[row.State][row.FacilityName]) {
        prodByState[row.State][row.FacilityName] = new Array(allDates.length).fill(null)
      }
      prodByState[row.State][row.FacilityName][allDates.indexOf(d)] = row.Supply
    }
  }

  // Storage by facility
  const storageByFacility: GbbTimeseries['storageByFacility'] = {}
  for (const d of allDates) {
    for (const row of storRows.filter(r => r.GasDate === d)) {
      if (!storageByFacility[row.FacilityName]) {
        storageByFacility[row.FacilityName] = {
          state:         row.State,
          heldInStorage: new Array(allDates.length).fill(null),
          supply:        new Array(allDates.length).fill(null),
          demand:        new Array(allDates.length).fill(null),
        }
      }
      const i = allDates.indexOf(d)
      storageByFacility[row.FacilityName].heldInStorage[i] = row.HeldInStorage
      storageByFacility[row.FacilityName].supply[i]        = row.Supply
      storageByFacility[row.FacilityName].demand[i]        = row.Demand
    }
  }

  // Pipeline flows
  const pipelineFlows: GbbTimeseries['pipelineFlows'] = {}
  for (const row of pipeRows) {
    if (!pipelineFlows[row.Pipeline]) {
      pipelineFlows[row.Pipeline] = {
        flow:      new Array(allDates.length).fill(null),
        direction: row.Direction,
      }
    }
    const i = allDates.indexOf(row.GasDate)
    if (i >= 0) pipelineFlows[row.Pipeline].flow[i] = row.Flow
  }

  return { dates: allDates, gpgByState, prodByState, storageByFacility, pipelineFlows }
}
