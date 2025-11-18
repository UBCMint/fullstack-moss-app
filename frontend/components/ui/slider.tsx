"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(
  (
    { className, value, defaultValue, ...props }, // pull out value/defaultValue
    ref
  ) => {
    // figure out the current numeric value (we only have one thumb)
    const current =
      (Array.isArray(value) ? value[0] : value) ??
      (Array.isArray(defaultValue) ? defaultValue[0] : defaultValue)

    return (
      <SliderPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className
        )}
        {...props}
      >
        {/* bar */}
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[#E9E9E9]">
          <SliderPrimitive.Range className="absolute h-full bg-[#7AB5AD] rounded-full" />
        </SliderPrimitive.Track>

        {/* thumb + label */}
        <SliderPrimitive.Thumb className="relative block h-4 w-4 rounded-full bg-[#7AB5AD]">
  <span
    className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-gray-700 px-1 py-[1px] rounded"
  >
    {current} Hz
  </span>
</SliderPrimitive.Thumb>

      </SliderPrimitive.Root>
    )
  }
)

Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
