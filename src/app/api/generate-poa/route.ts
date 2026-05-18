import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const N8N_BASE = process.env.N8N_WEBHOOK_URL ?? "https://n8n.conveyclear.co.za";

interface ClientData {
  entity_type: string | null;
  full_name: string | null;
  business_name: string | null;
  id_number: string | null;
  registration_no: string | null;
  link_id: string | null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  // Fetch client data from n8n webhook
  let client: ClientData;
  try {
    const res = await fetch(`${N8N_BASE}/webhook/client-data?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`n8n status ${res.status}`);
    const rows: ClientData[] = await res.json();
    client = rows[0];
    if (!client?.link_id) {
      return new NextResponse("Invalid or expired token", { status: 404 });
    }
  } catch {
    return new NextResponse("Failed to fetch client data", { status: 502 });
  }

  const fullName = client.full_name ?? "";
  const idNumber = client.id_number ?? "";
  const isBusiness = client.entity_type === "business" || client.entity_type === "trust";
  const company = client.business_name ?? "";
  const regNo = client.registration_no ?? "";

  // Build PDF
  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const W = 595.28; // A4 width pts
  const H = 841.89; // A4 height pts
  const margin = 56;
  const lineW = W - margin * 2;
  const page = pdfDoc.addPage([W, H]);

  let y = H - margin;

  function drawText(text: string, font: typeof bold, size: number, indent = 0, gap = 4) {
    const x = margin + indent;
    const maxW = lineW - indent;
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0) });
        y -= size + gap;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0) });
      y -= size + gap;
    }
  }

  function blank(label: string, indent = 0) {
    const x = margin + indent;
    page.drawText("_".repeat(50), { x, y, size: 10, font: regular, color: rgb(0.4, 0.4, 0.4) });
    y -= 10;
    page.drawText(label, { x, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });
    y -= 16;
  }

  function gap(pts = 8) { y -= pts; }

  // Title
  const title = "POWER OF ATTORNEY";
  const titleW = bold.widthOfTextAtSize(title, 16);
  page.drawText(title, { x: (W - titleW) / 2, y, size: 16, font: bold, color: rgb(0, 0, 0) });
  y -= 28;

  // Opening line
  drawText("I,", regular, 10);
  y += 10;
  gap(-2);
  // Name field — pre-filled or blank
  if (fullName) {
    drawText(fullName, bold, 10);
    gap(-2);
    drawText("(Full Name and Surname)", regular, 8);
  } else {
    blank("(Full Name and Surname)");
  }
  gap(2);

  drawText(`with Identity Number`, regular, 10);
  y += 10;
  gap(-2);
  if (idNumber) {
    drawText(idNumber, bold, 10);
    gap(-2);
    drawText("(Identity Number)", regular, 8);
  } else {
    blank("(Identity Number)");
  }
  gap(2);

  if (isBusiness) {
    drawText("representing", regular, 10);
    y += 10;
    gap(-2);
    if (company) {
      drawText(company, bold, 10);
      gap(-2);
      drawText("(Company)", regular, 8);
    } else {
      blank("(Company)");
    }
    gap(2);

    drawText("With registration number", regular, 10);
    y += 10;
    gap(-2);
    if (regNo) {
      drawText(regNo, bold, 10);
      gap(-2);
      drawText("(Registration Number)", regular, 8);
    } else {
      blank("(Registration Number)");
    }
    gap(2);
  }

  gap(4);
  drawText(
    "do hereby give ConveyClear (Pty) Ltd with registration number 2025/057574/07 power of attorney, which shall specifically include, but not be limited to, the authority to perform the following services on my behalf for the property described as:",
    regular, 10
  );
  gap(4);
  blank("(Property Description / Address)");
  drawText("at any Municipality and Local Authority in South Africa:", regular, 10);
  gap(8);

  // Services
  drawText("I. Administrative Support: Municipal Account Queries (MAQ)", bold, 9);
  gap(2);
  drawText(
    "ACCOUNT MANAGEMENT SERVICES: Account Statement Management, Dispute Resolution, Billing Issues Resolution, Account Repayments & Reconnections, Payment Arrangements & Settlements, Debt relief applications, Consolidate Accounts, Submit Meter Readings, Check Journals, and Set Billing Dates.",
    regular, 9, 12
  );
  gap(4);
  drawText(
    "Non-Profit Organization Account Management: Assisting with Application for Rates Rebates with Council and Maintaining Benefits by assisting with annual re-applying.",
    regular, 9, 12
  );
  gap(4);
  drawText(
    "Council — Rates Clearance Figures/Certificates: Unsticking Clearance Figures and Obtaining Clearance Certificates.",
    regular, 9, 12
  );
  gap(4);
  drawText(
    "Property Management: Property Valuations; Objections of Municipal Valuations, Upliftment of Conditions of Title Deeds, obtaining Tshwane Letterheads for Clearances covering all erven.",
    regular, 9, 12
  );
  gap(4);
  drawText(
    "Building Control: Navigating Regulations and Certifications: Collection and delivery of Existing Building Plans; Occupational Certificate Procurement.",
    regular, 9, 12
  );
  gap(12);

  // Effective date
  drawText(
    "This Power of Attorney shall be effective from the date of my signature below and shall remain in full force and effect until:",
    regular, 10
  );
  gap(2);
  blank("(Expiry Date)");
  drawText("or until revoked by me in writing prior to that date.", regular, 10);
  gap(12);

  // Date
  drawText("Dated this ______ day of ______________________, 20______.", regular, 10);
  gap(20);

  // Signatures
  function sigLine(label: string) {
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 200, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 12;
    drawText(label, regular, 9);
    gap(12);
  }

  sigLine("[Client Signature]");
  sigLine("[Witness 1 Signature]");
  sigLine("[Witness 2 Signature]");

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Power of Attorney - ConveyClear.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
