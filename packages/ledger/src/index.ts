import { Actions, Connector, Provider, ProviderRpcError } from '@web3-react/types'

export const URI_AVAILABLE = 'URI_AVAILABLE'

function parseChainId(chainId: string | number) {
  // Convert the chain ID from a string to a number if it's a hexadecimal string
  return typeof chainId === 'string' ? Number.parseInt(chainId, 16) : chainId
}

type LedgerProvider = Provider & EthereumProvider

export type EthereumRequestPayload = {
  method: string
  params?: unknown[] | object
}

export interface EthereumProvider {
  providers?: EthereumProvider[]
  connector?: unknown
  session?: unknown
  chainId: string | number
  request<T = unknown>(args: EthereumRequestPayload): Promise<T>
  disconnect?: { (): Promise<void> }
  on(event: any, listener: any): void
  removeListener(event: string, listener: any): void
}

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
  // TODO use a better type
  private readonly options?: any

  private connectKitPromise
  private connectKit?: any
  private readonly defaultChainId?: number

  constructor({ actions, options, defaultChainId, onError }: LedgerConstructorArgs) {
    super(actions, onError)
    this.options = options
    this.defaultChainId = defaultChainId

    // load Connect Kit and store the promise
    this.connectKitPromise = this.loadConnectKit()
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

  private async isomorphicInitialize(desiredChainId: number | undefined = this.defaultChainId): Promise<void> {
    console.log('isomorphicInitialize')
    console.log('desiredChainId is', desiredChainId)
    console.log('provider is', this.provider)

    // reuse the provider if it already exists
    if (this.provider) return

    this.connectKit = await this.connectKitPromise
    console.log('isomorphicInitialize complete, connectKit is ready')

    // TODO simplify this, pass options directly?
    const projectId = this.options.projectId
    const chains = this.options.chains
    const optionalChains = this.options.optionalChains
    const methods = this.options.requiredMethods
    const optionalMethods = this.options.optionalMethods
    const events = this.options.requiredEvents
    const optionalEvents = this.options.optionalEvents
    const rpcMap = this.options.rpcMap || {
      1: 'https://cloudflare-eth.com/', // Mainnet
      5: 'https://goerli.optimism.io/', // Goerli
      137: 'https://polygon-rpc.com/', // Polygon
    }

    this.connectKit.checkSupport({
      providerType: 'Ethereum',
      walletConnectVersion: 2,
      projectId,
      chains,
      optionalChains,
      methods,
      optionalMethods,
      events,
      optionalEvents,
      rpcMap,
    })
    this.connectKit.enableDebugLogs()

    const provider = (this.provider = (await this.connectKit.getProvider()) as LedgerProvider)
    provider.on('disconnect', this.disconnectListener)
    provider.on('chainChanged', this.chainChangedListener)
    provider.on('accountsChanged', this.accountsChangedListener)
  }

  private async loadConnectKit() {
    const src = 'https://statuesque-naiad-0cb980.netlify.app/umd/index.js'
    const globalName = 'ledgerConnectKit'

    return new Promise((resolve, reject) => {
      const scriptId = `ledger-ck-script-${globalName}`

      // we don't support server side rendering, reject with no stack trace for now
      if (typeof document === 'undefined') {
        reject('Connect Kit does not support server side')
        return
      }

      if (document.getElementById(scriptId)) {
        resolve((window as { [key: string]: any })[globalName])
      } else {
        const script = document.createElement('script')
        script.src = src
        script.id = scriptId
        script.addEventListener('load', () => {
          resolve((window as { [key: string]: any })[globalName])
        })
        script.addEventListener('error', (e) => {
          reject(e.error)
        })
        document.head.appendChild(script)
      }
    })
  }

  async connectEagerly() {
    console.log('connectEagerly')
    const cancelActivation = this.actions.startActivation()

    try {
      await this.isomorphicInitialize()

      // WalletConnect automatically persists and restores active sessions
      if (!this.provider || !this.provider?.session) {
        return cancelActivation()
      }

      // Get the chain ID and accounts from the provider and update the state
      const [chainId, accounts] = await Promise.all([
        this.provider.request({ method: 'eth_chainId' }) as Promise<string>,
        this.provider.request({ method: 'eth_accounts' }) as Promise<string[]>,
      ])
      console.log('chainId and accounts are', chainId, accounts)
      this.actions.update({ chainId: parseChainId(chainId), accounts })
    } catch (error) {
      console.debug('Could not connect eagerly', error)
      await this.deactivate()
      this.actions.resetState()
      // throw error
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

    await this.isomorphicInitialize()
    if (!this.provider) throw new Error('No provider')

    const cancelActivation = this.actions.startActivation()

    try {
      const accounts = (await this.provider.request({ method: 'eth_requestAccounts' })) as string[]
      const chainId = (await this.provider.request({ method: 'eth_chainId' })) as string
      this.actions.update({ chainId: parseChainId(chainId), accounts })
    } catch (error) {
      await this.deactivate()
      cancelActivation()
      throw error
    }
  }

  async deactivate() {
    console.log('deactivate')
    if (this.provider) {
      this.provider?.disconnect?.()
      this.provider = undefined
    }
    this.actions.resetState()
  }

  // TODO watchAsset
}
