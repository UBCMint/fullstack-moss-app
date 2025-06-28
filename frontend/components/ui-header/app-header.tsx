'use client';
import { Button } from '@/components/ui/button';
import { ExternalLinkIcon, ChevronUpIcon } from '@radix-ui/react-icons';
import { MoveUpRight } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import Image from 'next/image';

export default function AppHeader() {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <header className="flex justify-between items-center p-2 border-b h-16">
            {/* logo */}
            <div className="flex items-center">
                <Image
                    src="/mint-logo.png"
                    alt="Logo"
                    width={56}
                    height={56}
                    className="h-14"
                />
            </div>

            {/* update, issues */}
            <div className="flex items-center space-x-4">
                <Button
                    variant="link"
                    className="flex items-center space-x-1 px-3 py-2"
                >
                    <span>Update</span>
                    <MoveUpRight style={{ height: '10px', width: '10px', marginLeft: '-5px'}} />
                </Button>
                <Button
                    variant="link"
                    className="flex items-center space-x-1 px-3 py-2"
                >
                    <span>Issues</span>
                    <MoveUpRight style={{ height: '10px', width: '10px', marginLeft: '-5px'}} />
                </Button>

                {/* help */}
                <DropdownMenu onOpenChange={setIsOpen}>
                    <DropdownMenuTrigger asChild>
                        <div className="flex items-center space-x-1 px-3 py-2">
                            <span className="text-sm font-medium leading-none">
                                Help
                            </span>
                            <ChevronUpIcon
                                className={`h-4 w-4 transform transition-transform duration-300 ${
                                    isOpen ? 'rotate-180' : 'rotate-0'
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
        </header>
    );
}
