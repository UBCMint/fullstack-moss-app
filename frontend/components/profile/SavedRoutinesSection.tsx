import { ComingSoonPlaceholder } from '@/components/profile/ComingSoonPlaceholder';

// Task 51 replaces this component's body with the real routines list
// (name, step count, last run, rename/delete/run) — the profile page
// itself doesn't need to change to pick it up.
export function SavedRoutinesSection() {
    return (
        <ComingSoonPlaceholder
            title="Saved routines"
            description="Your saved routines will show up here, with how many steps each has and when you last ran it. You'll be able to rename, delete, or run any of them."
        />
    );
}
