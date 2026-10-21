/**
 * The token vault's worker (see `vault-core.ts`). As a SharedWorker, every tab of the site shares
 * one sign-in, and it outlives a page reload as long as another tab of the site stays open; where
 * SharedWorker doesn't exist (Chrome on Android), each tab gets a dedicated worker of its own.
 */
import { Vault, type VaultMessage, type VaultRequest } from './vault-core'

type Port = { postMessage: (m: VaultMessage) => void }

const ports = new Set<Port>()
const vault = new Vault(
  {
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    base: self.location.origin,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as number),
  },
  (message) => ports.forEach((p) => p.postMessage(message)),
)

function listen(port: Port & { onmessage: ((e: MessageEvent<VaultRequest>) => void) | null }) {
  ports.add(port)
  port.onmessage = (e) => void vault.handle(e.data, (m) => port.postMessage(m))
}

const scope = self as unknown as { onconnect?: unknown; postMessage: (m: VaultMessage) => void; onmessage: ((e: MessageEvent<VaultRequest>) => void) | null }
if ('onconnect' in self) {
  // Shared: one port per tab.
  scope.onconnect = (e: MessageEvent) => listen(e.ports[0] as unknown as Port & { onmessage: ((e: MessageEvent<VaultRequest>) => void) | null })
} else {
  // Dedicated: the worker itself is the only port.
  listen(scope)
}
