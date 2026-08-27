import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateOnboardingToken } from "@/lib/onboard-token";

export const runtime = "nodejs";

/**
 * Pre-filled Power of Attorney for an onboarding link.
 *
 * n8n REMOVED 2026-08-27. This used to fetch the client through n8n's
 * `client-data` webhook — n8n acting as a proxy to a database this app is
 * already connected to. The hop bought nothing and could fail on its own: an
 * n8n restart, an expired TLS chain or a VPS hiccup turned a working POA into a
 * 502, on a public link a client is holding. Documents moved to Supabase
 * Storage on 06-18; this was the last of the Pipedrive-era plumbing on a
 * request path.
 *
 * Token validation is now the same `validateOnboardingToken` the /onboard page
 * uses, so a link that renders the form and a link that produces the POA can no
 * longer disagree about whether it is valid. They were two implementations of
 * one rule, and the old one here checked neither `used_at` nor `expires_at` —
 * it only asked whether a row came back.
 */

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  // Service-role: whoever holds an onboarding link is a public visitor with no
  // session, exactly as on /onboard. The token IS the authorisation.
  const { data: client, error } = await validateOnboardingToken(createAdminClient(), token);
  if (!client) return new NextResponse(error ?? "Invalid or expired token", { status: 404 });

  const fullName     = client.full_name     ?? "";
  const idNumber     = client.id_number     ?? "";
  // TokenData folds `trust` into `business`, and both take the representative
  // form of the POA ("I, <person>, representing <entity>") — the only
  // distinction this document draws.
  const isBusiness   = client.entity_type === "business";
  const company      = client.business_name ?? "";
  const regNo        = client.registration_no ?? "";

  const pdfDoc  = await PDFDocument.create();
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italic  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const W = 595.28;
  const H = 841.89;
  const ML = 56;
  const MR = 56;
  const maxW = W - ML - MR;

  const page = pdfDoc.addPage([W, H]);
  let y = H - 56;

  // ── helpers ───────────────────────────────────────────────────────────

  function wrapText(text: string, font: typeof bold, size: number, width: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(test, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawWrapped(
    text: string,
    font: typeof bold,
    size: number,
    x = ML,
    color = rgb(0, 0, 0),
    lineGap = 4
  ) {
    const width = W - x - MR;
    for (const line of wrapText(text, font, size, width)) {
      page.drawText(line, { x, y, size, font, color });
      y -= size + lineGap;
    }
  }

  function fieldRow(
    intro: string,
    value: string,
    hint: string,
    blankLen = 40
  ) {
    const gap = 6;
    // intro label on its own line
    drawWrapped(intro, regular, 10);
    y -= 2;

    if (value) {
      drawWrapped(value, bold, 10);
    } else {
      page.drawText("_".repeat(blankLen), { x: ML, y: y + 10, size: 10, font: regular, color: rgb(0.6, 0.6, 0.6) });
      y -= 4;
    }
    y -= 2;
    drawWrapped(hint, italic, 8, ML + 4, rgb(0.45, 0.45, 0.45), 2);
    y -= gap;
  }

  // ── title ─────────────────────────────────────────────────────────────
  const title = "POWER OF ATTORNEY";
  page.drawText(title, {
    x: (W - bold.widthOfTextAtSize(title, 16)) / 2,
    y,
    size: 16,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 30;

  // ── party fields ──────────────────────────────────────────────────────
  fieldRow("I,", fullName, "(Full Name and Surname)");
  fieldRow("with Identity Number", idNumber, "(Identity Number)");

  if (isBusiness) {
    fieldRow("representing", company, "(Company Name)");
    fieldRow("with registration number", regNo, "(Company Registration Number)");
  }

  // ── body paragraph ────────────────────────────────────────────────────
  y -= 4;
  drawWrapped(
    "do hereby give ConveyClear (Pty) Ltd with registration number 2025/057574/07 power of attorney, " +
    "which shall specifically include, but not be limited to, the authority to perform the following services " +
    "on my behalf for the property described as:",
    regular, 10
  );
  y -= 4;
  fieldRow("", "", "(Property Description / Address)");
  drawWrapped("at any Municipality and Local Authority in South Africa:", regular, 10);
  y -= 10;

  // ── services ──────────────────────────────────────────────────────────
  drawWrapped("I. Administrative Support: Municipal Account Queries (MAQ)", bold, 9);
  y -= 2;

  const services = [
    "ACCOUNT MANAGEMENT SERVICES: Account Statement Management, Dispute Resolution, Billing Issues Resolution, " +
      "Account Repayments & Reconnections, Payment Arrangements & Settlements, Debt relief applications, " +
      "Consolidate Accounts, Submit Meter Readings, Check Journals, and Set Billing Dates.",
    "Non-Profit Organization Account Management: Assisting with Application for Rates Rebates with Council " +
      "and Maintaining Benefits by assisting with annual re-applying.",
    "Council — Rates Clearance Figures/Certificates: Unsticking Clearance Figures and Obtaining Clearance Certificates.",
    "Property Management: Property Valuations; Objections of Municipal Valuations, Upliftment of Conditions " +
      "of Title Deeds, obtaining Tshwane Letterheads for Clearances covering all erven.",
    "Building Control: Navigating Regulations and Certifications: Collection and delivery of Existing Building Plans; " +
      "Occupational Certificate Procurement.",
  ];

  for (const s of services) {
    drawWrapped(s, regular, 9, ML + 14, rgb(0, 0, 0), 3);
    y -= 4;
  }
  y -= 6;

  // ── duration ──────────────────────────────────────────────────────────
  drawWrapped(
    "This Power of Attorney shall be effective from the date of my signature below and shall remain in full force and effect until:",
    regular, 10
  );
  y -= 2;
  fieldRow("", "", "(Expiry Date)", 35);
  drawWrapped("or until revoked by me in writing prior to that date.", regular, 10);
  y -= 12;

  // ── date ──────────────────────────────────────────────────────────────
  page.drawText("Dated this _______ day of __________________________, 20_______.", {
    x: ML, y, size: 10, font: regular, color: rgb(0, 0, 0),
  });
  y -= 28;

  // ── signatures ────────────────────────────────────────────────────────
  function sigBlock(label: string) {
    page.drawLine({
      start: { x: ML, y },
      end:   { x: ML + 220, y },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
    y -= 14;
    page.drawText(label, { x: ML, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 22;
  }

  sigBlock("Client Signature");
  sigBlock("Witness 1 Signature");
  sigBlock("Witness 2 Signature");

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Power of Attorney - ConveyClear.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
