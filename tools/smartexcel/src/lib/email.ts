// Transactional email via Resend (PRD §6.1). If no API key is configured we log
// instead of sending, so local dev works without credentials.

import { getConfig } from "@/lib/env";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  const cfg = getConfig();
  if (!cfg.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send. to=${to} subject="${subject}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: cfg.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}
