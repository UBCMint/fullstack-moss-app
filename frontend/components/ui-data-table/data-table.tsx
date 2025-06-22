import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface SignalData {
    time: string;
    signal1: number;
    signal2: number;
    signal3: number;
    signal4: number;
    signal5: number;
}

interface DataTableProps {
    rowCount?: number;
    data?: SignalData[];
}

const DataTable: React.FC<DataTableProps> = ({ rowCount = 8, data = [] }) => {
    const rows = Array(rowCount)
        .fill(null)
        .map((_, index) => {
            return (
                data[data.length - 1 - index] || {
                    time: '--:--:-- --',
                    signal1: 0,
                    signal2: 0,
                    signal3: 0,
                    signal4: 0,
                    signal5: 0,
                }
            );
        });

    return (
        <div className="w-full overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-sky-50">
                        <TableHead className="text-center font-medium">
                            Time
                        </TableHead>
                        <TableHead className="text-center font-medium">
                            Signal 1
                        </TableHead>
                        <TableHead className="text-center font-medium">
                            Signal 2
                        </TableHead>
                        <TableHead className="text-center font-medium">
                            Signal 3
                        </TableHead>
                        <TableHead className="text-center font-medium">
                            Signal 4
                        </TableHead>
                        <TableHead className="text-center font-medium">
                            Signal 5
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, index) => (
                        <TableRow
                            key={index}
                            className={
                                index % 2 === 0 ? 'bg-white' : 'bg-sky-50'
                            }
                        >
                            <TableCell className="text-center">
                                {row.time}
                            </TableCell>
                            <TableCell className="text-center">
                                {row.signal1}
                            </TableCell>
                            <TableCell className="text-center">
                                {row.signal2}
                            </TableCell>
                            <TableCell className="text-center">
                                {row.signal3}
                            </TableCell>
                            <TableCell className="text-center">
                                {row.signal4}
                            </TableCell>
                            <TableCell className="text-center">
                                {row.signal5}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export default DataTable;
