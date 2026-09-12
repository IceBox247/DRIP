"use client";

import { useEffect, useRef } from "react";

// Make a modal / bottom-sheet respond to the phone's Back button (and the browser Back arrow).
//
// A sheet toggled with React state isn't a route, so on Android the hardware Back button would leave
// the whole page (or do nothing) instead of closing the sheet — leaving the user stuck if the on-screen
// close control is scrolled out of view. This pushes a throwaway history entry while the sheet is open
// so Back simply pops it and closes the sheet, and it cleans that entry up if the sheet is closed some
// other way (an X, tapping the backdrop) — without ever triggering a real navigation.
export function useBackClose(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let poppedByBack = false;
    window.history.pushState({ dripSheet: true }, "");
    const onPop = () => { poppedByBack = true; cb.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed via X/backdrop (not Back): remove our own throwaway entry so Back isn't "used up".
      if (!poppedByBack && (window.history.state as { dripSheet?: boolean } | null)?.dripSheet) {
        window.history.back();
      }
    };
  }, [open]);
}
