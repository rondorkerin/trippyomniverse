import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tripiverse',
  description: 'Psychedelic flow state experience',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
