'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
        <html lang="en">
            <body>
                <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
                    <h1 className="text-2xl font-semibold text-black">
                        Something went wrong
                    </h1>
                    <p className="max-w-md text-base text-gray-600">
                        The app ran into an unexpected error. Please reload the
                        page.
                    </p>
                    <button
                        onClick={reset}
                        className="rounded-md bg-[#2B6C66] px-4 py-2 text-white hover:opacity-90"
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
