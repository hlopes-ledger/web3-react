import LedgerCard from '../components/connectorCards/LedgerCard'
import WalletConnectV2Card from '../components/connectorCards/WalletConnectV2Card'
import ProviderExample from '../components/ProviderExample'

export default function Home() {
  return (
    <>
      <ProviderExample />
      <div style={{ display: 'flex', flexFlow: 'wrap', fontFamily: 'sans-serif' }}>
        <LedgerCard />
        {/* <MetaMaskCard /> */}
        <WalletConnectV2Card />
        {/* <WalletConnectCard /> */}
        {/* <CoinbaseWalletCard /> */}
        {/* <NetworkCard /> */}
        {/* <GnosisSafeCard /> */}
      </div>
    </>
  )
}
