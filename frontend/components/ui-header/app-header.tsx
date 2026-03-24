'use client';
import { Button } from '@/components/ui/button';
import { ChevronUpIcon } from '@radix-ui/react-icons';
import { ArrowUpRight } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import Image from 'next/image';
import { useGlobalContext } from '@/context/GlobalContext';
import ExportDialog from '@/components/ui/export-dialog';
import ImportDialog from '@/components/ui/import-dialog';

export default function AppHeader() {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const { activeSessionId } = useGlobalContext();

    return (
        <header className="flex justify-between items-center px-2 py-3 border-b h-25">
            {/* logo */}
            <div className="flex items-center">
                <Image
                    src="/mint-logo.png"
                    alt="Logo"
                    width={52}
                    height={46}
                    className="h-14 w-auto object-contain ml-2"
                />
            </div>

            {/* import, export, help */}
            <div className="flex h-full items-center space-x-4">

                {/* Export Data */}
                <Button
                    variant="link"
                    className="flex items-center gap-1 px-3 py-2"
                    onClick={() => setIsExportOpen(true)}
                >
                    <span>Export Data</span>
                    <ArrowUpRight size={14} className="transition-transform duration-200 hover:scale-110" />
                </Button>

                {/* Import Data */}
                <Button
                    variant="link"
                    className="flex items-center gap-1 px-3 py-2"
                    onClick={() => setIsImportOpen(true)}
                >
                    <span>Import Data</span>
                    <ArrowUpRight size={14} className="transition-transform duration-200 hover:scale-110" />
                </Button>

                {/* help */}
                <DropdownMenu onOpenChange={setIsOpen}>
                    <DropdownMenuTrigger asChild>
                        <div className="flex items-center space-x-1 px-3 py-2">
                            <span className="text-sm font-medium leading-none">
                                Help
                            </span>
                            <ChevronUpIcon
                                className={`h-4 w-4 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'
                                    }`}
                            />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="mx-4">
                        <DropdownMenuItem>Getting Started</DropdownMenuItem>
                        <DropdownMenuItem>Testing Impendance</DropdownMenuItem>
                        <DropdownMenuItem>
                            Troubleshooting Guide
                        </DropdownMenuItem>
                        <DropdownMenuItem>Cyton Driver Fix</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Dialogs */}
            <ExportDialog
                open={isExportOpen}
                sessionId={activeSessionId}
                onOpenChange={setIsExportOpen}
            />
            <ImportDialog
                open={isImportOpen}
                sessionId={activeSessionId}
                onOpenChange={setIsImportOpen}
            />
        </header>
    );
}
