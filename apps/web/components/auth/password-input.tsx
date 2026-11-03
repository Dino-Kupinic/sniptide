"use client"

import { Input } from "@sniptide/ui/components/input"
import { cn } from "@sniptide/ui/lib/utils"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"

// A password input with eight dots as its placeholder and an eye button at the end that shows or
// hides what was typed, like the paste unlock form.
export function PasswordInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const t = useTranslations("Paste")
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        placeholder="••••••••"
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}
