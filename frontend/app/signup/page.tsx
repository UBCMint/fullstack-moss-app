'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthCard } from '@/components/auth/AuthCard';
import { AuthField } from '@/components/auth/AuthField';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { Button } from '@/components/ui/button';
import { AuthError, login, signUp } from '@/lib/auth-api';
import { getUserFacingErrorMessage } from '@/lib/errors';

// Signup doesn't log the user in by itself (POST /users just creates the
// account), so on success we immediately log in with the same credentials
// to land the user straight in the app instead of bouncing them to /login.
export default function SignupPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<{
        title: string;
        message: string;
    } | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError({
                title: 'Unable to sign up',
                message: 'Password must be at least 8 characters.',
            });
            return;
        }
        if (password !== confirmPassword) {
            setError({
                title: 'Unable to sign up',
                message: 'Passwords do not match.',
            });
            return;
        }

        setSubmitting(true);
        try {
            await signUp({ username, email, password });
            await login({ email, password });
            router.push('/home');
        } catch (err) {
            const title =
                err instanceof AuthError && err.kind === 'network'
                    ? 'Connection error'
                    : 'Unable to sign up';
            setError({ title, message: getUserFacingErrorMessage(err) });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthCard title="Create your account">
            <form className="flex flex-col gap-[20px]" onSubmit={handleSubmit}>
                <AuthField
                    id="username"
                    label="Username"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
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
                    autoComplete="new-password"
                    hint="Minimum 8 characters"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <AuthField
                    id="confirm-password"
                    label="Confirm password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                    {submitting ? 'Signing up…' : 'Sign Up'}
                </Button>

                <p className="text-center font-ibmplex text-xs text-[#605454]">
                    Already have an account?{' '}
                    <Link
                        href="/login"
                        className="font-medium text-[#0d585f] underline"
                    >
                        Login
                    </Link>
                </p>
            </form>
        </AuthCard>
    );
}
