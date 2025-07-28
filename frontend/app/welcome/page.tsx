'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WelcomePage() {
    const router = useRouter();

    useEffect(() => {
        const timer = setTimeout(() => {
            router.push('/');
        }, 2000);

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <div
            className="flex items-center justify-center h-screen relative"
            style={{
                background:
                    'linear-gradient(135deg, rgba(13, 88, 95, 1) 0%, rgba(122, 181, 173, 1) 50%, rgba(13, 88, 95, 1) 100%)',
            }}
        >
            <div
                className="w-[1088px] h-[480px] rounded-[64px] border border-[#E4F1E1C4] bg-[#E4F1E124] shadow-[0_0_30px_0_#00000026] backdrop-blur-[21.6px] flex items-center gap-2 relative"
            >
                <div className="flex flex-row items-center gap-12 ml-20">
                    <img
                        src="/welcome-logo.png"
                        alt="MOSS Logo"
                        className="w-[392px] h-[357px] flex-shrink-0"
                    />

                    <div className="flex flex-col justify-center h-[480px] mt-[-30px]">
                        <p
                            className="text-[165px] font-bold text-[#E4F1E1]"
                            style={{
                                fontFamily: 'IBM Plex Sans, sans-serif',
                                fontWeight: 700,
                                textShadow: '0px 0px 30px rgba(0, 0, 0, 0.15)',
                            }}
                        >
                            MOSS
                        </p>

                        <div className="flex items-center gap-[12px] pl-[10px] mt-[-50px]">
                            <p
                                className="text-[24px] text-[#E4F1E1]"
                                style={{
                                    fontFamily: 'IBM Plex Sans, sans-serif',
                                    fontWeight: 400,
                                    textShadow: '0px 0px 30px rgba(0, 0, 0, 0.15)',
                                }}
                            >
                                Making visualizing brainwaves easy
                            </p>
                            <img
                                src="/welcome-spinner.png"
                                alt="Loading"
                                className="w-[24px] h-[24px] animate-spin"
                            />
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-8 right-10 flex gap-4">
                    <img
                        src="/instagram-logo.png"
                        alt="Instagram"
                        className="w-[24px] h-[24px]"
                    />
                    <img
                        src="/welcome-logo-2.png"
                        alt="Small Logo"
                        className="w-[24px] h-[24px]"
                    />
                </div>
            </div>
        </div>
    );

}