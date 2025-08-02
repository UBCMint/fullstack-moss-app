'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function WelcomePage() {
    const router = useRouter();
    const [transition, setTransition] = useState<boolean>(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setTransition(true);
            setTimeout(() => {
                router.push('/home');
            }, 200);
        }, 3000);

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <div
            className={`flex items-center justify-center h-screen relative transition-opacity duration-500 ease-in-out ${
                transition ? 'opacity-0' : 'opacity-100'
            }`}
            style={{
                background:
                    'linear-gradient(125deg, #0D585F, #7AB5AD, #0D585F)',
                backgroundSize: '190%',
                animation: 'bg-animation 20s infinite',
            }}
        >
            <div className="w-[1088px] h-[480px] rounded-[64px] border border-[#E4F1E1C4] bg-[#E4F1E124] shadow-[0_0_30px_0_#00000026] backdrop-blur-[21.6px] flex items-center gap-2 relative">
                <div className="flex flex-row items-center gap-12 ml-20">
                    <Image
                        src="/welcome-logo.png"
                        alt="MOSS Logo"
                        width={392}
                        height={357}
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
                                    textShadow:
                                        '0px 0px 30px rgba(0, 0, 0, 0.15)',
                                }}
                            >
                                Making visualizing brainwaves easy
                            </p>
                            <Image
                                src="/welcome-spinner.png"
                                alt="Loading"
                                width={24}
                                height={24}
                                className="w-[24px] h-[24px] animate-spin"
                            />
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-8 right-10 flex gap-4">
                    <Image
                        src="/instagram-logo.png"
                        alt="Instagram"
                        width={24}
                        height={24}
                        className="w-[24px] h-[24px]"
                    />
                    <Image
                        src="/welcome-logo-2.png"
                        alt="Small Logo"
                        width={24}
                        height={24}
                        className="w-[24px] h-[24px]"
                    />
                </div>
            </div>
        </div>
    );
}
