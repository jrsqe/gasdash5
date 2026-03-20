import { NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function GET() {
  const log: string[] = []
  try {
    log.push('Fetching directory...')
    const dirUrl = 'https://www.nemweb.com.au/REPORTS/CURRENT/Public_Prices/'
    const dirRes = await fetch(dirUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    log.push(`Dir status: ${dirRes.status}`)
    const html = await dirRes.text()
    log.push(`Dir HTML length: ${html.length}`)

    const re = /PUBLIC_PRICES_(\d{8})0000_[\w]+\.zip/g
    const files: string[] = []
    let m
    while ((m = re.exec(html)) !== null) files.push(m[0])
    log.push(`Found ${files.length} zip files`)
    if (files.length > 0) log.push(`Latest: ${files[files.length - 1]}`)
    if (files.length === 0) return NextResponse.json({ ok: false, log })

    const zipUrl = dirUrl + files[files.length - 1]
    log.push(`Fetching: ${zipUrl}`)
    const zipRes = await fetch(zipUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    log.push(`Zip status: ${zipRes.status}`)
    const buf = await zipRes.arrayBuffer()
    log.push(`Buffer bytes: ${buf.byteLength}`)

    const zip = await JSZip.loadAsync(buf)
    log.push(`Zip files: ${Object.keys(zip.files).join(', ')}`)

    const csvFile = Object.values(zip.files).find(f => !f.dir && f.name.toUpperCase().endsWith('.CSV'))
    if (!csvFile) return NextResponse.json({ ok: false, log, error: 'No CSV' })

    const csv = await csvFile.async('string')
    log.push(`CSV bytes: ${csv.length}`)

    // Show structure
    const lines = csv.split('\n')
    lines.slice(0, 30).forEach((l, i) => log.push(`L${i}: ${l.substring(0, 120)}`))

    // Find PRICE_SETTER section
    const psIdx = lines.findIndex(l => l.includes('PRICE_SETTER'))
    log.push(`PRICE_SETTER first at line: ${psIdx}`)
    if (psIdx >= 0) {
      lines.slice(psIdx, psIdx + 5).forEach((l, i) => log.push(`PS+${i}: ${l.substring(0, 200)}`))
    }

    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    log.push(`ERROR: ${err.message}`)
    return NextResponse.json({ ok: false, log, error: err.message })
  }
}
