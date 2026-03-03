import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gas Generation Dashboard',
  description: 'NSW & VIC gas power generation and spot prices',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
