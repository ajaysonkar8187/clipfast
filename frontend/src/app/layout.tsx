import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClipFast — AI Short-Form Video Generator',
  description: 'Turn your long videos into viral short clips using AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
