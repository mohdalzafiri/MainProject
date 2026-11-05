# MainProject 3.3.4 — 2026-11-05

- Desktop and mobile use the same release version.
- Monthly permission and lateness limits show warnings while allowing new entries and edits.
- Monthly totals continue accumulating after the limit; warnings persist for the selected month.
- Permission and attendance-after-absence status banners turn red when their respective limits are exceeded.
- Includes the current department normalization, permissions, statistics, notification and system-log updates.

Validation: ESLint, the required Prettier checks, and 101 automated tests passed.

Production data, generated employee documents, passwords and deployment backups are excluded from source releases. The central server remains the only database owner; subordinate packages contain the interface and API proxy only.
