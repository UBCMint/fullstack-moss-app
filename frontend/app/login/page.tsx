'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { AuthCard } from '@/components/auth/AuthCard';
import { AuthField } from '@/components/auth/AuthField';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { Button } from '@/components/ui/button';
import { AuthError, login } from '@/lib/auth-api';
import { getUserFacingErrorMessage } from '@/lib/errors';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<{
        title: string;
        message: string;
    } | null>(
        searchParams.get('sessionExpired')
            ? {
                  title: 'Session expired',
                  message: 'Your session expired. Please log in again.',
              }
            : null
    );

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login({ email, password });
            router.push('/home');
        } catch (err) {
            const title =
                err instanceof AuthError && err.kind === 'network'
                    ? 'Connection error'
                    : 'Unable to log in';
            setError({ title, message: getUserFacingErrorMessage(err) });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthCard title="Welcome back">
            <form className="flex flex-col gap-[20px]" onSubmit={handleSubmit}>
                <AuthField
                    id="email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <AuthField
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                {error && (
                    <AuthErrorBanner
                        title={error.title}
                        message={error.message}
                    />
                )}

                <Button
                    type="submit"
                    variant="auth"
                    size="auth"
                    disabled={submitting}
                >
                    {submitting ? 'Logging in…' : 'Login'}
                </Button>

                <p className="text-center font-ibmplex text-xs text-[#605454]">
                    {"Don't have an account? "}
                    <Link
                        href="/signup"
                        className="font-medium text-[#0d585f] underline"
                    >
                        Sign up
                    </Link>
                </p>
            </form>
        </AuthCard>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
