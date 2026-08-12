import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { CHANNEL_LABELS, CHANNEL_INDICES, NUM_CHANNELS } from '@/lib/channels';

interface SignalData {
    time: string;
    channels: number[];
}

interface DataTableProps {
    rowCount?: number;
    data?: SignalData[];
}

const emptyRow = (): SignalData => ({
    time: '--:--:-- --',
    channels: new Array(NUM_CHANNELS).fill(0),
});

const DataTable: React.FC<DataTableProps> = ({ rowCount = 8, data = [] }) => {
    const rows = Array(rowCount)
        .fill(null)
        .map((_, index) => data[data.length - 1 - index] ?? emptyRow());

    return (
        <div className="w-full overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-[#ABD4C7] border-[#2C7778]">
                        <TableHead className="text-center font-medium text-[#0D585F]">
                            Time
                        </TableHead>
                        {CHANNEL_INDICES.map((i) => (
                            <TableHead
                                key={i}
                                className="text-center font-medium text-[#0D585F]"
                            >
                                {CHANNEL_LABELS[i]}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, index) => (
                        <TableRow
                            key={index}
                            className={
                                index % 2 === 0
                                    ? 'bg-white border-[#2C7778]'
                                    : 'bg-[#ABD4C7] border-[#2C7778]'
                            }
                        >
                            <TableCell className="text-center text-[#0D585F]">
                                {row.time}
                            </TableCell>
                            {CHANNEL_INDICES.map((i) => (
                                <TableCell
                                    key={i}
                                    className="text-center text-[#0D585F]"
                                >
                                    {row.channels[i] ?? 0}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export default DataTable;
