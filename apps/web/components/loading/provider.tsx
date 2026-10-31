"use client"

import { SkulletProvider } from "skullet/react"

// Both palettes use our CSS tokens, which also follow an explicitly selected app theme.
export function LoadingProvider({ children }: { children: React.ReactNode }) {
  return (
    <SkulletProvider
      reveal="smart"
      theme={{
        light: { base: "var(--muted)", highlight: "var(--border)" },
        dark: { base: "var(--muted)", highlight: "var(--border)" },
        radius: "4px",
        animation: "shimmer",
        speed: "slow",
      }}
    >
      {children}
    </SkulletProvider>
  )
}
