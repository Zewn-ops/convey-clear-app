/**
 * What a transfer's progress and its service circles actually say.
 *
 *   ./node_modules/.bin/sucrase-node scripts/check-transfer-progress.ts
 *
 * WHY THIS EXISTS. Four sessions running, every defect on this project was found
 * by clicking and none by reading a diff — and since 2026-09-04 the preview
 * deploys have failed on every branch, so clicking is not available before a
 * merge either. The rules in lib/transfer-service-progress.ts are pure functions
 * over plain rows, which means they can be checked without a browser, a session
 * or a database. This is that check.
 *
 * It is not a test suite and there is no runner in this project. It is a script
 * that prints PASS/FAIL lines and exits non-zero, meant to be run by hand beside
 * a change to the progress rules.
 */
import path from "path";
import Module from "module";

// The project's "@/..." alias, taught to plain node. sucrase strips the types
// but does not resolve tsconfig paths.
const APP = path.resolve(__dirname, "..");
const resolveFilename = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...rest: unknown[]
) {
  if (request.startsWith("@/")) request = path.join(APP, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};

/* eslint-disable @typescript-eslint/no-var-requires */
const { transferProgress, serviceProgress } =
  require("@/lib/transfer-service-progress") as typeof import("@/lib/transfer-service-progress");
const { isWaitingOnFirm, FIRM_WAIT_STAGE_KEYS, getPipeline } =
  require("@/lib/pipelines") as typeof import("@/lib/pipelines");
const { ageTone, workdaysSince } =
  require("@/lib/elapsed") as typeof import("@/lib/elapsed");
const { serviceDocSlots, matchTransferDocs, OTHER_SLOT } =
  require("@/lib/service-doc-slots") as typeof import("@/lib/service-doc-slots");
const { transferChip, reviewEdgeClass } =
  require("@/lib/transfer-review-state") as typeof import("@/lib/transfer-review-state");
const { isPostRegistration } =
  require("@/lib/councils/registration-stage") as typeof import("@/lib/councils/registration-stage");
const { councilServiceSpec, documentsOfClass } =
  require("@/lib/councils") as typeof import("@/lib/councils");
const { docLabel } = require("@/lib/prc-docs") as typeof import("@/lib/prc-docs");
const { qualifyReference, alreadyQualified, isValidFirmCode, suggestFirmCode } =
  require("@/lib/firm-reference") as typeof import("@/lib/firm-reference");
const { transferConsentStatus, consentBlockedReason } =
  require("@/lib/transfer-consent") as typeof import("@/lib/transfer-consent");
const { consentProgressBlocked } =
  require("@/lib/transfer-gate") as typeof import("@/lib/transfer-gate");

let fails = 0;
function eq(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${what}: got ${JSON.stringify(got)}${ok ? "" : ` want ${JSON.stringify(want)}`}`
  );
}

type Row = Parameters<typeof transferProgress>[0][number];
const line = (o: Partial<Row> = {}): Row => ({
  parent_id: null,
  status: "not_specified",
  serviceCode: "PRC",
  position: 0,
  ...o,
});

// ── Only chosen services are counted ────────────────────────────────────────
const nine = [
  line({ serviceCode: "EBP", position: 1 }),
  line({ serviceCode: "COC", position: 2 }),
  line({ serviceCode: "MAD", position: 3 }),
  line({ serviceCode: "PRC", position: 4, status: "needed", matter_id: "m1" }),
  line({ serviceCode: "COO", position: 5, status: "needed" }),
  line({ serviceCode: "REF", position: 6, status: "not_applicable" }),
  line({ serviceCode: "BC", position: 7 }),
  line({ serviceCode: "PPM", position: 8 }),
  line({ serviceCode: "OTHER", position: 9 }),
];
const p = transferProgress(nine);
eq("nine lines, three chosen -> total", p.total, 3);
eq("  resolved (the not_applicable one)", p.resolved, 1);
eq("  label", p.label, "1 of 3 services settled");
eq("  dots drawn", p.dots.length, 3);
eq(
  "  dot order is positional",
  p.dots.map((d) => d.name),
  ["Property Rates Clearance", "Change of Ownership", "Refund"]
);

// Two different empty states, two different sentences.
eq("nothing chosen -> awaitingChoice", transferProgress([line(), line({ serviceCode: "COO" })]).awaitingChoice, true);
eq("nothing chosen -> label", transferProgress([line()]).label, "No services chosen yet");
eq("no lines at all -> label", transferProgress([]).label, "No services listed yet");
eq("no lines at all -> awaitingChoice", transferProgress([]).awaitingChoice, false);

// Sub-services never reach the denominator.
eq(
  "sub-service ignored",
  transferProgress([line({ status: "needed" }), line({ parent_id: "x", status: "needed", label: "sub" })]).total,
  1
);

// ── The four circle states ──────────────────────────────────────────────────
const dot = (row: Partial<Row>) => {
  const d = transferProgress([line(row)]).dots[0];
  return d.settled ? "settled" : d.attention ? "attention" : d.running ? "running" : "chosen";
};
// The "chosen" state is drawn as an amber "!" since 2026-09-15 — a service
// asked for that nobody has opened as a matter. The state itself is unchanged;
// only its rendering is, so this assertion still pins the resolver.
eq("chosen, no matter", dot({ status: "needed" }), "chosen");
// It must NOT be swallowed by the documents-outstanding alert: the two share a
// glyph on screen and are different facts underneath.
eq(
  "chosen-with-no-matter is not the documents alert",
  transferProgress([line({ status: "needed" })]).dots[0].attention,
  false
);
eq("matter open", dot({ status: "needed", matter_id: "m1" }), "running");
eq(
  "matter on documents_outstanding (list-page route)",
  dot({ status: "needed", matter_id: "m1", matterStage: "documents_outstanding" }),
  "attention"
);
eq("matter finished", dot({ status: "needed", matter_id: "m1", matterStatus: "won" }), "settled");
eq("not applicable", dot({ status: "not_applicable" }), "settled");
eq("already done", dot({ status: "already_done" }), "settled");
eq("completed", dot({ status: "completed" }), "settled");

// The detail pages reach the same answer down a different road.
const matter = {
  id: "m1",
  title: "t",
  current_phase: "onboarding",
  current_stage: "documents_outstanding",
  status: "open",
  municipality: "COT",
  service_subtype: null,
  services: { code: "COO" },
};
eq("serviceProgress marks attention", serviceProgress("needed", matter, "staff", true).attention, true);
eq(
  "detail-page route -> attention",
  dot({ status: "needed", matter_id: "m1", progress: serviceProgress("needed", matter, "staff", true) }),
  "attention"
);
eq("a won matter is never attention", serviceProgress("needed", { ...matter, status: "won" }, "staff", true).attention, false);

// ── Which stages mean "the firm has the next move" ──────────────────────────
eq("documents_outstanding is a firm-wait stage", isWaitingOnFirm("documents_outstanding"), true);
eq("a council-wait stage is not", isWaitingOnFirm("pending_cot_decision"), false);
eq("nothing else claims the firm yet", FIRM_WAIT_STAGE_KEYS, ["documents_outstanding"]);

// ── The waiting-time colour scale (096, 2026-09-15) ────────────────────────
// Francois: green for a few days, yellow after a week or two, red past three
// weeks. Jukka added orange between, and the reset on movement. The bands are
// in WORKDAYS to match the "Open N workdays" chip beside them.
eq("fresh under a week", ageTone(3), "fresh");
eq("still fresh ON the boundary", ageTone(5), "fresh");
eq("yellow past a week", ageTone(6), "warn");
eq("yellow up to a fortnight", ageTone(10), "warn");
eq("orange past a fortnight", ageTone(11), "late");
eq("orange up to three weeks", ageTone(15), "late");
eq("red past three weeks", ageTone(16), "overdue");
// A matter with no clock at all must not read as overdue. Before 096 is applied
// the column is absent, and a null that fell through to the last band would
// paint every circle red on the deploy BETWEEN the code and the migration.
eq("no reading is not a red reading", ageTone(null), "fresh");
eq("undefined is not a red reading", ageTone(undefined), "fresh");

// Workdays, not calendar days — the whole scale is meaningless if these drift.
const monday = new Date("2026-09-14T09:00:00Z");
eq("a weekend does not age a matter", workdaysSince("2026-09-11T09:00:00Z", monday), 1);
eq("five workdays is a week later", workdaysSince("2026-09-07T09:00:00Z", monday), 5);

// ── Before / after registration (2026-09-15) ───────────────────────────────
// Jukka: "after registration is just two documents — transfer letter, transfer
// confirmation letter, and updated deed search." Everything else can be
// gathered before the property is registered in the new owner's name.
eq("the confirmation letter is post-registration", isPostRegistration("Transfer Confirmation Letter"), true);
eq("the updated deed search is post-registration", isPostRegistration("Deed Search (updated)"), true);
eq("the SELLER's deed search is not", isPostRegistration("Deed Search"), false);
eq("an ID is not", isPostRegistration("Certified ID"), false);
eq("clearance figures are not", isPostRegistration("Clearance Figures"), false);
eq("matching is case-insensitive", isPostRegistration("DEED SEARCH (UPDATED)"), true);

// 🔴 THE ASSERTION THAT EARNS ITS KEEP. The patterns are substrings of the
// registry's own prose labels, and the first draft of them was written from the
// meeting transcript — "updated deed search" — which matches NOTHING, because
// the registry says "Deed Search (updated)". The split would have rendered as
// one unlabelled list and looked exactly like a working feature. So: assert
// that at least one real document in a real council's real spec is classified
// post-registration. If a label is renamed, this fails instead of the UI going
// quietly inert.
// Built through the SAME accessor the component uses, so the assertion cannot
// pass while the screen shows something else — the spec is {documents: [...]},
// reached by documentsOfClass, not by an .input / .supporting field.
const cooSpec = councilServiceSpec("COT", "COO", null);
const cooNames = (["input", "supporting"] as const).flatMap((cls) =>
  documentsOfClass(cooSpec, cls).map((r) => {
    const shared = docLabel(r.type);
    return !r.label || r.label === shared ? shared : `${r.label} (${shared})`;
  })
);
eq(
  "a real COT/COO document the attorney brings is post-registration",
  cooNames.filter((d) => isPostRegistration(d)),
  ["Transfer Confirmation Letter"]
);
// And the one Jukka was most insistent about stays on the near side: "it's very
// important for us to have the INITIAL deed search … the current owner's deed."
eq("the seller's deed search stays pre-registration", cooNames.includes("Deed Search"), true);

// ── Service document slots (2026-09-17) ────────────────────────────────────
// Zewn: "if we do a change of ownership in COT then it should have upload slots
// for each document that the COO COT requires."
const cooSlots = serviceDocSlots("COT", "COO", null);
eq("COO slots are not the transfer's five", cooSlots.some((s) => s.type === "deed_search"), true);
eq(
  "output documents are excluded — we produce those",
  cooSlots.some((s) => s.type === "deed_search_updated"),
  false
);
eq("the catch-all is always last", cooSlots[cooSlots.length - 1].type, OTHER_SLOT.type);

// 🔴 The slot list must differ BY SERVICE. If it did not, this whole change is
// cosmetic — the old page showed the same five documents on every service, and
// an assertion that only checked "there are slots" would have passed then too.
const ebpSlots = serviceDocSlots("COT", "EBP", null);
const sameShape =
  ebpSlots.length === cooSlots.length &&
  ebpSlots.every((s, i) => s.type === cooSlots[i].type);
eq("EBP and COO ask for different things", sameShape, false);

// Every combination gets somewhere to put something, including the 12 of 33
// that have no list at all — for those, the catch-all is the only way in.
const barren = serviceDocSlots("COT", "BC", null);
eq("a service with no registry list still gets the catch-all", barren.map((s) => s.type), ["other"]);

// Matching against the transaction: by type, and never via the catch-all.
const hits = matchTransferDocs(cooSlots, [
  { id: "t1", document_type: "deed_search", file_name: "deed.pdf" },
  { id: "t2", document_type: "other", file_name: "random.pdf" },
]);
eq("a matching type is offered for linking", hits.get("deed_search")?.length, 1);
eq("the catch-all never matches a pile of unrelated files", hits.has("other"), false);

// ── The status edge (2026-09-17) ───────────────────────────────────────────
// ConveyClear Services wanted "not taken on" visible while scrolling, not only
// once you are looking at the card.
const REJECTED = { state: "rejected" as const, reason: "FICA missing" };
const RETURNED = { state: "changes_requested" as const, reason: "Fix the parties" };
eq("a rejected draft gets a red edge", reviewEdgeClass("draft", REJECTED), "border-l-4 border-danger-fill");
eq("a returned draft gets a yellow edge", reviewEdgeClass("draft", RETURNED), "border-l-4 border-waiting-fill");
eq("an open transfer gets no edge", reviewEdgeClass("open", null), "");
eq("a registered transfer gets no edge", reviewEdgeClass("registered", null), "");
// 🔴 The edge must agree with the CHIP, always. They disagreed once before —
// a rejected transfer came out red on one page and amber on another because
// each caller decided for itself, which is why both now come from transferChip.
eq(
  "edge and chip agree on a rejection",
  [transferChip("draft", REJECTED).tone, reviewEdgeClass("draft", REJECTED).includes("danger")],
  ["danger", true]
);

// ── 100 — the firm code on a transfer reference ────────────────────────────
//
// The collision this prevents is invisible with one firm live and fires on the
// second firm's first transfer, which is exactly the kind of thing that cannot
// be caught by clicking around a single-firm demo.
console.log("\n-- firm-qualified references --");

eq("an ordinary reference gets the firm code", qualifyReference("BSI", "5600"), "BSI_5600");
eq("the code is upper-cased", qualifyReference("bsi", "5600"), "BSI_5600");
eq("two firms no longer collide",
  qualifyReference("BSI", "5600") === qualifyReference("AA", "5600"), false);

// 🔴 The live convention. Sterling Hayes' transfers already open with SH and a
// HYPHEN; re-prefixing them would rename references attorneys hold on paper.
eq("an already-prefixed reference is untouched",
  qualifyReference("SH", "SH-2026-1001"), "SH-2026-1001");
eq("a lower-case existing prefix is still recognised",
  qualifyReference("SH", "sh-2026-1001"), "sh-2026-1001");
eq("underscore separators count as prefixed",
  qualifyReference("BSI", "BSI_5600"), "BSI_5600");
eq("a slash separator counts too", qualifyReference("AA", "AA/2026/1"), "AA/2026/1");

// 🔴 A reference that merely STARTS with the same letters is not prefixed.
// "SHELL-4" is not Sterling Hayes' code followed by a separator, and treating
// it as one would leave it unqualified and able to collide.
eq("a word that merely starts with the code is still prefixed",
  qualifyReference("SH", "SHELL-4"), "SH_SHELL-4");

// ⚠️ NULL SURVIVES. A draft request legitimately has no reference yet and
// suggested_reference must stay NULL — 078's CHECKs read "" as supplied.
eq("null stays null", qualifyReference("BSI", null), null);
eq("a firm with no code yet is left alone", qualifyReference(null, "5600"), "5600");
eq("an empty reference is not turned into a bare code", qualifyReference("BSI", ""), "");

eq("a code alone is already qualified", alreadyQualified("BSI", "BSI"), true);

eq("codes must be 2-6 alphanumerics", [
  isValidFirmCode("BSI"), isValidFirmCode("AA"), isValidFirmCode("A"),
  isValidFirmCode("TOOLONGG"), isValidFirmCode("B S"), isValidFirmCode("B-S"),
], [true, true, false, false, false, false]);

eq("a code is suggested from the firm's name", suggestFirmCode("Bert Smith Inc"), "BSI");
eq("connectives are skipped", suggestFirmCode("Adams & Adams"), "AA");
eq("a one-word firm still yields a valid code",
  isValidFirmCode(suggestFirmCode("Batsmith")), true);

// ── 101 — POPIA consent on the transfer ────────────────────────────────────
console.log("\n-- POPIA consent --");

const SELLER = { id: "p1", role: "seller", name: "M. Dlamini" };
const BUYER = { id: "p2", role: "buyer", name: "Sterling Props" };
const ATTORNEY = { id: "p3", role: "conveyancing_attorney", name: "Bert Smith Inc" };

const grant = (partyId: string, at: string, granted = true) => ({
  transfer_party_id: partyId, party_name: "x", party_role: "seller",
  granted, created_at: at, attested_by: "u1", evidence_document_id: null,
});

eq("both parties consented is complete",
  transferConsentStatus([SELLER, BUYER],
    [grant("p1", "2026-09-19T08:00:00Z"), grant("p2", "2026-09-19T08:00:00Z")]).complete, true);

eq("one party short is not complete",
  transferConsentStatus([SELLER, BUYER], [grant("p1", "2026-09-19T08:00:00Z")]).complete, false);

eq("the missing party is named",
  transferConsentStatus([SELLER, BUYER], [grant("p1", "2026-09-19T08:00:00Z")]).missing,
  ["Sterling Props"]);

// 🔴 THE EMPTY-LIST TRAP. "every required party is consented" is vacuously TRUE
// of a transfer with no parties, which would open the gate on the transaction we
// know least about — the same shape as the three "found nothing, said there was
// nothing" bugs this month.
eq("a transfer with no parties is NOT consented",
  transferConsentStatus([], []).complete, false);
eq("and says why", transferConsentStatus([], []).noParties, true);

// The attorney is not a data subject of this consent.
eq("only the seller and buyer are counted",
  transferConsentStatus([SELLER, BUYER, ATTORNEY], []).parties.length, 2);
eq("an attorney-only transfer has nothing to consent",
  transferConsentStatus([ATTORNEY], []).noParties, true);

// ⚠️ APPEND-ONLY. A withdrawal is a NEWER row saying false, so the presence of
// a granted row is not the answer — the newest row per party is.
eq("a later withdrawal beats an earlier grant",
  transferConsentStatus([SELLER],
    [grant("p1", "2026-09-19T08:00:00Z", true), grant("p1", "2026-09-19T09:00:00Z", false)]).complete,
  false);
eq("a later re-grant beats an earlier withdrawal",
  transferConsentStatus([SELLER],
    [grant("p1", "2026-09-19T09:00:00Z", true), grant("p1", "2026-09-19T08:00:00Z", false)]).complete,
  true);

eq("seller is listed before buyer",
  transferConsentStatus([BUYER, SELLER], []).parties.map((p) => p.role), ["seller", "buyer"]);

eq("a blocked transfer explains itself",
  (consentBlockedReason(transferConsentStatus([SELLER, BUYER], [grant("p1", "2026-09-19T08:00:00Z")])) ?? "")
    .includes("Sterling Props"), true);
eq("a consented transfer blocks nothing",
  consentBlockedReason(transferConsentStatus([SELLER, BUYER],
    [grant("p1", "2026-09-19T08:00:00Z"), grant("p2", "2026-09-19T08:00:00Z")])), null);

// The gate: forward moves stop, reverting never does, and a matter with no
// transfer is not blocked by a consent that cannot exist.
const EBP = getPipeline("EBP", "COT", null);
eq("advancing an unconsented matter is blocked",
  consentProgressBlocked({ pipeline: EBP, consentComplete: false, target: { phaseKey: "operations" } }), true);
eq("setting any stage is blocked",
  consentProgressBlocked({ pipeline: EBP, consentComplete: false, target: { stageKey: "documents_received" } }), true);
eq("reverting to the pre-phase is NOT blocked",
  consentProgressBlocked({ pipeline: EBP, consentComplete: false, target: { phaseKey: "new_instruction" } }), false);
eq("a consented matter moves freely",
  consentProgressBlocked({ pipeline: EBP, consentComplete: true, target: { phaseKey: "operations" } }), false);
eq("a standalone matter has no transfer consent to fail",
  consentProgressBlocked({ pipeline: EBP, consentComplete: null, target: { phaseKey: "operations" } }), false);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
