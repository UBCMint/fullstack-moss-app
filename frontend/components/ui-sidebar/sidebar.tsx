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
import { ChevronDown } from 'lucide-react';


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
        {
            id: 'window-node',
            label: 'Window Node',
            description: 'Configure windowing parameters for data streams',
            category: 'Nodes',
        },
        {
            id: 'label-node',
            label: 'Labeling Node',
            description: 'Label data and create labels',
            category: 'Nodes',
        }
    ];

    const [searchTerm, setSearchTerm] = useState('');
    const [collapsed, setCollapsed] = useState(false);

    const filteredNodes = AvailableNodes.filter((node) =>
        node.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <ResizablePanelGroup direction="horizontal" className="border-none min-h-[200px] max-w-md rounded-lg border md:min-w-[450px]">
            <ResizablePanel defaultSize={60} minSize={60} className=" ">
                <Card className="max-h-[calc(100vh-2rem)] flex flex-col ">
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <CardTitle className="font-ibmplex font-semibold text-xl text-black">Menu</CardTitle>
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="p-1 rounded hover:bg-gray-100"
                            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
                        >
                            {collapsed ? <ChevronDown size={15} /> : <Cross1 />}
                        </button>
                    </CardHeader>

                    {!collapsed && (
                        <>
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
                        </>
                    )}
                </Card>
            </ResizablePanel>
            <ResizableHandle withHandle className={collapsed ? 'invisible' : 'bg-border-none'} />
            <ResizablePanel defaultSize={40} minSize={5} />
        </ResizablePanelGroup>
    );
}