import type { Web3Provider, JsonRpcProvider } from '@ethersproject/providers'
import type Safe from '@safe-global/safe-core-sdk'
import { SafeFactory, type DeploySafeProps } from '@safe-global/safe-core-sdk'
import { createEthersAdapter } from '@/hooks/coreSDK/safeCoreSDK'
import type { ChainInfo, SafeInfo } from '@safe-global/safe-gateway-typescript-sdk'
import { EMPTY_DATA, ZERO_ADDRESS } from '@safe-global/safe-core-sdk/dist/src/utils/constants'
import {
  getFallbackHandlerContractInstance,
  getGnosisSafeContractInstance,
  getProxyFactoryContractInstance,
} from '@/services/contracts/safeContracts'
import { LATEST_SAFE_VERSION } from '@/config/constants'
import type { PredictSafeProps } from '@safe-global/safe-core-sdk/dist/src/safeFactory'
import type { SafeFormData, PendingSafeTx } from '@/components/create-safe/types.d'
import type { ConnectedWallet } from '@/services/onboard'
import { BigNumber } from '@ethersproject/bignumber'
import { getSafeInfo } from '@safe-global/safe-gateway-typescript-sdk'
import { backOff } from 'exponential-backoff'
import { SafeCreationStatus } from '@/components/create-safe/status/useSafeCreation'
import { didRevert, type EthersError } from '@/utils/ethers-utils'
import { Errors, logError } from '@/services/exceptions'
import { ErrorCode } from '@ethersproject/logger'
import { isWalletRejection } from '@/utils/wallets'

export type SafeCreationProps = {
  owners: string[]
  threshold: number
  saltNonce: number
}

/**
 * Prepare data for creating a Safe for the Core SDK
 */
export const getSafeDeployProps = (
  safeParams: SafeCreationProps,
  callback: (txHash: string) => void,
  chainId: string,
): PredictSafeProps & { callback: DeploySafeProps['callback'] } => {
  const fallbackHandler = getFallbackHandlerContractInstance(chainId)

  return {
    safeAccountConfig: {
      threshold: safeParams.threshold,
      owners: safeParams.owners,
      fallbackHandler: fallbackHandler.getAddress(),
    },
    safeDeploymentConfig: {
      saltNonce: safeParams.saltNonce.toString(),
    },
    callback,
  }
}

export const contractNetworks = {
  ['1440001']: {
    safeMasterCopyAddress: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactoryAddress: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    multiSendAddress: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    multiSendCallOnlyAddress: '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
    fallbackHandlerAddress: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    signMessageLibAddress: '0x03F886722b44BefB13871D4a05621D38616D3b7c',
    createCallAddress: '0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4',
  },
  ['1440002']: {
    safeMasterCopyAddress: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactoryAddress: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    multiSendAddress: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    multiSendCallOnlyAddress: '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
    fallbackHandlerAddress: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    signMessageLibAddress: '0x03F886722b44BefB13871D4a05621D38616D3b7c',
    createCallAddress: '0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4',
  },
}

/**
 * Create a Safe creation transaction via Core SDK and submits it to the wallet
 */
export const createNewSafe = async (ethersProvider: Web3Provider, props: DeploySafeProps): Promise<Safe> => {
  const ethAdapter = createEthersAdapter(ethersProvider)

  const safeFactory = await SafeFactory.create({ ethAdapter, contractNetworks })
  return safeFactory.deploySafe(props)
}

/**
 * Compute the new counterfactual Safe address before it is actually created
 */
export const computeNewSafeAddress = async (ethersProvider: Web3Provider, props: PredictSafeProps): Promise<string> => {
  const ethAdapter = createEthersAdapter(ethersProvider)

  const safeFactory = await SafeFactory.create({ ethAdapter, contractNetworks })
  return safeFactory.predictSafeAddress(props)
}

/**
 * Encode a Safe creation transaction NOT using the Core SDK because it doesn't support that
 * This is used for gas estimation.
 */
export const encodeSafeCreationTx = ({
  owners,
  threshold,
  saltNonce,
  chain,
}: SafeCreationProps & { chain: ChainInfo }) => {
  const safeContract = getGnosisSafeContractInstance(chain, LATEST_SAFE_VERSION)
  const proxyContract = getProxyFactoryContractInstance(chain.chainId)
  const fallbackHandlerContract = getFallbackHandlerContractInstance(chain.chainId)

  const setupData = safeContract.encode('setup', [
    owners,
    threshold,
    ZERO_ADDRESS,
    EMPTY_DATA,
    fallbackHandlerContract.getAddress(),
    ZERO_ADDRESS,
    '0',
    ZERO_ADDRESS,
  ])

  return proxyContract.encode('createProxyWithNonce', [safeContract.getAddress(), setupData, saltNonce])
}

/**
 * Encode a Safe creation tx in a way that we can store locally and monitor using _waitForTransaction
 */
export const getSafeCreationTxInfo = async (
  provider: Web3Provider,
  params: SafeFormData,
  chain: ChainInfo,
  saltNonce: number,
  wallet: ConnectedWallet,
): Promise<PendingSafeTx> => {
  const proxyContract = getProxyFactoryContractInstance(chain.chainId)

  const data = encodeSafeCreationTx({
    owners: params.owners.map((owner) => owner.address),
    threshold: params.threshold,
    saltNonce,
    chain,
  })

  return {
    data,
    from: wallet.address,
    nonce: await provider.getTransactionCount(wallet.address),
    to: proxyContract.getAddress(),
    value: BigNumber.from(0),
    startBlock: await provider.getBlockNumber(),
  }
}

export const estimateSafeCreationGas = async (
  chain: ChainInfo,
  provider: JsonRpcProvider,
  from: string,
  safeParams: SafeCreationProps,
): Promise<BigNumber> => {
  const proxyFactoryContract = getProxyFactoryContractInstance(chain.chainId)
  const encodedSafeCreationTx = encodeSafeCreationTx({ ...safeParams, chain })

  return provider.estimateGas({
    from: from,
    to: proxyFactoryContract.getAddress(),
    data: encodedSafeCreationTx,
  })
}

export const pollSafeInfo = async (chainId: string, safeAddress: string): Promise<SafeInfo> => {
  // exponential delay between attempts for around 4 min
  return backOff(() => getSafeInfo(chainId, safeAddress), {
    startingDelay: 750,
    maxDelay: 20000,
    numOfAttempts: 19,
    retry: (e) => {
      console.info('waiting for client-gateway to provide safe information', e)
      return true
    },
  })
}

export const handleSafeCreationError = (error: EthersError) => {
  logError(Errors._800, error.message)

  if (isWalletRejection(error)) {
    return SafeCreationStatus.WALLET_REJECTED
  }

  if (error.code === ErrorCode.TRANSACTION_REPLACED) {
    if (error.reason === 'cancelled') {
      return SafeCreationStatus.ERROR
    } else {
      return SafeCreationStatus.SUCCESS
    }
  }

  if (didRevert(error.receipt)) {
    return SafeCreationStatus.REVERTED
  }

  return SafeCreationStatus.TIMEOUT
}

export const checkSafeCreationTx = async (
  provider: JsonRpcProvider,
  pendingTx: PendingSafeTx,
  txHash: string,
): Promise<SafeCreationStatus> => {
  const TIMEOUT_TIME = 6.5 * 60 * 1000 // 6.5 minutes

  try {
    const receipt = await provider._waitForTransaction(txHash, 1, TIMEOUT_TIME, pendingTx)

    if (didRevert(receipt)) {
      return SafeCreationStatus.REVERTED
    }

    return SafeCreationStatus.SUCCESS
  } catch (err) {
    return handleSafeCreationError(err as EthersError)
  }
}
