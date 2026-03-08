"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

export interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  /** Иконка внутри ползунка в состоянии «включено» */
  thumbIconChecked?: React.ReactNode
  /** Иконка внутри ползунка в состоянии «выключено» */
  thumbIconUnchecked?: React.ReactNode
}

function Switch({
  className,
  thumbIconChecked,
  thumbIconUnchecked,
  ...props
}: SwitchProps) {
  const hasThumbIcons = thumbIconChecked != null || thumbIconUnchecked != null
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch-root data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        hasThumbIcons && "w-9",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 flex items-center justify-center relative",
          hasThumbIcons && "size-[1.15rem] data-[state=checked]:translate-x-[calc(100%-2px)]"
        )}
      >
        {hasThumbIcons && (
          <>
            <span
              className="absolute inset-0 flex items-center justify-center text-foreground opacity-0 group-data-[state=unchecked]/switch-root:opacity-100 [&_svg]:size-3 [&_svg]:shrink-0"
              aria-hidden
            >
              {thumbIconUnchecked}
            </span>
            <span
              className="absolute inset-0 flex items-center justify-center text-foreground opacity-0 group-data-[state=checked]/switch-root:opacity-100 [&_svg]:size-3 [&_svg]:shrink-0"
              aria-hidden
            >
              {thumbIconChecked}
            </span>
          </>
        )}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
