import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { orderForCouncil, type PackDoc } from "@/lib/council-pack";
import { docLabel } from "@/lib/prc-docs";
import { resolveDocClass, type PartyRole } from "@/lib/doc-classes";

export const runtime = "nodejs";

// Merge a matter's documents into ONE PDF, in council order (see
// lib/council-pack.ts), for submission. Council rejects multi-file packs and
// reads only the first document, so order and single-file matter.
//
// Staff only — council submission is ConveyClear's job. Built from the matter's
// OWN documents: a reused transfer document (deed search etc.) is already a
// matter `documents` row once "From transfer" has been clicked, so staff reuse
// what they need onto the matter first, then merge.

/** The classes a caller may ask for — the matter page's four groups. */
const PACK_CLASSES = ["input", "supporting", "output", "other"];

const MAX_DOCS = 40; // a sane ceiling; a real pack is ~5–10 documents

function sanitizeFilename(s: string): string {
  return (s || "matter").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!rateLimit(`council-pack:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Staff only" }, { status: 403 });
  }

  /**
   * Which document classes to include.
   *
   * Zewn to Jukka, 2026-09-01 meeting: "what I'm going to do for the council
   * pack is I'm going to say you can select whether you want input, supporting,
   * output, and other. And you can select multiple as well — like if you need
   * all the input documents and all the supporting documents, you can tick
   * those two and it'll pack those."
   *
   * Omitted (or empty) means EVERYTHING, which is what the button did before
   * this and what an older client calling this route still gets. A council pack
   * that silently narrowed itself would be worse than one page too many —
   * Jukka's own rule is that if it is not in the file, they do not scroll.
   */
  let wanted: string[] = [];
  try {
    const body = (await request.json()) as { classes?: unknown };
    if (Array.isArray(body?.classes)) {
      wanted = body.classes
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.toLowerCase())
        .filter((c) => PACK_CLASSES.includes(c));
    }
  } catch {
    // No body at all — the pre-2026-09-01 call shape. Everything.
  }

  // Matter (RLS read authorises access) + title for the filename.
  const { data: matter } = await supabase
    .from("matters")
    .select("id, title, municipality")
    .eq("id", id)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  const admin = createAdminClient();

  const { data: docRows } = await admin
    .from("documents")
    .select("id, document_type, matter_party_id, file_name, mime_type, storage_bucket, storage_path")
    .eq("matter_id", id)
    .eq("document_status", "provided");
  const withFiles = ((docRows as PackDoc[] | null) ?? []).filter((d) => d.storage_path);
  if (withFiles.length === 0) {
    return NextResponse.json({ message: "This matter has no documents to merge yet." }, { status: 400 });
  }

  const { data: partyRows } = await admin.from("matter_parties").select("id, role").eq("matter_id", id);
  const partyRoleById: Record<string, string> = {};
  for (const p of (partyRows as { id: string; role: string }[] | null) ?? []) partyRoleById[p.id] = p.role;

  // Class is resolved the same way the matter page groups them, so what staff
  // ticked is what they were looking at. `other` means "the resolver had to fall
  // back" — it is a real bucket on the page, so it is selectable here too.
  const municipality = (matter as { municipality?: string | null }).municipality ?? null;
  const classOf = (d: PackDoc): string => {
    const role = d.matter_party_id ? partyRoleById[d.matter_party_id] : null;
    return resolveDocClass(municipality, d.document_type, role as PartyRole);
  };
  const docs =
    wanted.length === 0
      ? withFiles
      : withFiles.filter((d) => wanted.includes(classOf(d)));
  if (docs.length === 0) {
    return NextResponse.json(
      { message: "No documents on this matter are in the classes you picked." },
      { status: 400 }
    );
  }

  const { ordered, leftover } = orderForCouncil(docs, partyRoleById);
  const sequence = [...ordered, ...leftover].slice(0, MAX_DOCS);

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  // A visible marker page when a document can't be merged (corrupt, or a format
  // pdf-lib can't embed — e.g. WebP). Better than a silently missing document.
  const notecard = (title: string, reason: string) => {
    const page = out.addPage([595.28, 841.89]);
    page.drawText("Document could not be included", { x: 56, y: 780, size: 14, font, color: rgb(0.7, 0.1, 0.1) });
    page.drawText(title.slice(0, 90), { x: 56, y: 752, size: 11, font });
    page.drawText(reason.slice(0, 90), { x: 56, y: 732, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText("Attach this document to the council submission separately.", {
      x: 56, y: 706, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });
  };

  for (const d of sequence) {
    const label = `${docLabel(d.document_type)} — ${d.file_name || "file"}`;
    try {
      const { data: blob, error } = await admin.storage
        .from(d.storage_bucket || "matter-documents")
        .download(d.storage_path as string);
      if (error || !blob) {
        notecard(label, "The stored file could not be downloaded.");
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = (d.mime_type || "").toLowerCase();

      if (mime.includes("pdf")) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else if (mime.includes("jpeg") || mime.includes("jpg")) {
        const img = await out.embedJpg(bytes);
        const page = out.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else if (mime.includes("png")) {
        const img = await out.embedPng(bytes);
        const page = out.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else {
        // WebP and anything else pdf-lib can't embed.
        notecard(label, `Unsupported format (${mime || "unknown"}) — re-upload as PDF or JPG.`);
      }
    } catch {
      notecard(label, "The file is corrupt or unreadable.");
    }
  }

  if (out.getPageCount() === 0) {
    return NextResponse.json({ message: "None of the matter's documents could be merged." }, { status: 400 });
  }

  const merged = await out.save();
  const filename = `${sanitizeFilename(matter.title || "matter")}_council_pack.pdf`;
  return new NextResponse(Buffer.from(merged), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
