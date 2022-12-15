import Head from 'next/head'
import type { NextPage } from 'next'

import CreateSafe from '@/components/new-safe/CreateSafe'

const Open: NextPage = () => {
  return (
    <main>
      <Head>
        <title>Evm Sidechain Safe – Create Safe</title>
      </Head>

      <CreateSafe />
    </main>
  )
}

export default Open
