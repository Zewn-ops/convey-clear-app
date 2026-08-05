"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Mail, Copy, Code2 } from "lucide-react";
import Card from "@/components/ui/Card";

// In-portal ConveyClear email-signature builder (admin tab). Same output as the
// standalone email-signatures/signature-builder.html, so the two never diverge.
//
// The fix this embodies: images are absolute https:// URLs served from the
// portal's public/email/ folder (NO cid: attachments), so nothing collides on a
// reply. Every value is real text, so the signature still reads if a recipient's
// client blocks images.

const BASE = "https://portal.conveyclear.co.za/email/";

type Person = { name: string; title: string; email: string; phone: string };

// Known roster — titles marked TBC still need Jukka's confirmation.
const PEOPLE: Person[] = [
  { name: "Jukka Höll", title: "Director", email: "jukka@conveyclear.co.za", phone: "" },
  { name: "Franzu", title: "Local Department", email: "local@conveyclear.co.za", phone: "" },
  { name: "Francois", title: "Services Manager", email: "", phone: "" },
  { name: "Claudine", title: "Operations", email: "", phone: "" },
  { name: "Andrew", title: "", email: "", phone: "" },
];

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function signoffBlock(text: string): string {
  const t = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  const html = t.split("\n").map(esc).join("<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin:0 0 14px 0;">${html}</div>`;
}

function buildSignature(v: {
  name: string;
  title: string;
  phone: string;
  email: string;
  signoff: string;
}): string {
  const phoneLink = (v.phone || "").replace(/[^\d+]/g, "");
  const contactRows =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#333333;line-height:1.5;border-collapse:collapse;">` +
    `<tr><td width="26" style="padding:0 8px 6px 0;vertical-align:middle;"><img src="${BASE}phone.png" alt="Phone" width="12" height="20" style="display:block;border:0;outline:none;width:12px;height:20px;" /></td><td style="padding:0 0 6px 0;vertical-align:middle;"><a href="tel:${esc(phoneLink)}" style="color:#333333;text-decoration:none;">${esc(v.phone)}</a></td></tr>` +
    `<tr><td width="26" style="padding:0 8px 6px 0;vertical-align:middle;"><img src="${BASE}envelope.png" alt="Email" width="18" height="18" style="display:block;border:0;outline:none;width:18px;height:18px;" /></td><td style="padding:0 0 6px 0;vertical-align:middle;"><a href="mailto:${esc(v.email)}" style="color:#1B2E6B;text-decoration:underline;">${esc(v.email)}</a></td></tr>` +
    `<tr><td width="26" style="padding:0 8px 6px 0;vertical-align:middle;"><img src="${BASE}website.png" alt="Website" width="18" height="18" style="display:block;border:0;outline:none;width:18px;height:18px;" /></td><td style="padding:0 0 6px 0;vertical-align:middle;"><a href="https://conveyclear.co.za" style="color:#1B2E6B;text-decoration:underline;">conveyclear.co.za</a></td></tr>` +
    `<tr><td width="26" style="padding:0 8px 0 0;vertical-align:middle;"><img src="${BASE}pin.png" alt="Offices" width="13" height="20" style="display:block;border:0;outline:none;width:13px;height:20px;" /></td><td style="vertical-align:middle;">PTA&nbsp;|&nbsp;JHB&nbsp;|&nbsp;CPT</td></tr>` +
    `</table>`;
  return (
    signoffBlock(v.signoff) +
    // Layout matches the legacy signature: logo across the top, then name +
    // title + contacts on the LEFT with the "Your Key In Property" tagline to
    // their RIGHT (no divider line).
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;color:#333333;font-size:12px;line-height:1.4;border-collapse:collapse;">` +
    `<tr><td colspan="2" style="padding:0 0 14px 0;"><img src="${BASE}logo.png" alt="ConveyClear" width="320" height="85" style="display:block;border:0;outline:none;text-decoration:none;width:320px;height:85px;" /></td></tr>` +
    `<tr>` +
    `<td style="vertical-align:top;padding:0 28px 0 0;">` +
    `<div style="font-size:17px;font-weight:bold;color:#1B2E6B;font-family:Arial,Helvetica,sans-serif;">${esc(v.name)}</div>` +
    `<div style="font-size:13px;color:#E8521A;padding:2px 0 12px 0;font-family:Arial,Helvetica,sans-serif;">${esc(v.title)}</div>` +
    contactRows +
    `</td>` +
    `<td style="vertical-align:middle;">` +
    `<img src="${BASE}tagline.png" alt="Your Key In Property" width="130" height="91" style="display:block;border:0;outline:none;text-decoration:none;width:130px;height:91px;" />` +
    `</td>` +
    `</tr>` +
    `</table>`
  );
}

export default function SignatureBuilder() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [signoff, setSignoff] = useState("Kind Regards / Vriendelike Groete,");
  const [showSource, setShowSource] = useState(false);

  const html = buildSignature({ name, title, phone, email, signoff });
  const input =
    "w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action";

  async function copySignature() {
    const text = new DOMParser().parseFromString(html, "text/html").body.innerText;
    try {
      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        toast.success("Copied — paste into Gmail's signature box");
        return;
      }
    } catch {
      /* fall through */
    }
    // Fallback: select the rendered preview and copy.
    const el = document.getElementById("sig-preview");
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      try {
        document.execCommand("copy");
        toast.success("Copied — paste into Gmail's signature box");
      } catch {
        toast.error("Select the preview and copy manually");
      }
      sel?.removeAllRanges();
    }
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(html);
      toast.success("HTML source copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  function applyPreset(idx: number) {
    const p = PEOPLE[idx];
    setName(p.name);
    setTitle(p.title);
    setEmail(p.email);
    setPhone(p.phone);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <Mail className="h-5 w-5 text-action" /> Email Signatures
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Fill the fields, preview, copy, and paste into Gmail. Logo, tagline, website and offices are fixed.
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-3">Quick-fill a known person (optional)</label>
            <select
              className={`${input} mt-1`}
              defaultValue=""
              onChange={(e) => e.target.value !== "" && applyPreset(Number(e.target.value))}
            >
              <option value="">— start blank —</option>
              {PEOPLE.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                  {p.title ? ` — ${p.title}` : " — (title TBC)"}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-ink-3">Full name</label>
              <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jukka Höll" />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-3">Job title</label>
              <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Director" />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-3">Direct phone</label>
              <input className={`${input} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 12 345 6789" />
              <p className="mt-1 text-[11px] text-ink-3">Type it how it should read — the clickable link is derived automatically.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-3">Email address</label>
              <input className={`${input} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jukka@conveyclear.co.za" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-3">Sign-off above the signature (optional)</label>
            <textarea className={`${input} mt-1 resize-y`} rows={2} value={signoff} onChange={(e) => setSignoff(e.target.value)} />
            <p className="mt-1 text-[11px] text-ink-3">
              A fixed sign-off shown above the logo. Leave blank for none. The email message itself is still typed fresh each time.
            </p>
          </div>
        </div>
      </Card>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">Preview</p>
        <Card>
          <div id="sig-preview" className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
        </Card>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={copySignature}
            className="inline-flex items-center gap-1.5 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:bg-action-fill/90"
          >
            <Copy className="h-4 w-4" /> Copy signature
          </button>
          <button
            onClick={() => setShowSource((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-4 py-2 text-sm font-medium text-action hover:bg-line"
          >
            <Code2 className="h-4 w-4" /> {showSource ? "Hide" : "Show"} HTML source
          </button>
        </div>
      </div>

      {showSource && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">HTML source (for the API deploy / advanced)</p>
            <button onClick={copySource} className="text-xs font-medium text-action hover:underline">Copy source</button>
          </div>
          <textarea readOnly value={html} rows={8} className="bg-surface text-ink w-full rounded-lg border border-line p-3 font-mono text-[11px] text-ink-2" />
        </Card>
      )}

      <Card accent="internal">
        <h2 className="text-sm font-semibold text-ink">How to use in Gmail</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-ink-2 leading-relaxed list-disc pl-4">
          <li><b>Web:</b> Gmail → ⚙ See all settings → General → Signature → create/edit → click into the box → paste (Ctrl/Cmd+V) → Save Changes. Use <b>Copy signature</b>, not the HTML source.</li>
          <li><b>Mobile:</b> the Gmail app has its own signature field that does not sync from web — set a short text version there per person.</li>
          <li><b>Disclaimer:</b> the confidentiality footer goes in the Google Admin console (Apps → Gmail → Compliance → Append footer), never in a personal signature.</li>
        </ul>
      </Card>
    </div>
  );
}
