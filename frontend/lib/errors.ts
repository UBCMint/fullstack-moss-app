import { AuthError } from '@/lib/auth-api';

/**
 * Logs the raw error (backend message, stack trace, etc.) for debugging and
 * returns a generic, user-facing message. Never surface `error.message`
 * directly in UI — it may be a raw backend/database error string.
 *
 * `AuthError` is the one exception: its `message` is already a controlled,
 * user-facing string we authored ourselves (e.g. "Password must be at
 * least 8 characters."), not a raw backend/database error, so the
 * `validation` branch below passes it straight through.
 */
export function getUserFacingErrorMessage(error: unknown): string {
    console.error(error);

    if (error instanceof AuthError) {
        switch (error.kind) {
            case 'unauthorized':
                return 'Incorrect email or password. Please try again.';
            case 'duplicate_account':
                return 'That email is already registered. Try logging in.';
            case 'validation':
                return error.message;
            case 'network':
                return 'Unable to connect to the server. Please try again later.';
            default:
                break;
        }
    }

    return 'Something went wrong. Please try again.';
}
