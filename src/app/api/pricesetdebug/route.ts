import { NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function GET() {
  const log: string[] = []
  try {
    const dirUrl = 'https://www.nemweb.com.au/REPORTS/CURRENT/Next_Day_Dispatch/'
    log.push('Fetching Next_Day_Dispatch directory...')
    const dirRes = await fetch(dirUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const html = await dirRes.text()

    const re = /PUBLIC_NEXT_DAY_DISPATCH_(\d{8})_[\w]+\.zip/g
    const files: string[] = []
    let m
    while ((m = re.exec(html)) !== null) files.push(m[0])
    log.push(`Found ${files.length} zip files`)
    log.push(`Latest: ${files[files.length - 1] ?? 'none'}`)

    if (!files.length) return NextResponse.json({ ok: false, log })

    // Fetch most recent zip
    const zipUrl = dirUrl + files[files.length - 1]
    log.push(`Fetching: ${zipUrl}`)
    const zipRes = await fetch(zipUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    log.push(`Status: ${zipRes.status}, content-length: ${zipRes.headers.get('content-length')}`)

    const buf = await zipRes.arrayBuffer()
    log.push(`Buffer bytes: ${buf.byteLength}`)

    const zip = await JSZip.loadAsync(buf)
    log.push(`Zip contents: ${Object.keys(zip.files).join(', ')}`)

    const csvFile = Object.values(zip.files).find(f => !f.dir && f.name.toUpperCase().endsWith('.CSV'))
    if (!csvFile) return NextResponse.json({ ok: false, log, error: 'No CSV' })

    const csv = await csvFile.async('string')
    log.push(`CSV bytes: ${csv.length}`)

    // Find all table names (I rows)
    const lines = csv.split('\n')
    const tableHeaders = lines.filter(l => l.startsWith('I,'))
    log.push(`Table headers (${tableHeaders.length}):`)
    tableHeaders.slice(0, 20).forEach(l => log.push(`  ${l.substring(0, 100)}`))

    // Find PRICE_SETTER
    const psIdx = lines.findIndex(l => l.includes('PRICE_SETTER'))
    log.push(`PRICE_SETTER at line: ${psIdx}`)
    if (psIdx >= 0) {
      lines.slice(psIdx, psIdx + 4).forEach((l, i) => log.push(`PS+${i}: ${l.substring(0, 200)}`))
    }

    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    log.push(`ERROR: ${err.message}`)
    return NextResponse.json({ ok: false, log, error: err.message })
  }
}
