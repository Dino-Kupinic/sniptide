import { LifeField } from "@/components/auth/life-field"

export function ErrorBackdrop() {
  return (
    <LifeField
      density={0.045}
      fps={15}
      className="-z-10 opacity-30 [mask-image:radial-gradient(ellipse_at_center,transparent_15%,black_90%)] dark:opacity-45"
    />
  )
}
