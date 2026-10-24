'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
            <h1 className="font-geist text-2xl font-semibold text-black">
                Something went wrong
            </h1>
            <p className="font-geist max-w-md text-base text-gray-600">
                We hit an unexpected error loading this page. Please try again,
                or reload the app if the problem continues.
            </p>
            <button
                onClick={reset}
                className="rounded-md bg-[#2B6C66] px-4 py-2 font-geist text-white hover:opacity-90"
            >
                Try again
            </button>
        </div>
    );
}
