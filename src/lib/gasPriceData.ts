// ── Gas Price Data ─────────────────────────────────────────────────────────────
// DWGM (Victorian Declared Wholesale Gas Market) prices
// STTM Sydney (Short Term Trading Market) ex-post imbalance prices

export interface DwgmDay {
  gasDate:    string   // YYYY-MM-DD
  label:      string   // "DD Mon"
  bod:        number | null
  am10:       number | null
  pm2:        number | null
  pm6:        number | null
  pm10:       number | null
  wdAvg:      number | null   // imb_wtd_ave_price_gst_ex — headline daily price
}

export interface SttmDay {
  gasDate: string   // YYYY-MM-DD
  label:   string
  price:   number | null
}

export type SttmHub = 'SYD' | 'BRI' | 'ADE'

export interface GasPriceData {
  dwgm:           DwgmDay[]
  sttmSyd:        SttmDay[]
  sttmBri:        SttmDay[]
  sttmAde:        SttmDay[]
  latestDwgmDate: string
  latestSttmDate: string
}

const DWGM_URL = 'https://www.nemweb.com.au/REPORTS/CURRENT/VicGas/INT041_V4_MARKET_AND_REFERENCE_PRICES_1.CSV'
const STTM_URL = 'https://www.nemweb.com.au/Reports/CURRENT/STTM/int657_v2_ex_post_market_data_rpt_1.csv'

const MONTHS: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12'
}

// Parse "DD Mon YYYY" → "YYYY-MM-DD"
function parseGasDate(s: string): string {
  const parts = s.trim().split(' ')
  if (parts.length < 3) return ''
  const [dd, mon, yyyy] = parts
  const mm = MONTHS[mon ?? ''] ?? '01'
  return `${yyyy}-${mm}-${(dd ?? '').padStart(2, '0')}`
}

// Format YYYY-MM-DD → "DD Mon" for axis labels
function toLabel(iso: string): string {
  const [, mm, dd] = iso.split('-')
  const mon = Object.keys(MONTHS).find(k => MONTHS[k] === mm) ?? ''
  return `${parseInt(dd ?? '0')} ${mon}`
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.trim())
  return isNaN(n) ? null : n
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(l => {
    const vals = l.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

async function fetchDwgm(): Promise<DwgmDay[]> {
  const res  = await fetch(DWGM_URL, { cache: 'no-store' })
  const text = await res.text()
  const rows = parseCsvRows(text)

  return rows
    .map(r => {
      const gasDate = parseGasDate(r['gas_date'] ?? '')
      if (!gasDate) return null
      return {
        gasDate,
        label:  toLabel(gasDate),
        bod:    parseNum(r['price_bod_gst_ex']          ?? ''),
        am10:   parseNum(r['price_10am_gst_ex']         ?? ''),
        pm2:    parseNum(r['price_2pm_gst_ex']          ?? ''),
        pm6:    parseNum(r['price_6pm_gst_ex']          ?? ''),
        pm10:   parseNum(r['price_10pm_gst_ex']         ?? ''),
        wdAvg:  parseNum(r['imb_wtd_ave_price_gst_ex']  ?? ''),
      } satisfies DwgmDay
    })
    .filter((d): d is DwgmDay => d !== null)
    .sort((a, b) => a.gasDate.localeCompare(b.gasDate))
}

function parseSttmHub(rows: Record<string, string>[], hub: string): SttmDay[] {
  const hubRows = rows.filter(r => (r['hub_identifier'] ?? '').trim().toUpperCase() === hub)
  const byDate  = new Map<string, { day: SttmDay; schedId: number }>()
  for (const r of hubRows) {
    const gasDate = parseGasDate(r['gas_date'] ?? '')
    if (!gasDate) continue
    const schedId = parseInt(r['schedule_identifier'] ?? '0')
    const existing = byDate.get(gasDate)
    if (!existing || schedId > existing.schedId) {
      byDate.set(gasDate, {
        day: { gasDate, label: toLabel(gasDate), price: parseNum(r['ex_post_imbalance_price'] ?? '') },
        schedId,
      })
    }
  }
  return Array.from(byDate.values()).map(v => v.day).sort((a, b) => a.gasDate.localeCompare(b.gasDate))
}

async function fetchAllSttm(): Promise<{ syd: SttmDay[]; bri: SttmDay[]; ade: SttmDay[] }> {
  const res  = await fetch(STTM_URL, { cache: 'no-store' })
  const text = await res.text()
  const rows = parseCsvRows(text)
  return {
    syd: parseSttmHub(rows, 'SYD'),
    bri: parseSttmHub(rows, 'BRI'),
    ade: parseSttmHub(rows, 'ADE'),
  }
}

export async function getGasPriceData(): Promise<GasPriceData> {
  const [dwgm, sttm] = await Promise.all([fetchDwgm(), fetchAllSttm()])
  const latestSttmDate = [sttm.syd, sttm.bri, sttm.ade]
    .map(a => a[a.length - 1]?.gasDate ?? '')
    .filter(Boolean).sort().pop() ?? ''
  return {
    dwgm,
    sttmSyd: sttm.syd,
    sttmBri: sttm.bri,
    sttmAde: sttm.ade,
    latestDwgmDate: dwgm[dwgm.length - 1]?.gasDate ?? '',
    latestSttmDate,
  }
}
