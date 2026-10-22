/**
 * Logs the raw error (backend message, stack trace, etc.) for debugging and
 * returns a generic, user-facing message. Never surface `error.message`
 * directly in UI — it may be a raw backend/database error string.
 */
export function getUserFacingErrorMessage(error: unknown): string {
    console.error(error);
    return 'Something went wrong. Please try again.';
}
