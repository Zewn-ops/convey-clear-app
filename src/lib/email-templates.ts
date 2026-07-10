// Branded HTML email bodies. SERVER-ONLY.
// Table-based, inline styles, no external assets — the lowest common denominator
// that survives Outlook and Gmail's stripping. Mirrors the existing
// email-templates/*.html files used for Supabase auth mail.

const NAVY = "#1B2E6B";
const ORANGE = "#E8521A";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

function shell(bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td style="background:${NAVY};padding:20px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px;">ConveyClear</span>
    </td></tr>
    <tr><td style="padding:24px;color:#1f2937;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 24px 24px;border-top:1px solid #eef0f3;color:#9aa1ab;font-size:12px;line-height:1.5;">
      ${footerHtml}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr>
    <td style="background:${ORANGE};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:11px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
    </td></tr></table>`;
}

/** #5 — a matter moved to a new PHASE. The only lifecycle email we send. */
export function phaseChangeEmail(args: {
  matterTitle: string;
  phaseLabel: string;
  matterUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const title = escapeHtml(args.matterTitle);
  const phase = escapeHtml(args.phaseLabel);
  return {
    subject: `${args.matterTitle}: ${args.phaseLabel}`,
    html: shell(
      `<p style="margin:0 0 12px;">Your matter <strong>${title}</strong> has moved to a new phase:</p>
       <p style="margin:0;padding:12px 16px;background:#f7f8fa;border-left:3px solid ${ORANGE};border-radius:4px;">
         <strong style="color:${NAVY};">${phase}</strong>
       </p>
       ${button(args.matterUrl, "View the matter")}
       <p style="margin:0;color:#6b7280;font-size:13px;">You are receiving this because you are a party to this matter.</p>`,
      `ConveyClear · Johannesburg, South Africa<br/>
       <a href="${args.unsubscribeUrl}" style="color:#9aa1ab;">Unsubscribe from matter emails</a>`
    ),
  };
}

/** Auto client-login — credentials for a freshly provisioned account. */
export function credentialsEmail(args: {
  loginUrl: string;
  email: string;
  tempPassword: string;
}): { subject: string; html: string } {
  return {
    subject: "Your ConveyClear portal login",
    html: shell(
      `<p style="margin:0 0 12px;">An account has been created for you on the ConveyClear portal, where you can track your matters and upload documents.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f7f8fa;border-radius:8px;width:100%;">
         <tr><td style="padding:14px 16px;font-size:14px;">
           <div style="color:#6b7280;font-size:12px;">Email</div>
           <div style="font-weight:600;color:${NAVY};margin-bottom:10px;">${escapeHtml(args.email)}</div>
           <div style="color:#6b7280;font-size:12px;">Temporary password</div>
           <div style="font-weight:600;color:${NAVY};font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(args.tempPassword)}</div>
         </td></tr>
       </table>
       ${button(args.loginUrl, "Sign in")}
       <p style="margin:0;padding:10px 14px;background:#fff8f4;border:1px solid #ffd9c6;border-radius:6px;color:#8a4b28;font-size:13px;">
         Please change this password immediately after signing in. ConveyClear staff will never ask you for it.
       </p>`,
      // No unsubscribe: this is a transactional account email, not marketing.
      `ConveyClear · Johannesburg, South Africa<br/>
       If you were not expecting this email, please ignore it or contact us.`
    ),
  };
}
