"use client"

import { Label } from "@sniptide/ui/components/label"
import { cn } from "@sniptide/ui/lib/utils"
import { useTranslations } from "next-intl"
import { PasswordInput } from "./password-input"
import { passwordStrength } from "./password-strength"

const strengthHints = new Map([
  ["Use at least 8 characters", "minimum"],
  ["Add a symbol", "symbol"],
  ["Add a number", "number"],
  ["Mix upper and lower case", "case"],
])

// A new-password field with the strength meter from the Paper sign-up artboard. Shared by sign-up,
// password reset and Settings.
export function NewPasswordField({
  id,
  label,
  value,
  onChange,
  className,
  labelClassName,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
  labelClassName?: string
}) {
  const t = useTranslations("Auth")
  const strength = passwordStrength(value)
  const strengthHint = strength.hint ? strengthHints.get(strength.hint) : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <PasswordInput
        id={id}
        name={id}
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-strength`}
        className={className}
      />
      {value ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={cn(
                  "h-[3px] flex-1 bg-border",
                  segment <= strength.score && "bg-primary",
                )}
              />
            ))}
          </div>
          <p id={`${id}-strength`} className="text-xs text-muted-foreground">
            {t(`passwordStrength.${strength.score}`)}
            {strengthHint ? ` ${t(`passwordHint.${strengthHint}`)}` : null}
          </p>
        </div>
      ) : null}
    </div>
  )
}
