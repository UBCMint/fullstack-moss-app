import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    GROUP_INFO,
    type ChannelGroup,
    type ChannelLayout,
    type DataPoint,
} from '@/lib/channels';

interface DataTableProps {
    rowCount?: number;
    data?: DataPoint[];
    layout: ChannelLayout;
    /** Channel groups to show as columns, in order. */
    groups: ChannelGroup[];
}

const headClass = 'text-center font-medium text-[#0D585F] whitespace-nowrap';
const cellClass = 'text-center text-[#0D585F] tabular-nums';

// Newest samples first. Rows beyond the data are shown as placeholders so the
// table keeps its height before streaming starts.
const DataTable: React.FC<DataTableProps> = ({
    rowCount = 8,
    data = [],
    layout,
    groups,
}) => {
    const columns = groups.flatMap((group) =>
        layout[group].map((label, index) => ({ group, index, label }))
    );

    return (
        <div className="w-full overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="bg-[#ABD4C7] border-[#2C7778]">
                        <TableHead className={headClass}>Time</TableHead>
                        {columns.map(({ group, index, label }) => (
                            <TableHead
                                key={`${group}-${index}`}
                                className={headClass}
                            >
                                {label}
                                <span className="ml-1 text-[10px] font-normal opacity-70">
                                    {GROUP_INFO[group].unit}
                                </span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: rowCount }, (_, rowIdx) => {
                        const row = data[data.length - 1 - rowIdx];
                        return (
                            <TableRow
                                key={rowIdx}
                                className={
                                    rowIdx % 2 === 0
                                        ? 'bg-white border-[#2C7778]'
                                        : 'bg-[#ABD4C7] border-[#2C7778]'
                                }
                            >
                                <TableCell className={cellClass}>
                                    {row?.time ?? '--:--:-- --'}
                                </TableCell>
                                {columns.map(({ group, index }) => {
                                    const value = row?.[group][index];
                                    return (
                                        <TableCell
                                            key={`${group}-${index}`}
                                            className={cellClass}
                                        >
                                            {value === undefined
                                                ? '–'
                                                : value.toFixed(2)}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
};

export default DataTable;
