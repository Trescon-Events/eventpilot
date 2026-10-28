/* Every kind of system alert EventPilot can raise. Adding a new kind = one entry here; the Super Admin then chooses who receives it (Admin > Super Admin > Alerts),
   and the code that raises it calls sendAlert(<key>, …) from app/lib/alerts/send.ts. Pure (no server imports) so the settings screen shares it. */

export type AlertType = { key: string; label: string; description: string }

export const ALERT_TYPES: AlertType[] = [
  { key: 'hubspot_sync_gap', label: 'HubSpot form not syncing', description: 'A HubSpot form submission has not reached EventPilot for 30+ minutes, or a form\'s HubSpot workflow was switched off or lost its re-enrollment setting.' },
]

export const alertTypeByKey = (key: string): AlertType | undefined => ALERT_TYPES.find(t => t.key === key)
