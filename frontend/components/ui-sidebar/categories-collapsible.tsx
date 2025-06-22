import * as React from 'react';
import { CaretDownIcon, CaretUpIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import NodeButton from './node-button';

interface Node {
    id: string;
    label: string;
    description: string;
    category: string;
}

interface CategoriesProps {
    categoryName: string;
    availableNodes: Node[];
}

export function Categories({ categoryName, availableNodes }: CategoriesProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const categoryNodes = availableNodes.filter((node) => {
        const normalizedCategory = node.category.toLowerCase();
        const normalizedCategoryName = categoryName.toLowerCase();
        return normalizedCategory === normalizedCategoryName;
    });

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full space-y-2 mt-4"
        >
            <div className="flex items-center justify-between space-x-4 px-4">
                <h4>{categoryName}</h4>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-9 p-0">
                        {isOpen ? (
                            <CaretUpIcon className="h-4 w-4" />
                        ) : (
                            <CaretDownIcon className="h-4 w-4" />
                        )}
                        <span className="sr-only">Toggle</span>
                    </Button>
                </CollapsibleTrigger>
            </div>
            <div className="w-full h-[1px] bg-gray-200" />
            <CollapsibleContent className="space-y-2">
                {categoryNodes.map((node, index) => (
                    <div key={index} className="mb-4">
                        <NodeButton
                            id={node.id}
                            label={node.label}
                            description={node.description}
                        />
                    </div>
                ))}
            </CollapsibleContent>
        </Collapsible>
    );
}
