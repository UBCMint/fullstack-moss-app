import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
} from "./alert-dialog"
import { AlertCircle, Lock } from "lucide-react"

export function ErrorDialog({ open, onOpenChange, title, description }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-white border border-[#EB0000] shadow-md">
                <AlertDialogHeader className="flex gap-3 items-start">
                    <div className="flex items-center space-x-2">
                        <AlertCircle className="w-[24px] h-[27px] text-[#EB0000] mt-1" />
                        <AlertDialogTitle className="text-2xl font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif', }}>{title}</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="text-sm mt-1 ml-8" style={{ fontFamily: 'IBM Plex Sans, sans-serif', }}>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="bg-[#2C7778] text-white font-semibold">
                        Close
                    </AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function PermissionDialog({ open, onOpenChange, title, description, onAllow }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    onAllow: () => void
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-white border border-[#2C7778] shadow-md ">
                <AlertDialogHeader className="flex gap-3 items-start">
                    <div className="flex items-center space-x-2">
                        <Lock className="w-[24px] h-[27px] mt-1" />
                        <AlertDialogTitle className="text-2xl font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif', }}>{title}</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="text-sm mt-1 ml-8" style={{ fontFamily: 'IBM Plex Sans, sans-serif', }}>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <button
                        onClick={onAllow}
                        className="bg-[#2C7778] text-white px-4 py-1 rounded-md font-semibold text-sm hover:bg-black/80"
                    >
                        Allow
                    </button>
                    <AlertDialogCancel className="border-[#2C7778] text-[#2C7778] font-semibold">
                        Close
                    </AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}