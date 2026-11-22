'use client';

import { FormEvent, useState } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { AuthError, changePassword, deleteAccount } from '@/lib/auth-api';
import { getUserFacingErrorMessage } from '@/lib/errors';

// The one section that's live this week — everything else on the profile
// page is a "Coming soon" placeholder until task 51.
export function AccountSection() {
    const { user, logout } = useAuth();

    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [passwordSubmitting, setPasswordSubmitting] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    if (!user) {
        return null;
    }

    const memberSince = new Date(user.created_at).toLocaleDateString(
        undefined,
        { year: 'numeric', month: 'long', day: 'numeric' }
    );

    function resetPasswordForm() {
        setIsChangingPassword(false);
        setPasswordError(null);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
    }

    async function handleChangePassword(e: FormEvent) {
        e.preventDefault();
        setPasswordError(null);
        setPasswordSuccess(false);

        if (newPassword.length < 8) {
            setPasswordError('Password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }

        setPasswordSubmitting(true);
        try {
            await changePassword({ currentPassword, newPassword });
            resetPasswordForm();
            setPasswordSuccess(true);
        } catch (err) {
            // The backend's own wording here ("Current password is
            // incorrect.") is specific to this form; getUserFacingErrorMessage's
            // generic 'unauthorized' copy is written for the login page instead.
            if (err instanceof AuthError && err.kind === 'unauthorized') {
                setPasswordError('Current password is incorrect.');
            } else {
                setPasswordError(getUserFacingErrorMessage(err));
            }
        } finally {
            setPasswordSubmitting(false);
        }
    }

    async function handleDeleteAccount() {
        setDeleteError(null);
        setDeleting(true);
        try {
            await deleteAccount();
            // logout() clears the now-orphaned session cookie and sends the
            // user to /login — there's no account left to stay logged into.
            await logout();
        } catch (err) {
            setDeleteError(getUserFacingErrorMessage(err));
            setDeleting(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-semibold text-[#131515]">
                    Account
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between gap-4">
                        <span className="text-[#605454]">Username</span>
                        <span className="font-medium text-black">
                            {user.username}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="text-[#605454]">Email</span>
                        <span className="font-medium text-black">
                            {user.email}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="text-[#605454]">Member since</span>
                        <span className="font-medium text-black">
                            {memberSince}
                        </span>
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => logout()}
                >
                    Log out
                </Button>

                <div className="border-t pt-6">
                    {!isChangingPassword ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-fit"
                            onClick={() => {
                                setIsChangingPassword(true);
                                setPasswordSuccess(false);
                            }}
                        >
                            Change password
                        </Button>
                    ) : (
                        <form
                            className="flex max-w-sm flex-col gap-4"
                            onSubmit={handleChangePassword}
                        >
                            <AuthField
                                id="current-password"
                                label="Current password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={currentPassword}
                                onChange={(e) =>
                                    setCurrentPassword(e.target.value)
                                }
                            />
                            <AuthField
                                id="new-password"
                                label="New password"
                                type="password"
                                autoComplete="new-password"
                                hint="Minimum 8 characters"
                                required
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            <AuthField
                                id="confirm-new-password"
                                label="Confirm new password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmNewPassword}
                                onChange={(e) =>
                                    setConfirmNewPassword(e.target.value)
                                }
                            />

                            {passwordError && (
                                <AuthErrorBanner
                                    title="Unable to change password"
                                    message={passwordError}
                                />
                            )}

                            <div className="flex gap-2">
                                <Button
                                    type="submit"
                                    variant="auth"
                                    size="sm"
                                    disabled={passwordSubmitting}
                                >
                                    {passwordSubmitting
                                        ? 'Saving…'
                                        : 'Save password'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetPasswordForm}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    )}
                    {passwordSuccess && !isChangingPassword && (
                        <p className="mt-2 text-sm text-[#0d585f]">
                            Password changed successfully.
                        </p>
                    )}
                </div>

                <div className="border-t pt-6">
                    <p className="mb-2 text-sm font-semibold text-[#eb0000]">
                        Danger zone
                    </p>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="w-fit"
                            >
                                Delete account
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete your account?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This permanently deletes your account and
                                    every session and recording you&apos;ve
                                    saved. This can&apos;t be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            {deleteError && (
                                <AuthErrorBanner
                                    title="Unable to delete account"
                                    message={deleteError}
                                />
                            )}
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-[#eb0000] hover:bg-[#c40000]"
                                    disabled={deleting}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteAccount();
                                    }}
                                >
                                    {deleting ? 'Deleting…' : 'Delete account'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}
