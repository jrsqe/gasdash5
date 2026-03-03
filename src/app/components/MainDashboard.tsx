'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const ElectricityDashboard = dynamic(() => import('./DashboardClient'), { ssr: false })
const GbbDashboard         = dynamic(() => import('./GbbDashboard'),    { ssr: false })

const NAVY   = '#0B1F3A'
const TEAL   = '#00A878'
const MUTED  = '#7A8FA6'
const BORDER = '#DDE2EA'
const SURFACE = '#FFFFFF'
const BG = '#F4F6F9'

type TopTab = 'electricity' | 'gas'

export default function MainDashboard() {
  const [tab, setTab] = useState<TopTab>('electricity')

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      {/* Header */}
      <header style={{
        background: NAVY, borderBottom: `3px solid ${TEAL}`,
        position: 'sticky', top: 0, zIndex: 100,
        padding: '0 2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 58,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 6, background: TEAL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.8rem', color: NAVY, fontFamily: 'Inter, sans-serif',
            }}>SQ</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                Energy Dashboard
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
                Squadron Energy
              </div>
            </div>
          </div>
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>
          NEM · East Coast
        </div>
      </header>

      {/* Top-level tabs */}
      <div style={{
        background: SURFACE, borderBottom: `1px solid ${BORDER}`,
        padding: '0 2rem', display: 'flex', gap: 0,
        boxShadow: '0 1px 3px rgba(11,31,58,0.05)',
      }}>
        {([
          { key: 'electricity', label: '⚡ Gas Power Generation' },
          { key: 'gas',         label: '🔵 Gas Market (GBB)' },
        ] as { key: TopTab; label: string }[]).map(({ key, label }) => {
          const isActive = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '0.9rem 1.75rem', border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              fontWeight: isActive ? 600 : 400, fontSize: '0.9rem',
              color: isActive ? NAVY : MUTED,
              borderBottom: isActive ? `2px solid ${TEAL}` : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
            }}>{label}</button>
          )
        })}
      </div>

      {/* Content */}
      {tab === 'electricity' ? (
        <ElectricityDashboard hideHeader />
      ) : (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem' }}>
          <GbbDashboard />
        </div>
      )}

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${BORDER}`, background: SURFACE,
        padding: '0.9rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: MUTED }}>
            {tab === 'electricity'
              ? 'Data: Open Electricity API · openelectricity.org.au'
              : 'Data: AEMO Gas Bulletin Board · nemweb.com.au'}
          </span>
        </div>
      </footer>
    </div>
  )
}
