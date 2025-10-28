import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '広告文リーガルチェックツール',
  description: 'Advanced Ad Copy Legal Compliance Checker - Powered by Dify + Gemini API',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
