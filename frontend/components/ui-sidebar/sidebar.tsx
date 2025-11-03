'use client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import Cross1 from '@/components/radix/cross1';
import NodeButton from './node-button';
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';


export default function Sidebar() {

    const AvailableNodes = [
        {
            id: 'source-node',
            label: 'Source Node',
            description: 'No Connection',
            category: 'Nodes',
        },
        {
            id: 'filter-node',
            label: 'Filter Node',
            description: 'Filter and process data streams',
            category: 'Nodes',
        },
        {
            id: 'machine-learning-node',
            label: 'ML Node',
            description: 'Machine learning prediction and analysis',
            category: 'Nodes',
        },
        {
            id: 'signal-graph-node',
            label: 'Chart Node',
            description: 'Visualize data and create charts',
            category: 'Nodes',
        },
    ];

    const [searchTerm, setSearchTerm] = useState('');

    const filteredNodes = AvailableNodes.filter((node) =>
        node.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <ResizablePanelGroup direction="horizontal" className="border-none min-h-[200px] max-w-md rounded-lg border md:min-w-[450px]">
            <ResizablePanel defaultSize={60} minSize={60} className=" ">
                <Card className="max-h-[calc(100vh-2rem)] flex flex-col ">
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <CardTitle className="font-ibmplex font-semibold text-xl text-black">Menu</CardTitle>
                        <Cross1 />
                    </CardHeader>

                    <div className='pb-4'>
                            <Input
                                type="text"
                                placeholder="Search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="items-center px-7 py-2 mx-4 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 placeholder-gray-500"
                            />
                    </div>

                    <CardContent className="overflow-y-auto flex-1 px-4 pb-4 space-y-3">
                        {(searchTerm ? filteredNodes : AvailableNodes).map((node) => (
                            <NodeButton
                                key={node.id}
                                id={node.id}
                                label={node.label}
                                description={node.description}
                            />
                        ))}
                    </CardContent>
                </Card>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border-none" />
            <ResizablePanel defaultSize={40} minSize={5} />
        </ResizablePanelGroup>
    );
}