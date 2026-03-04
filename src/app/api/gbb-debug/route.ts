import { NextResponse } from 'next/server'

const GBB_ZIP_URL = 'https://nemweb.com.au/Reports/Current/GBB/GasBBActualFlowStorage.zip'

export async function GET() {
  try {
    // 1. Fetch zip
    const res = await fetch(GBB_ZIP_URL, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: `Fetch failed: ${res.status} ${res.statusText}` })

    const arrayBuf = await res.arrayBuffer()
    const zipBuf   = Buffer.from(arrayBuf)

    // 2. Try to find ZIP local file header
    const results: any = {
      zipSizeBytes: zipBuf.length,
      first8Bytes:  zipBuf.slice(0, 8).toString('hex'),
      entries: [],
    }

    let offset = 0
    let found  = false
    while (offset < zipBuf.length - 4) {
      const sig = zipBuf.readUInt32LE(offset)
      if (sig === 0x04034b50) {
        found = true
        const compression    = zipBuf.readUInt16LE(offset + 8)
        const compressedSize = zipBuf.readUInt32LE(offset + 18)
        const uncompSize     = zipBuf.readUInt32LE(offset + 22)
        const fnameLen       = zipBuf.readUInt16LE(offset + 26)
        const extraLen       = zipBuf.readUInt16LE(offset + 28)
        const fname          = zipBuf.slice(offset + 30, offset + 30 + fnameLen).toString()
        const dataStart      = offset + 30 + fnameLen + extraLen

        results.entries.push({ offset, compression, compressedSize, uncompSize, fname, dataStart })

        // Try to decompress and show first 500 chars
        try {
          const compData = zipBuf.slice(dataStart, dataStart + compressedSize)
          let csvText = ''
          if (compression === 0) {
            csvText = compData.toString('latin1')
          } else if (compression === 8) {
            const { inflateRawSync } = await import('zlib')
            csvText = (inflateRawSync as any)(compData).toString('latin1')
          }
          results.entries[results.entries.length - 1].csvPreview = csvText.slice(0, 1000)
          results.entries[results.entries.length - 1].csvLines   = csvText.split('\n').length
        } catch (e: any) {
          results.entries[results.entries.length - 1].decompError = e.message
        }

        offset = dataStart + compressedSize
      } else {
        offset++
      }
    }

    if (!found) results.error = 'No ZIP local file headers found'
    return NextResponse.json(results, { status: 200 })

  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) })
  }
}
