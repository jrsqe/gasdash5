// NEM gas and coal generator station names as used in NEOpoint
// These are the station names used in the "Station Bids at Actual Prices 5min" report
// instances=GEN;<StationName>
// Sourced from AEMO generator information + NEOpoint station list

export type FuelType = 'gas_ccgt' | 'gas_ocgt' | 'gas_steam' | 'coal_black' | 'coal_brown'
export type NemRegion = 'NSW1' | 'VIC1' | 'QLD1' | 'SA1'

export interface NemStation {
  name:     string      // NEOpoint station name
  region:   NemRegion
  fuel:     FuelType
  cap_mw:   number      // approximate registered capacity
  owner?:   string
}

// ── Gas stations ──────────────────────────────────────────────────────────────

export const GAS_STATIONS: NemStation[] = [
  // NSW
  { name: 'Colongra Power Station',    region: 'NSW1', fuel: 'gas_ocgt',  cap_mw: 667,  owner: 'Origin' },
  { name: 'Tallawarra Power Station',  region: 'NSW1', fuel: 'gas_ccgt',  cap_mw: 435,  owner: 'EnergyAustralia' },
  { name: 'Uranquinty Power Station',  region: 'NSW1', fuel: 'gas_ocgt',  cap_mw: 664,  owner: 'Origin' },
  { name: 'Shoalhaven',               region: 'NSW1', fuel: 'gas_steam', cap_mw: 40,   owner: 'Origin' },
  { name: 'Hunter Power Project',      region: 'NSW1', fuel: 'gas_ocgt',  cap_mw: 316,  owner: 'AGL' },
  // VIC
  { name: 'Jeeralang Power Station',   region: 'VIC1', fuel: 'gas_ocgt',  cap_mw: 228,  owner: 'AGL' },
  { name: 'Laverton North Power Stn',  region: 'VIC1', fuel: 'gas_ocgt',  cap_mw: 312,  owner: 'Snowy Hydro' },
  { name: 'Mortlake Power Station',    region: 'VIC1', fuel: 'gas_ocgt',  cap_mw: 566,  owner: 'Origin' },
  { name: 'Newport Power Station',     region: 'VIC1', fuel: 'gas_steam', cap_mw: 500,  owner: 'AGL' },
  { name: 'Somerton Power Station',    region: 'VIC1', fuel: 'gas_ocgt',  cap_mw: 160,  owner: 'AGL' },
  { name: 'Bairnsdale Power Station',  region: 'VIC1', fuel: 'gas_ocgt',  cap_mw: 94,   owner: 'Energy Australia' },
  { name: 'West Kiewa',               region: 'VIC1', fuel: 'gas_ocgt',  cap_mw: 60,   owner: 'AGL' },
  // QLD
  { name: 'Braemar Power Station',     region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 489,  owner: 'Arrow Energy' },
  { name: 'Braemar 2 Power Station',   region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 450,  owner: 'Arrow Energy' },
  { name: 'Condamine Power Station',   region: 'QLD1', fuel: 'gas_ccgt',  cap_mw: 140,  owner: 'Origin' },
  { name: 'Darling Downs Power Stn',   region: 'QLD1', fuel: 'gas_ccgt',  cap_mw: 630,  owner: 'Origin' },
  { name: 'Oakey Power Station',       region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 282,  owner: 'APA Group' },
  { name: 'Roma Power Station',        region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 80,   owner: 'APA Group' },
  { name: 'Swanbank E Gas Turbine',    region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 385,  owner: 'CS Energy' },
  { name: 'Townsville Power Stn',      region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 208,  owner: 'EnergyAustralia' },
  { name: 'Mackay Gas Turbine',        region: 'QLD1', fuel: 'gas_ocgt',  cap_mw: 38,   owner: 'CS Energy' },
  // SA
  { name: 'Barker Inlet Power Stn',    region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 211,  owner: 'AGL' },
  { name: 'Dry Creek Power Station',   region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 156,  owner: 'AGL' },
  { name: 'Hallett Power Station',     region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 228,  owner: 'AGL' },
  { name: 'Hallett 2 Power Station',   region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 228,  owner: 'AGL' },
  { name: 'Ladbroke Grove Power Stn',  region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 80,   owner: 'Origin' },
  { name: 'Osborne Power Station',     region: 'SA1',  fuel: 'gas_ccgt',  cap_mw: 180,  owner: 'Santos' },
  { name: 'Pelican Point Power Stn',   region: 'SA1',  fuel: 'gas_ccgt',  cap_mw: 478,  owner: 'Engie' },
  { name: 'Quarantine Power Station',  region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 214,  owner: 'Origin' },
  { name: 'Snuggery Power Station',    region: 'SA1',  fuel: 'gas_ocgt',  cap_mw: 68,   owner: 'AGL' },
  { name: 'Torrens Island Power Stn',  region: 'SA1',  fuel: 'gas_steam', cap_mw: 400,  owner: 'AGL' },
]

// ── Coal stations ─────────────────────────────────────────────────────────────

export const COAL_STATIONS: NemStation[] = [
  // NSW - black coal
  { name: 'Bayswater Power Station',   region: 'NSW1', fuel: 'coal_black', cap_mw: 2640, owner: 'AGL' },
  { name: 'Eraring Power Station',     region: 'NSW1', fuel: 'coal_black', cap_mw: 2880, owner: 'Origin' },
  { name: 'Mt Piper Power Station',    region: 'NSW1', fuel: 'coal_black', cap_mw: 1400, owner: 'EnergyAustralia' },
  { name: 'Vales Point Power Station', region: 'NSW1', fuel: 'coal_black', cap_mw: 1320, owner: 'Delta Electricity' },
  // VIC - brown coal
  { name: 'Loy Yang A Power Station',  region: 'VIC1', fuel: 'coal_brown', cap_mw: 2210, owner: 'AGL' },
  { name: 'Loy Yang B Power Station',  region: 'VIC1', fuel: 'coal_brown', cap_mw: 1000, owner: 'EnergyAustralia' },
  // QLD - black coal
  { name: 'Callide B Power Station',   region: 'QLD1', fuel: 'coal_black', cap_mw: 700,  owner: 'CS Energy' },
  { name: 'Callide C Power Station',   region: 'QLD1', fuel: 'coal_black', cap_mw: 840,  owner: 'CS Energy / InterGen' },
  { name: 'Callide Power Plant',       region: 'QLD1', fuel: 'coal_black', cap_mw: 420,  owner: 'CS Energy' },
  { name: 'Gladstone Power Station',   region: 'QLD1', fuel: 'coal_black', cap_mw: 1680, owner: 'NRG Gladstone' },
  { name: 'Kogan Creek Power Station', region: 'QLD1', fuel: 'coal_black', cap_mw: 750,  owner: 'CS Energy' },
  { name: 'Stanwell Power Station',    region: 'QLD1', fuel: 'coal_black', cap_mw: 1460, owner: 'Stanwell' },
  { name: 'Tarong Power Station',      region: 'QLD1', fuel: 'coal_black', cap_mw: 1400, owner: 'Stanwell' },
  { name: 'Tarong North Power Stn',    region: 'QLD1', fuel: 'coal_black', cap_mw: 443,  owner: 'Stanwell' },
  { name: 'Millmerran Power Plant',    region: 'QLD1', fuel: 'coal_black', cap_mw: 852,  owner: 'InterGen' },
]

export const ALL_FOSSIL_STATIONS = [...GAS_STATIONS, ...COAL_STATIONS]

// Lookup helpers
export const GAS_STATION_NAMES   = new Set(GAS_STATIONS.map(s => s.name))
export const COAL_STATION_NAMES  = new Set(COAL_STATIONS.map(s => s.name))

export function isFossil(name: string): boolean {
  return GAS_STATION_NAMES.has(name) || COAL_STATION_NAMES.has(name)
}

export function stationFuel(name: string): 'gas' | 'coal' | 'other' {
  if (GAS_STATION_NAMES.has(name))  return 'gas'
  if (COAL_STATION_NAMES.has(name)) return 'coal'
  return 'other'
}

export const FUEL_COLOURS = {
  gas_ccgt:   '#FF9F0A',
  gas_ocgt:   '#FFCC02',
  gas_steam:  '#FF6B35',
  coal_black: '#636366',
  coal_brown: '#8E7B6E',
  gas:        '#FF9F0A',
  coal:       '#636366',
  other:      '#98989D',
} as const

// Stations by region for batch fetching
export function stationsByRegion(region: NemRegion): NemStation[] {
  return ALL_FOSSIL_STATIONS.filter(s => s.region === region)
}
