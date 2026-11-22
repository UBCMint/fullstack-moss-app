import { ComingSoonPlaceholder } from '@/components/profile/ComingSoonPlaceholder';

// Task 51 replaces this component's body with the real calibration view
// (date, status, "Recalibrate" button) — the profile page itself doesn't
// need to change to pick it up.
export function CalibrationSection() {
    return (
        <ComingSoonPlaceholder
            title="Calibration"
            description="See the date and status of your active calibration, and recalibrate whenever you need to."
        />
    );
}
