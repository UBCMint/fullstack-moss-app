import { Clock } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shared placeholder for a profile section whose real feature (calibration,
 * saved routines, automation preference) doesn't exist yet. Task 51 swaps
 * the section component that renders this for the real one — the page
 * itself doesn't change.
 */
export function ComingSoonPlaceholder({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-[#131515]">
                    {title}
                </CardTitle>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e4f1e1] px-2.5 py-0.5 text-xs font-medium text-[#0d585f]">
                    <Clock className="h-3 w-3" />
                    Coming soon
                </span>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-[#605454]">{description}</p>
            </CardContent>
        </Card>
    );
}
