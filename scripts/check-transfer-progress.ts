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
const { isWaitingOnFirm, FIRM_WAIT_STAGE_KEYS } =
  require("@/lib/pipelines") as typeof import("@/lib/pipelines");
const { ageTone, workdaysSince } =
  require("@/lib/elapsed") as typeof import("@/lib/elapsed");
const { isPostRegistration } =
  require("@/lib/councils/registration-stage") as typeof import("@/lib/councils/registration-stage");
const { councilServiceSpec, documentsOfClass } =
  require("@/lib/councils") as typeof import("@/lib/councils");
const { docLabel } = require("@/lib/prc-docs") as typeof import("@/lib/prc-docs");

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
eq("chosen, no matter", dot({ status: "needed" }), "chosen");
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

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
