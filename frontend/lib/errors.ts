import { AuthError } from '@/lib/auth-api';

/**
 * An error whose message was written for end users (for example a validation
 * message from the backend that says which row/column is wrong). Only these
 * errors may have their message shown in the UI.
 */
export class UserFacingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UserFacingError';
    }
}

/**
 * Logs the raw error (backend message, stack trace, etc.) for debugging and
 * returns a message safe to show in the UI.
 *
 * Plain errors may carry raw backend/database strings, so they get a generic
 * message. Never surface `error.message` directly in UI. Throw a
 * `UserFacingError` when the message is meant for the user.
 *
 * `AuthError` is the other exception: its `message` is already a controlled,
 * user-facing string we authored ourselves (e.g. "Password must be at
 * least 8 characters."), not a raw backend/database error, so the
 * `validation` branch below passes it straight through.
 */
export function getUserFacingErrorMessage(error: unknown): string {
    console.error(error);

    if (error instanceof UserFacingError) {
        return error.message;
    }

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
