'use client'

import dynamic from 'next/dynamic'

const Universe = dynamic(() => import('@/core/Universe'), { ssr: false })

export default function Home() {
  return <Universe />
}
