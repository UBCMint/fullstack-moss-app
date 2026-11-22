import { InputHTMLAttributes } from 'react';

/**
 * A labeled text input styled to match the Figma "Welcome Screen" auth
 * forms — a plain teal-bordered pill, not the global `Input` component
 * (which always renders a search icon and isn't right for a login form).
 */
export function AuthField({
    label,
    hint,
    ...inputProps
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="flex flex-col gap-[8px]">
            <label
                htmlFor={inputProps.id}
                className="font-ibmplex text-sm text-black"
            >
                {label}
            </label>
            <input
                {...inputProps}
                className="h-[37px] w-full rounded-[10px] border border-[#0d585f] bg-white px-[16px] text-sm font-ibmplex outline-none focus-visible:ring-1 focus-visible:ring-[#0d585f]"
            />
            {hint && (
                <p className="font-ibmplex text-xs text-[#605454]">{hint}</p>
            )}
        </div>
    );
}
