"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";

// Wraps the whole app so wallet + query hooks work anywhere. Wallet connect is inert until a wallet
// is available (injected) or NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set — the demo still runs.
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
