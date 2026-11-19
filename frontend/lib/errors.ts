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
 * message. Throw a `UserFacingError` when the message is meant for the user.
 */
export function getUserFacingErrorMessage(error: unknown): string {
    console.error(error);
    if (error instanceof UserFacingError) {
        return error.message;
    }
    return 'Something went wrong. Please try again.';
}
