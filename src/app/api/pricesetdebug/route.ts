import { NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function GET() {
  const log: string[] = []
  try {
    // Check DispatchIS_Reports — this is the 5-min dispatch report
    const dirUrl = 'https://www.nemweb.com.au/REPORTS/CURRENT/DispatchIS_Reports/'
    log.push(`Fetching ${dirUrl}`)
    const dirRes = await fetch(dirUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    log.push(`Status: ${dirRes.status}`)
    const html = await dirRes.text()
    log.push(`HTML length: ${html.length}`)

    // Find zip files
    const re = /PUBLIC_DISPATCHIS_\d+_\d+\.zip/g
    const files: string[] = []
    let m
    while ((m = re.exec(html)) !== null) files.push(m[0])
    log.push(`Found ${files.length} zip files`)
    if (files.length) {
      log.push(`First: ${files[0]}`)
      log.push(`Last:  ${files[files.length - 1]}`)
    }

    if (!files.length) {
      // Show raw HTML snippet to understand format
      log.push('Raw HTML snippet:')
      log.push(html.substring(0, 2000))
      return NextResponse.json({ ok: false, log })
    }

    // Fetch latest zip
    const zipUrl = dirUrl + files[files.length - 1]
    log.push(`Fetching: ${zipUrl}`)
    const zipRes = await fetch(zipUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    log.push(`Zip status: ${zipRes.status}, size: ${zipRes.headers.get('content-length')}`)
    const buf = await zipRes.arrayBuffer()
    log.push(`Buffer bytes: ${buf.byteLength}`)

    const zip = await JSZip.loadAsync(buf)
    log.push(`Zip files: ${Object.keys(zip.files).join(', ')}`)

    const csvFile = Object.values(zip.files).find(f => !f.dir && f.name.toUpperCase().endsWith('.CSV'))
    if (!csvFile) return NextResponse.json({ ok: false, log, error: 'No CSV' })

    const csv = await csvFile.async('string')
    log.push(`CSV bytes: ${csv.length}`)

    const lines = csv.split('\n')
    log.push(`Total lines: ${lines.length}`)

    // Show all I (header) rows to see what tables are present
    lines.filter(l => l.startsWith('I,')).forEach(l => log.push(`HDR: ${l.substring(0, 120)}`))

    // Check for PRICE_SETTER
    const psIdx = lines.findIndex(l => l.includes('PRICE_SETTER'))
    log.push(`PRICE_SETTER at line: ${psIdx}`)
    if (psIdx >= 0) {
      lines.slice(psIdx, psIdx + 3).forEach((l, i) => log.push(`PS+${i}: ${l.substring(0, 200)}`))
    }

    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    log.push(`ERROR: ${err.message}`)
    return NextResponse.json({ ok: false, log, error: err.message })
  }
}
