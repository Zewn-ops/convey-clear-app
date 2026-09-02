import Card from "@/components/ui/Card";
import { FileQuestion } from "lucide-react";
import {
  SERVICE_ORDER,
  SERVICE_LABELS,
  councilServiceSpec,
  documentsOfClass,
  type ServiceCode,
} from "@/lib/councils";
import { PRC_SUBTYPES, docLabel } from "@/lib/prc-docs";
import { municipalityLabel } from "@/lib/utils";

/**
 * "If you want X, these are the documents we normally need."
 *
 * Zewn to Jukka, 2026-09-01 meeting: "we can have maybe a reference where we can
 * say if you're looking for existing building plans, these are the documents we
 * normally need. If you're looking for change of ownership, these are the
 * documents we normally need. If you're looking for PRC, these are the documents
 * we normally need."
 *
 * WHY IT IS A REFERENCE AND NOT A CHECKLIST. Jukka does not want the service
 * declared up front — he is selling a package: "I don't think we have to
 * indicate whether they need a specific service, it's just for them to upload
 * the basic documents." And nothing here is required: "we're not going to make
 * any of it required because they'll know, they'll have all the documents
 * already with them." So this tells an attorney what to bring without asking
 * them to commit to a service or blocking them for a file they do not have.
 *
 * It is generated from the council registry, not written out — the same source
 * the matter's own checklist uses. A list typed separately here would drift from
 * what the matter then asks for, which is the 066 mistake in prose form.
 *
 * FIRM-OWNED and OUTPUT documents are excluded: the firm's FFC autofills from
 * its record (§11.3), and what ConveyClear produces is not what an attorney
 * brings.
 */
export default function ExpectedDocuments({ municipality }: { municipality: string | null }) {
  const groups: { label: string; docs: string[] }[] = [];

  for (const code of SERVICE_ORDER) {
    if (code === "OTHER") continue; // by definition it has no list

    // PRC is three jobs with three lists, so it is shown as three.
    if (code === "PRC") {
      for (const stage of PRC_SUBTYPES) {
        const spec = councilServiceSpec(municipality, "PRC", stage.code);
        const docs = expected(spec);
        if (docs.length) groups.push({ label: stage.label, docs });
      }
      continue;
    }

    const spec = councilServiceSpec(municipality, code as ServiceCode, null);
    const docs = expected(spec);
    if (docs.length) groups.push({ label: SERVICE_LABELS[code as ServiceCode], docs });
  }

  if (groups.length === 0) return null;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <FileQuestion className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">What we normally need</h2>
      </div>
      <p className="mb-3 text-xs text-ink-3">
        For {municipalityLabel(municipality)}. Nothing here is required to send a request — upload
        what you have and the rest can follow.
      </p>
      <div className="space-y-2">
        {groups.map((g) => (
          <details key={g.label} className="group rounded-lg border border-line px-3 py-2">
            <summary className="cursor-pointer list-none text-sm font-medium text-ink">
              {g.label}
              <span className="ml-1.5 text-xs font-normal text-ink-3">({g.docs.length})</span>
            </summary>
            <ul className="mt-2 space-y-1">
              {g.docs.map((d) => (
                <li key={d} className="text-xs text-ink-2">
                  · {d}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </Card>
  );
}

/**
 * What the attorney brings: input and supporting, minus the firm's own.
 *
 * 🔴 A COUNCIL'S OWN WORD IS NOT ALWAYS THE PORTAL'S, and pretending otherwise
 * sent an attorney hunting for something that was there under another name. COT
 * writes "Statement" against three of its services; the upload picker calls it
 * "Municipal Account Statement" — Zewn, 2026-09-02: "when i search statement in
 * the doc upload it gives me municipal account statement only. what about the
 * other types of statements?"
 *
 * So where a council renames a document, BOTH names show: the council's first,
 * because that is the word on the sheet in front of them, and the portal's in
 * brackets, because that is what they will type into the picker.
 */
function expected(spec: ReturnType<typeof councilServiceSpec>): string[] {
  if (!spec) return [];
  const names = [...documentsOfClass(spec, "input"), ...documentsOfClass(spec, "supporting")]
    .filter((r) => r.owner !== "firm")
    .map((r) => {
      const shared = docLabel(r.type);
      if (!r.label || r.label === shared) return shared;
      return `${r.label} (${shared})`;
    });
  return Array.from(new Set(names));
}
