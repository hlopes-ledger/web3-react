import { EthereumProvider, loadConnectKit, SupportedProviders } from '@ledgerhq/connect-kit-loader'
import { Actions, Connector, Provider, ProviderRpcError } from '@web3-react/types'

export const URI_AVAILABLE = 'URI_AVAILABLE'

function parseChainId(chainId: string | number) {
  // Convert the chain ID from a string to a number if it's a hexadecimal string
  return typeof chainId === 'string' ? Number.parseInt(chainId, 16) : chainId
}

type LedgerProvider = Provider & EthereumProvider

/**
 * Options to configure the Ledger Connect Kit.
 * For the full list of options, see {@link }.
 */
export type LedgerOptions = {
  projectId: string
  chains: number[]
  optionalChains?: number[]
  methods?: string[]
  optionalMethods?: string[]
  events?: string[]
  optionalEvents?: string[]
  /**
   * Map of chainIds to rpc url(s). If multiple urls are provided, the first one that responds
   * within a given timeout will be used. Note that multiple urls are not supported by WalletConnect by default.
   * That's why we extend its options with our own `rpcMap` (@see getBestUrlMap).
   */
  rpcMap?: { [chainId: number]: string | string[] }
  relayUrl?: string
}

/**
 * Options to configure the WalletConnect connector.
 */
export interface LedgerConstructorArgs {
  actions: Actions
  /** Options to pass to `@walletconnect/ethereum-provider`. */
  options: LedgerOptions
  /** The chainId to connect to in activate if one is not provided. */
  defaultChainId?: number
  /**
   * @param timeout - Timeout, in milliseconds, after which to treat network calls to urls as failed when selecting
   * online urls.
   */
  timeout?: number
  /**
   * @param onError - Handler to report errors thrown from WalletConnect.
   */
  onError?: (error: Error) => void
}

/**
 * A minimal xonnector
 */
export class Ledger extends Connector {
  public provider?: LedgerProvider

  private connectKitPromise

  constructor({ actions, onError }: LedgerConstructorArgs) {
    super(actions, onError)

    // Load the ConnectKit library and store the promise in a member variable
    this.connectKitPromise = loadConnectKit()

    // Initialize the provider to undefined
    this.provider = undefined
  }

  private disconnectListener = (error: ProviderRpcError) => {
    console.log('disconnectListener')
    this.actions.resetState()
    if (error) this.onError?.(error)
  }

  private chainChangedListener = (chainId: string): void => {
    console.log('chainChangedListener')
    this.actions.update({ chainId: Number.parseInt(chainId, 16) })
  }

  private accountsChangedListener = (accounts: string[]): void => {
    console.log('accountsChangedListener')
    this.actions.update({ accounts })
  }

  private isomorphicInitialize(): Promise<LedgerProvider> {
    console.log('isomorphicInitialize')
    return loadConnectKit().then(async (connectKit) => {
      connectKit.checkSupport({
        providerType: SupportedProviders.Ethereum,
        walletConnectVersion: 2,
        projectId: '85a25426af6e359da0d3508466a95a1d',
        // chains: this.options.chains,
        // rpcMap: this.options.rpcMap,
        chains: [1],
        rpcMap: {
          1: 'https://cloudflare-eth.com/', // Mainnet
          5: 'https://goerli.optimism.io/', // Goerli
          137: 'https://polygon-rpc.com/', // Polygon
        },
      })
      connectKit.enableDebugLogs()

      const provider = (this.provider = (await connectKit.getProvider()) as LedgerProvider)
      provider.on('disconnect', this.disconnectListener)
      provider.on('chainChanged', this.chainChangedListener)
      provider.on('accountsChanged', this.accountsChangedListener)

      return provider
    })
  }

  async connectEagerly() {
    console.log('connectEagerly')
    // cancelActivation means starting a new Activation -> Start the activation
    const cancelActivation = this.actions.startActivation()

    try {
      const provider = await this.isomorphicInitialize()

      // WalletConnect automatically persists and restores active sessions
      if (!provider || !provider.session) {
        throw new Error('No active session found. Connect your wallet first.')
      }

      // Get the chain ID and accounts from the provider and update the state
      // const [chainId, accounts] = await Promise.all([
      //   provider.request({ method: 'eth_chainId' }) as Promise<string>,
      //   provider.request({ method: 'eth_accounts' }) as Promise<string[]>,
      // ])
      // this.actions.update({ chainId: parseChainId(chainId), accounts })
    } catch (error) {
      // Reset the state and re-throw the error
      this.actions.resetState()
      throw error
    } finally {
      // Stop the activation
      cancelActivation()
    }
  }

  /**
   * method starts the activation, checks if the provider is supported, and if so,
   * gets the provider. It then gets the chain ID and accounts from the provider and
   * updates the state. If there is an error, the state is reset and the error is re-thrown.
   *
   * @param desiredChainId - The desired chainId to connect to.
   */
  public async activate(): Promise<void> {
    console.log('activate')
    if (typeof window === 'undefined' || !window.document) return

    const provider = await this.isomorphicInitialize()
    const cancelActivation = this.actions.startActivation()

    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const chainId = (await provider.request({ method: 'eth_chainId' })) as string
      this.actions.update({ chainId: parseChainId(chainId), accounts })
    } catch (error) {
      await this.deactivate()
      cancelActivation()
      throw error
    }
  }

  // Reset provider and state
  async deactivate() {
    console.log('deactivate')
    if (this.provider) {
      this.provider = undefined
    }
    this.actions.resetState()
  }
}
