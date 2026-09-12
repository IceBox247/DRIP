"use client";

import { useCallback } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "./contracts";

// Make sure the wallet is actually ON Robinhood Chain before we send a transaction.
//
// The app's READS always target Robinhood Chain's RPC directly, so balances/rounds show correctly no
// matter what network the wallet is on. But a WRITE goes out on whatever chain the wallet currently
// has selected — so if the user is left on Ethereum, the tx is sent there (no gas, "not on this
// chain"), and any wait-for-receipt watches the wrong network and eventually times out. Calling this
// first switches the wallet to Robinhood Chain (adding it if the wallet doesn't have it yet) and only
// then lets the transaction proceed.
export function useEnsureChain() {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  return useCallback(async (): Promise<boolean> => {
    if (chainId === CHAIN_ID) return true;
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
      return true;
    } catch {
      return false;
    }
  }, [chainId, switchChainAsync]);
}
