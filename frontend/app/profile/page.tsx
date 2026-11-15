'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { AccountSection } from '@/components/profile/AccountSection';
import { CalibrationSection } from '@/components/profile/CalibrationSection';
import { SavedRoutinesSection } from '@/components/profile/SavedRoutinesSection';
import { AutomationSection } from '@/components/profile/AutomationSection';
import { AuthProvider } from '@/context/AuthContext';

function ProfilePageContent() {
    return (
        <div className="min-h-screen bg-[#f4faf9]">
            <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
                <div>
                    <Link
                        href="/home"
                        className="inline-flex items-center gap-1 text-sm text-[#0d585f] hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to canvas
                    </Link>
                    <h1 className="mt-4 font-ibmplex text-2xl font-bold text-[#131515]">
                        Profile
                    </h1>
                </div>

                <AccountSection />
                <CalibrationSection />
                <SavedRoutinesSection />
                <AutomationSection />
            </div>
        </div>
    );
}

export default function ProfilePage() {
    return (
        <AuthProvider>
            <ProfilePageContent />
        </AuthProvider>
    );
}
