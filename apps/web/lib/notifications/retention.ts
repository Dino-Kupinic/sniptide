// Read notifications are deleted after the first of these (days since they were read), unread ones
// after the second (days since they were made). Run by the maintenance job in
// lib/pastes/purge.ts.
export const READ_RETENTION_DAYS = 30
export const UNREAD_RETENTION_DAYS = 90
