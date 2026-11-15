import Image from 'next/image';
import { ReactNode } from 'react';

/**
 * The rounded white card shared by the login and signup screens, with the
 * two decorative teal ellipses bleeding off the top-right and top-left
 * corners (per the Figma "Welcome Screen" designs).
 */
export function AuthCard({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-[#f4faf9] px-4">
            <div className="relative w-[565px] max-w-full bg-white border border-[#7ab5ad] rounded-[36px] shadow-[0px_4px_25px_0px_rgba(0,0,0,0.25)] overflow-hidden px-[40px] pt-[72px] pb-[40px]">
                <Image
                    src="/auth-ellipse-outer.svg"
                    alt=""
                    aria-hidden
                    width={363}
                    height={363}
                    className="absolute -top-[66px] right-[40px] w-[363px] h-[363px] pointer-events-none select-none"
                />
                <Image
                    src="/auth-ellipse-inner.svg"
                    alt=""
                    aria-hidden
                    width={120}
                    height={120}
                    className="absolute -top-[51px] -left-px w-[120px] h-[120px] pointer-events-none select-none"
                />
                <h1 className="relative font-ibmplex text-2xl font-bold text-[#131515] mb-[42px]">
                    {title}
                </h1>
                <div className="relative flex flex-col gap-[20px]">
                    {children}
                </div>
            </div>
        </div>
    );
}
