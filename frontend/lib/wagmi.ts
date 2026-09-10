import { http, createConfig, cookieStorage, createStorage } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { robinhoodChain } from "./contracts";

// wagmi config for Robinhood Chain. Injected (MetaMask/browser) always available; WalletConnect is
// added only when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
const wcId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  transports: { [robinhoodChain.id]: http() },
  connectors: [injected(), ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true })] : [])],
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});
