'use client';
import { Card } from '@/components/ui/card';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import Cross1 from '@/components/radix/cross1';
import NodeButton from './node-button';
import React, { ReactNode, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, CircleHelp, X } from 'lucide-react';

// Small "?" button that opens a plain-language explanation of a term on click
function TermHelp({ term, children }: { term: string; children: ReactNode }) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`What is ${term}?`}
                    className="inline-flex align-middle mx-0.5 text-gray-500 hover:text-black"
                >
                    <CircleHelp className="h-3 w-3" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                className="w-64 font-ibmplex text-xs leading-relaxed space-y-2"
            >
                <p className="font-semibold">What is {term}?</p>
                {children}
            </PopoverContent>
        </Popover>
    );
}

export default function Sidebar() {
    const NodeCategories = [
        {
            category: 'Input',
            help: "Input is where your data comes from. Choose whether you want to collect data from a connected device or use data you've already recorded.",
            nodes: [
                {
                    id: 'source-node',
                    label: 'Source Node',
                    description: 'Connect to an EEG data source',
                },
            ],
        },
        {
            category: 'Preprocessing',
            help: 'Prepares recorded data for analysis by reducing unwanted noise or making adjustments to improve signal quality.',
            nodes: [
                {
                    id: 'resampling-node',
                    label: 'Resampling Node',
                    description: 'Resample EEG data to a target frequency',
                },
                {
                    id: 'filter-node',
                    label: 'Filter Node',
                    description: 'Filter and process data streams',
                },
                {
                    id: 'artifact-node',
                    label: 'Artifact Node',
                    description: 'Preprocessing step for artifact removal',
                },
                {
                    id: 'window-node',
                    label: 'Window Node',
                    description:
                        'Configure windowing parameters for data streams',
                },
            ],
        },
        {
            category: 'Analysis',
            help: 'Examines recorded data to help you understand and visualize patterns in brain or muscle activity.',
            nodes: [
                {
                    id: 'machine-learning-node',
                    label: 'ML Node',
                    description: 'Machine learning prediction and analysis',
                },
            ],
        },
        {
            category: 'Output',
            help: 'Allows you to save or export recorded data and results for later use.',
            nodes: [
                {
                    id: 'signal-graph-node',
                    label: 'Chart Node',
                    description: 'Visualize data and create charts',
                },
                {
                    id: 'label-node',
                    label: 'Labeling Node',
                    description: 'Label data and create labels',
                },
            ],
        },
    ];

    const allNodes = NodeCategories.flatMap((c) => c.nodes);

    const [searchTerm, setSearchTerm] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const [open, setOpen] = useState(true);

    const filteredNodes = allNodes.filter((node) =>
        node.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <ResizablePanelGroup
            direction="horizontal"
            className="border-none min-h-[200px] max-w-md rounded-lg border md:min-w-[480px]"
        >
            <ResizablePanel defaultSize={60} minSize={60}>
                <Card
                    className="flex flex-col overflow-hidden"
                    style={{ maxHeight: 'calc(100vh - 2rem)' }}
                >
                    {/* ── Section 1: Header ── */}
                    <div className="flex-shrink-0 flex flex-row items-center justify-between px-6 pt-6 pb-3">
                        <span className="font-ibmplex font-semibold text-xl text-black">
                            Menu
                        </span>
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="p-1 rounded hover:bg-gray-100"
                            aria-label={
                                collapsed ? 'Expand menu' : 'Collapse menu'
                            }
                        >
                            {collapsed ? <ChevronDown size={15} /> : <Cross1 />}
                        </button>
                    </div>

                    {!collapsed && (
                        <>
                            {/* Search — part of header area, doesn't scroll */}
                            <div className="flex-shrink-0 px-6 pb-3">
                                <Input
                                    type="text"
                                    placeholder="Search"
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                    className="w-full border border-gray-200 rounded-md pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 placeholder-gray-500"
                                />
                            </div>

                            {/* ── Section 2: Scrollable node list ── */}
                            <div
                                className="overflow-y-auto px-6 py-2 space-y-3"
                                style={{ maxHeight: '40vh' }}
                            >
                                {searchTerm
                                    ? filteredNodes.map((node) => (
                                          <NodeButton
                                              key={node.id}
                                              id={node.id}
                                              label={node.label}
                                              description={node.description}
                                          />
                                      ))
                                    : NodeCategories.map((group) => (
                                          <div key={group.category}>
                                              <p className="mb-1.5 px-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
                                                  {group.category}
                                                  <TermHelp
                                                      term={group.category}
                                                  >
                                                      <p>{group.help}</p>
                                                  </TermHelp>
                                              </p>
                                              <div className="space-y-2">
                                                  {group.nodes.map((node) => (
                                                      <NodeButton
                                                          key={node.id}
                                                          id={node.id}
                                                          label={node.label}
                                                          description={
                                                              node.description
                                                          }
                                                      />
                                                  ))}
                                              </div>
                                          </div>
                                      ))}
                            </div>

                            {/* ── Section 3: Warning footer (shrinks away when closed) ── */}
                            {open && (
                                <div className="flex-shrink-0 px-6 pb-6 pt-3">
                                    <Alert className="bg-[#EFEFF0] text-black flex justify-between items-start font-ibmplex">
                                        <AlertDescription className="text-[0.7rem]">
                                            Only <b>pre-processed</b>
                                            <TermHelp term="pre-processed data">
                                                <p>
                                                    The headset records tiny
                                                    electrical signals from your
                                                    brain. It also picks up
                                                    signals which aren&apos;t
                                                    brain activity, like those
                                                    from the movement of facial
                                                    muscles.
                                                </p>
                                                <p>
                                                    Pre-processed data is that
                                                    recording after the app has
                                                    cleaned it up: it filters
                                                    out that extra noise and
                                                    splits the signal into short
                                                    chunks so it&apos;s easier
                                                    to analyze. The nodes you
                                                    add, like a Filter or Window
                                                    node, decide how it gets
                                                    cleaned.
                                                </p>
                                            </TermHelp>{' '}
                                            data is <b>saved</b> by default. To
                                            store <b>raw data</b>
                                            <TermHelp term="raw data">
                                                <p>
                                                    Raw data is the brain signal
                                                    exactly as the headset
                                                    recorded it, before any
                                                    cleanup. It includes
                                                    everything the sensors
                                                    picked up, noise and all.
                                                </p>
                                                <p>
                                                    Save raw data if you might
                                                    want to look at it again
                                                    later in a different way.
                                                    Once data has been cleaned
                                                    up, it can&apos;t be turned
                                                    back into the original.
                                                </p>
                                            </TermHelp>
                                            , only use the <b>Source Node</b>{' '}
                                            without adding any computations.
                                        </AlertDescription>
                                        <button
                                            onClick={() => setOpen(false)}
                                            className="ml-2 flex-shrink-0"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Alert>
                                </div>
                            )}
                        </>
                    )}
                </Card>
            </ResizablePanel>
            <ResizableHandle
                withHandle
                className={collapsed ? 'invisible' : 'bg-border-none'}
            />
            <ResizablePanel defaultSize={40} minSize={5} />
        </ResizablePanelGroup>
    );
}
