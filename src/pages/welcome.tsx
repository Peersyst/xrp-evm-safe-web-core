import type { NextPage } from 'next'
import Head from 'next/head'
import NewSafe from '@/components/welcome'

const Welcome: NextPage = () => {
  return (
    <main>
      <Head>
        <title>EVM Sidechain Safe – Welcome</title>
      </Head>

      <NewSafe />
    </main>
  )
}

export default Welcome
