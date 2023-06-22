import { URI_AVAILABLE } from '@web3-react/ledger'
import { useEffect, useState } from 'react'

import { MAINNET_CHAINS } from '../../chains'
import { hooks, ledger } from '../../connectors/ledger'
import { Card } from '../Card'

const CHAIN_IDS = Object.keys(MAINNET_CHAINS).map(Number)

const { useChainId, useAccounts, useIsActivating, useIsActive, useProvider, useENSNames } = hooks

export default function LedgerCard() {
  const chainId = useChainId()
  const accounts = useAccounts()
  const isActivating = useIsActivating()

  const isActive = useIsActive()

  const provider = useProvider()
  const ENSNames = useENSNames(provider)

  const [error, setError] = useState(undefined)

  // log URI when available
  useEffect(() => {
    ledger.events.on(URI_AVAILABLE, (uri: string) => {
      console.log(`uri: ${uri}`)
    })
  }, [])

  // attempt to connect eagerly on mount
  useEffect(() => {
    ledger.connectEagerly().catch((error) => {
      console.debug('Failed to connect eagerly to Ledger', error)
    })
  }, [])

  return (
    <Card
      connector={ledger}
      activeChainId={chainId}
      chainIds={CHAIN_IDS}
      isActivating={isActivating}
      isActive={isActive}
      error={error}
      setError={setError}
      accounts={accounts}
      provider={provider}
      ENSNames={ENSNames}
    />
  )
}
