import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Squadron Energy — Market Dashboard',
  description: 'Gas & electricity market intelligence for eastern Australia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
