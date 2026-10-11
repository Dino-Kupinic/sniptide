// The 404 from the Paper "Not found" artboards: 24px blocks on an 8px gutter, the "0" in the
// brand blue. One viewBox for both sizes; the mobile artboard's 14px blocks are this scaled down.
export function Pixel404({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 536 216"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="404"
      className={className}
    >
      <path
        className="fill-foreground"
        d="M96 0h24v24h-24zM64 32h24v24h-24zM96 32h24v24h-24zM32 64h24v24h-24zM96 64h24v24h-24zM0 96h24v24h-24zM96 96h24v24h-24zM0 128h24v24h-24zM32 128h24v24h-24zM64 128h24v24h-24zM96 128h24v24h-24zM128 128h24v24h-24zM96 160h24v24h-24zM96 192h24v24h-24zM480 0h24v24h-24zM448 32h24v24h-24zM480 32h24v24h-24zM416 64h24v24h-24zM480 64h24v24h-24zM384 96h24v24h-24zM480 96h24v24h-24zM384 128h24v24h-24zM416 128h24v24h-24zM448 128h24v24h-24zM480 128h24v24h-24zM512 128h24v24h-24zM480 160h24v24h-24zM480 192h24v24h-24z"
      />
      <path
        className="fill-primary"
        d="M256 0h24v24h-24zM224 32h24v24h-24zM288 32h24v24h-24zM192 64h24v24h-24zM320 64h24v24h-24zM192 96h24v24h-24zM320 96h24v24h-24zM192 128h24v24h-24zM320 128h24v24h-24zM224 160h24v24h-24zM288 160h24v24h-24zM256 192h24v24h-24z"
      />
    </svg>
  )
}
