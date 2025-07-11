import * as React from "react"
import { MagnifyingGlassIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
        <div className="relative flex items-center">
            <MagnifyingGlassIcon className="absolute left-6 text-[#96bdba]" />
            <input
                type={type}
                className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                className
                )}
                ref={ref}
                {...props}
            />
        </div>
    )
  }
)
Input.displayName = "Input"


export { Input }
