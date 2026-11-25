/**
 * Public cron alias for Task Manager automated follow-up reminders.
 * Lives under /api/cron/* so middleware.ts allows server-to-server GitHub Actions
 * calls through without a session cookie; CRON_SECRET Bearer auth is enforced
 * inside app/api/task-manager/cron/overdue/route.ts.
 */
export { GET, POST, runtime } from '@/app/api/task-manager/cron/overdue/route'
