"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"

export const ProgressBar = ({
    value,
    className,
}: {
    value: number
    className?: string
}) => {
    return (
        <ProgressPrimitive.Root
            value={value}
            className={cn(
                "relative h-[12px] w-full overflow-hidden rounded-full bg-[#E9E9E9]",
                className
            )}
        >
            <ProgressPrimitive.Indicator
                className="h-full bg-[#7AB5AD] transition-transform duration-200 rounded-full "
                style={{ transform: `translateX(-${100 - value}%)` }}
            />
        </ProgressPrimitive.Root>
    )
}

