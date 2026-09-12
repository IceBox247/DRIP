"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { WalletKeepAlive } from "@/components/WalletKeepAlive";

// Wraps the whole app so wallet + query hooks work anywhere. Wallet connect is inert until a wallet
// is available (injected) or NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set — the demo still runs.
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reconnectOnMount (default true) restores the session on load; WalletKeepAlive re-restores it
    // after the phone backgrounds the page, so mobile wallets don't appear to "randomly disconnect".
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WalletKeepAlive />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
