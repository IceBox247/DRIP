"use client";

import { useEffect, useRef } from "react";
import { useAccount, useReconnect } from "wagmi";

// Keeps a mobile wallet connected across backgrounding.
//
// On phones, locking the screen or switching apps suspends the page; the injected/WalletConnect
// session often drops in the background and wagmi doesn't re-establish it on its own, so the user
// comes back to a "Connect" button after a few seconds/minutes even though they never disconnected.
// This silently reconnects to the last-used connector whenever the app becomes visible again (and
// once shortly after load, to cover a reconnect that didn't finish before first paint). It only acts
// when actually disconnected, so a live session is never disturbed.
export function WalletKeepAlive() {
  const { status } = useAccount();
  const { reconnect } = useReconnect();
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const tryReconnect = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (statusRef.current === "disconnected") reconnect();
    };
    // A nudge just after mount catches the case where the on-mount reconnect hasn't landed yet.
    const t = setTimeout(tryReconnect, 1200);
    document.addEventListener("visibilitychange", tryReconnect);
    window.addEventListener("focus", tryReconnect);
    window.addEventListener("online", tryReconnect);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", tryReconnect);
      window.removeEventListener("focus", tryReconnect);
      window.removeEventListener("online", tryReconnect);
    };
  }, [reconnect]);

  return null;
}
