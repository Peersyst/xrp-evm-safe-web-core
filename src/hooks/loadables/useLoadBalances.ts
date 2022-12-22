import { useEffect } from 'react'
import { getBalances, type SafeBalanceResponse } from '@safe-global/safe-gateway-typescript-sdk'
import { useAppSelector } from '@/store'
import useAsync, { type AsyncResult } from '../useAsync'
import { Errors, logError } from '@/services/exceptions'
import { selectCurrency } from '@/store/settingsSlice'
import { selectSafeInfo } from '@/store/safeInfoSlice'
import { ethers } from 'ethers'
import BigNumber from 'bignumber.js'

export const useLoadBalances = (): AsyncResult<SafeBalanceResponse> => {
  // use the selector directly because useSafeInfo is memoized
  const { data: safe } = useAppSelector(selectSafeInfo)
  const currency = useAppSelector(selectCurrency)

  // Re-fetch assets when the entire SafeInfo updates
  const [data, error, loading] = useAsync<SafeBalanceResponse | undefined>(
    async () => {
      if (!safe) return

      const res: any = await fetch('https://api.coingecko.com/api/v3/coins/ripple')
      const data = await res.json()
      const balances = await getBalances(safe.chainId, safe.address.value, currency)
      return balances.items.reduce(
        (res, { balance, tokenInfo }) => {
          const fiatConversion = (data?.market_data?.current_price['usd'] as number).toString()
          const fiatBalanceBN = new BigNumber(balance).multipliedBy(fiatConversion)
          return {
            fiatTotal: ethers.utils.formatUnits(new BigNumber(res.fiatTotal).plus(fiatBalanceBN).toString()),
            items: [
              ...res.items,
              {
                balance,
                fiatConversion: fiatConversion,
                fiatBalance: ethers.utils.formatUnits(fiatBalanceBN.toString()),
                tokenInfo,
              },
            ],
          }
        },
        {
          fiatTotal: '0',
          items: [],
        } as SafeBalanceResponse,
      )
    },
    [safe, currency], // Reload either when the Safe is updated or the currency changes
    false, // Don't clear data between SafeInfo polls
  )

  // Log errors
  useEffect(() => {
    if (error) {
      logError(Errors._601, error.message)
    }
  }, [error])

  return [data, error, loading]
}

export default useLoadBalances
