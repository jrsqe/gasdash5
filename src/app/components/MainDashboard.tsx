'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'

const ElectricityDashboard  = dynamic(() => import('./DashboardClient'),       { ssr: false })
const GbbDashboard          = dynamic(() => import('./GbbDashboard'),          { ssr: false })
const GpgProfileDashboard   = dynamic(() => import('./GpgProfileDashboard'),   { ssr: false })
const GasPriceDashboard     = dynamic(() => import('./GasPriceDashboard'),     { ssr: false })

type TopTab = 'electricity' | 'gas' | 'gpg-profile' | 'gas-prices'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry<T> { data: T; fetchedAt: number }

// Global in-memory caches — survive tab switches, cleared after 1 hr
const elecCache = new Map<string, CacheEntry<any>>()
let gbbCache: CacheEntry<any> | null = null

export function useElecData(interval: string) {
  const [payload,   setPayload]   = useState<any>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const fetch_ = useCallback(async (iv: string, force = false) => {
    const cached = elecCache.get(iv)
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setPayload(cached.data); setFetchedAt(cached.fetchedAt); return
    }
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/energy?interval=${iv}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      elecCache.set(iv, { data: json, fetchedAt: Date.now() })
      setPayload(json); setFetchedAt(Date.now())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  return { payload, loading, error, fetchedAt, fetch: fetch_ }
}

export function useGbbData() {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const fetch_ = useCallback(async (force = false) => {
    if (!force && gbbCache && Date.now() - gbbCache.fetchedAt < CACHE_TTL_MS) {
      setData(gbbCache.data); setFetchedAt(gbbCache.fetchedAt); return
    }
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/gbb')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      gbbCache = { data: json.data, fetchedAt: Date.now() }
      setData(json.data); setFetchedAt(Date.now())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  return { data, loading, error, fetchedAt, fetch: fetch_ }
}

export default function MainDashboard() {
  const [tab, setTab] = useState<TopTab>('electricity')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header — Apple-style frosted sticky bar */}
      <header style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 100,
        padding: '0 2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 52,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.7rem', color: '#fff',
            fontFamily: 'var(--font-ui)', letterSpacing: '-0.02em', flexShrink: 0,
          }}>SQ</div>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.88rem', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Gas Dashboard
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.6rem', fontFamily: 'var(--font-data)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Squadron Energy
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#30C254' }} />
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>
            NEM Live
          </span>
        </div>
      </header>

      {/* Top-level tabs — pill-style */}
      <div style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        display: 'flex', gap: 0,
      }}>
        {([
          { key: 'electricity', label: 'Gas Power Generation' },
          { key: 'gas',         label: 'Gas Market (GBB)' },
          { key: 'gpg-profile', label: 'GPG Generation Profile' },
          { key: 'gas-prices',  label: 'Gas Prices' },
        ] as { key: TopTab; label: string }[]).map(({ key, label }) => {
          const isActive = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '0.75rem 1.25rem',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: isActive ? 600 : 400,
              fontSize: '0.82rem', letterSpacing: '-0.015em',
              color: isActive ? 'var(--accent)' : 'var(--muted)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
            }}>{label}</button>
          )
        })}
      </div>

      {/* Content — both mounted but one hidden, so state is preserved */}
      <div style={{ display: tab === 'electricity' ? 'block' : 'none' }}>
        <ElectricityDashboard hideHeader />
      </div>
      <div style={{ display: tab === 'gas-prices' ? 'block' : 'none' }}>
        <GasPriceDashboard />
      </div>
      <div style={{ display: tab === 'gpg-profile' ? 'block' : 'none' }}>
        <GpgProfileDashboard />
      </div>
      <div style={{ display: tab === 'gas' ? 'block' : 'none' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
          <GbbDashboard />
        </div>
      </div>

      <footer style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '0.75rem 1.75rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)' }}>
          {tab === 'gas' ? 'AEMO Gas Bulletin Board · nemweb.com.au' : tab === 'gas-prices' ? 'AEMO DWGM · STTM · nemweb.com.au' : 'Open Electricity API · openelectricity.org.au'}
        </span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>
          Data refreshes hourly
        </span>
      </footer>
    </div>
  )
}
