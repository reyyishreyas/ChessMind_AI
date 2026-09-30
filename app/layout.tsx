import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ChessMind AI - Adaptive Chess Training",
  description:
    "Train against an AI that adapts to your skill level, teaches you through every move, and grows with you as a chess player.",
    generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning: extensions (e.g. Grammarly) inject data-*
    // attributes into <html>/<body> before React hydrates — attribute-only
    // mismatch, so it's safe to ignore.
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
