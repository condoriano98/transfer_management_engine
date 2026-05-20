/**
 * Multi-channel approval notifier. Each channel is best-effort and isolated;
 * failures in one don't block the others.
 */
export type ApprovalNotification = {
  org_name: string;
  request_id: string;
  amount: number;
  currency: string;
  from_account: string;
  to_account: string;
  requested_by: string;
  approval_url: string;
};

async function sendTeams(n: ApprovalNotification) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return;
  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", size: "Medium", weight: "Bolder", text: `Transfer approval — ${n.org_name}` },
            { type: "FactSet", facts: [
              { title: "From",   value: n.from_account },
              { title: "To",     value: n.to_account },
              { title: "Amount", value: `${n.currency} ${n.amount.toLocaleString()}` },
              { title: "By",     value: n.requested_by },
            ] },
          ],
          actions: [
            { type: "Action.OpenUrl", title: "Open in app", url: n.approval_url },
          ],
        },
      },
    ],
  };
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  }).catch(() => undefined);
}

async function sendSlack(n: ApprovalNotification) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Transfer approval needed — ${n.org_name}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Transfer approval needed" } },
        { type: "section", fields: [
          { type: "mrkdwn", text: `*From:*\n${n.from_account}` },
          { type: "mrkdwn", text: `*To:*\n${n.to_account}` },
          { type: "mrkdwn", text: `*Amount:*\n${n.currency} ${n.amount.toLocaleString()}` },
          { type: "mrkdwn", text: `*By:*\n${n.requested_by}` },
        ] },
        { type: "actions", elements: [
          { type: "button", text: { type: "plain_text", text: "Open in app" }, url: n.approval_url },
        ] },
      ],
    }),
  }).catch(() => undefined);
}

async function sendEmail(n: ApprovalNotification, to: string[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || to.length === 0) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL ?? "alerts@example.com",
      to,
      subject: `Transfer approval needed — ${n.currency} ${n.amount.toLocaleString()}`,
      html: `<p>${n.requested_by} requested a transfer from <b>${n.from_account}</b> to <b>${n.to_account}</b>.</p>
             <p><a href="${n.approval_url}">Review in app</a></p>`,
    }),
  }).catch(() => undefined);
}

export async function notifyApprovers(
  n: ApprovalNotification,
  emails: string[] = [],
) {
  await Promise.allSettled([sendTeams(n), sendSlack(n), sendEmail(n, emails)]);
}
