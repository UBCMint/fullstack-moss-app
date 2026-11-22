import { ComingSoonPlaceholder } from '@/components/profile/ComingSoonPlaceholder';

// Task 51 replaces this component's body with the real low/high toggle —
// the profile page itself doesn't need to change to pick it up.
export function AutomationSection() {
    return (
        <ComingSoonPlaceholder
            title="Automation preference"
            description="Choose low (default) or high automation. High only skips the per-step confirmation — it never skips the focus check, signal quality check, or emergency stop."
        />
    );
}
