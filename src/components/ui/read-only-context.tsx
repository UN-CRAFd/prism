"use client";

import * as React from "react";

// A region can declare its whole subtree read-only. A native <fieldset disabled>
// reliably locks native controls (input/textarea/button) but NOT Radix portalled
// widgets — a Select trigger or a DropdownMenu trigger escapes the cascade. Those
// primitives read this context instead and disable themselves, so a caller locks
// every one of them by wrapping the subtree in a single <ReadOnlyProvider> — no
// per-control prop threading required.
const ReadOnlyContext = React.createContext(false);

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: React.ReactNode;
}) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly() {
  return React.useContext(ReadOnlyContext);
}
