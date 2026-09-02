"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchSelect from "@/components/ui/SearchSelect";
import { buildMatterTitle } from "@/lib/matter-naming";
import { PRC_SUBTYPES } from "@/lib/prc-docs";
import { serviceDisplayName } from "@/lib/councils/types";
import { PRIORITY_LABELS, type MatterPriority } from "@/types";
import { CheckCircle2, ExternalLink, Home } from "lucide-react";

const MUNI = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];
const PRIORITIES: MatterPriority[] = ["standard", "priority", "urgent", "complex", "emerging", "whale"];

/** One side of a COO transaction, as captured on this form. */
export interface PartyDraft {
  entity_type: "natural_person" | "business" | "trust";
  first_name: string;
  last_name: string;
  business_name: string;
  id_number: string;
  email: string;
  cell: string;
}

const emptyParty = (): PartyDraft => ({
  entity_type: "natural_person",
  first_name: "",
  last_name: "",
  business_name: "",
  id_number: "",
  email: "",
  cell: "",
});

/** Returns the draft only if something was actually typed — an untouched side is
 *  sent as undefined so the API creates a placeholder rather than a blank party. */
function partyPayload(p: PartyDraft): PartyDraft | undefined {
  const touched =
    p.first_name.trim() || p.last_name.trim() || p.business_name.trim() ||
    p.id_number.trim() || p.email.trim() || p.cell.trim();
  return touched ? p : undefined;
}

function PartyFields({
  title,
  value,
  onChange,
  clients = [],
}: {
  title: string;
  value: PartyDraft;
  onChange: (p: PartyDraft) => void;
  /** Existing clients, so a known party is linked rather than retyped. */
  clients?: { id: string; full_name: string | null; business_name: string | null }[];
}) {
  const set = (patch: Partial<PartyDraft>) => onChange({ ...value, ...patch });

  // Picking an existing client COPIES their details into the side rather than
  // linking by id: the create route deduplicates on ID number and email, so the
  // same person resolves back to the same client record. Typing a name that
  // already exists was the thing that made duplicates.
  function useExisting(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const isBusiness = Boolean(c.business_name?.trim());
    set({
      entity_type: isBusiness ? "business" : "natural_person",
      business_name: isBusiness ? c.business_name ?? "" : "",
      first_name: isBusiness ? "" : (c.full_name ?? "").split(" ").slice(0, -1).join(" "),
      last_name: isBusiness ? "" : (c.full_name ?? "").split(" ").slice(-1).join(""),
    });
  }

  return (
    <div className="space-y-3 rounded-lg bg-raised p-3 shadow-sm dark:ring-1 dark:ring-line">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {clients.length > 0 && (
        <SearchSelect
          label="Use an existing client"
          value=""
          onChange={useExisting}
          placeholder="Search clients…"
          emptyLabel="— Or capture the details below —"
          options={clients.map((c) => ({
            value: c.id,
            label: c.business_name || c.full_name || "Unnamed",
          }))}
        />
      )}
      <Select
        label="Entity type"
        value={value.entity_type}
        onChange={(e) => set({ entity_type: e.target.value as PartyDraft["entity_type"] })}
        options={[
          { value: "natural_person", label: "Natural Person" },
          { value: "business", label: "Business" },
          { value: "trust", label: "Trust" },
        ]}
      />
      {value.entity_type === "natural_person" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="First name(s)" value={value.first_name} onChange={(e) => set({ first_name: e.target.value })} />
          <Input label="Surname" value={value.last_name} onChange={(e) => set({ last_name: e.target.value })} />
          <Input label="ID number" value={value.id_number} onChange={(e) => set({ id_number: e.target.value })} />
        </div>
      ) : (
        <Input label="Business / Trust name" value={value.business_name} onChange={(e) => set({ business_name: e.target.value })} />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        <Input label="Cell" value={value.cell} onChange={(e) => set({ cell: e.target.value })} />
      </div>
    </div>
  );
}

/** The transfer a matter is being created INSIDE (Jukka: the transfer is the primary object now). */
export interface CreateInTransfer {
  id: string;
  reference: string;
  municipality: string | null;
  property_description: string | null;
  /** Seller/buyer of the transfer — the two clients this matter is almost always for. */
  parties: { id: string; label: string; role: string }[];
  /**
   * Parties CAPTURED on the transfer but not yet client records — what the firm
   * typed into its request (2026-09-02). Offered as a prefill for the new-client
   * form; see the control below.
   */
  capturedParties?: {
    role: string;
    entityType: string;
    fullName: string | null;
    businessName: string | null;
    email: string | null;
    cell: string | null;
  }[];
  /**
   * The rates-clearance stage already chosen on this transfer's PRC line, which
   * a new PRC matter INHERITS unless the form overrides it. Carried purely so
   * the title preview can agree with what the server will save — leaving it out
   * is what made the preview read COT_PRC_… for a matter created as COT_RCF_….
   */
  prcSubtype: string | null;
}

export default function CreateMatterForm({
  services,
  clients,
  transfer,
  transferOptions = [],
  initialServiceCode,
}: {
  services: { id: string; code: string; name: string }[];
  clients: { id: string; full_name: string | null; business_name: string | null }[];
  /**
   * When set, the matter is created inside this property transfer: the property
   * and municipality are inherited (they belong to the TRANSACTION, not the
   * matter, and retyping them is how they drift apart), and the transfer's own
   * seller/buyer are offered first as the client.
   */
  transfer?: CreateInTransfer;
  /**
   * Transfers this matter can be linked to, offered when it is NOT already being
   * created inside one. Picking one inherits the property and municipality and
   * offers its parties as the client — the same behaviour as creating inside a
   * transfer, reached from the other direction.
   */
  transferOptions?: CreateInTransfer[];
  /**
   * Preselect the service, for arriving from a transfer's checklist line —
   * "open this service as a matter" already knows which service it means, and
   * making the user pick it again invites picking the wrong one.
   */
  initialServiceCode?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState(transfer?.parties[0]?.id ?? clients[0]?.id ?? "");
  const [entityType, setEntityType] = useState<"natural_person" | "business" | "trust">("natural_person");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [cell, setCell] = useState("");
  const [serviceId, setServiceId] = useState(
    (initialServiceCode
      ? services.find((x) => x.code.toUpperCase() === initialServiceCode.toUpperCase())?.id
      : undefined) ??
      services[0]?.id ??
      ""
  );
  const [municipality, setMunicipality] = useState(transfer?.municipality || "COT");
  /**
   * PRC only — which rates clearance stage this matter is (RCA | RCF | RCC).
   *
   * A matter opened inside a transfer inherits the stage from its checklist line
   * server-side, so this is left blank there and the API fills it. Set here for
   * a standalone PRC matter, which has no line to inherit from.
   */
  const [prcStage, setPrcStage] = useState("");
  const [property, setProperty] = useState(transfer?.property_description || "");
  const [priority, setPriority] = useState<MatterPriority>("standard");
  const [seller, setSeller] = useState<PartyDraft>(emptyParty());
  const [buyer, setBuyer] = useState<PartyDraft>(emptyParty());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ matterId: string; title: string; token: string } | null>(null);
  /** A transfer chosen on this form, when the matter was not opened inside one. */
  const [pickedTransferId, setPickedTransferId] = useState("");

  // Whichever transfer is in play: the one we were opened inside, or the one
  // picked here. Everything downstream reads this, so the two routes into the
  // same state cannot behave differently.
  const linkedTransfer =
    transfer ?? transferOptions.find((t) => t.id === pickedTransferId) ?? null;
  // Picking a transfer inherits what describes the TRANSACTION rather than the
  // matter. Only fills blanks — retyped values are not overwritten, because a
  // correction made by hand is a decision and silently reverting it is worse
  // than leaving a field empty.
  function pickTransfer(id: string) {
    setPickedTransferId(id);
    const t = transferOptions.find((x) => x.id === id);
    if (!t) return;
    if (t.municipality) setMunicipality(t.municipality);
    if (t.property_description && !property.trim()) setProperty(t.property_description);
    const sellerParty = t.parties.find((p) => p.role === "seller");
    const buyerParty = t.parties.find((p) => p.role === "buyer");
    // The matter's own client is the seller (Zewn, 2026-08-06: on a COO the
    // client is the seller and the buyer rides along as a party).
    if (sellerParty) { setMode("existing"); setClientId(sellerParty.id); }
    else if (buyerParty) { setMode("existing"); setClientId(buyerParty.id); }
  }

  const svcCode = services.find((s) => s.id === serviceId)?.code ?? "";
  const isCoo = svcCode.toUpperCase() === "COO";
  const clientName =
    mode === "new"
      ? (entityType === "natural_person" ? `${firstName} ${lastName}`.trim() : name)
      : (() => {
          const c = clients.find((x) => x.id === clientId);
          return c?.business_name || c?.full_name || "";
        })();
  // An empty stage picker means "take it from the transfer", and the server does
  // exactly that — so the preview has to as well, or it shows a name that is
  // never saved. Mirrors the creation route's inheritance: an explicit choice
  // wins, otherwise the PRC line's stage, otherwise nothing.
  const effectivePrcStage =
    prcStage || (svcCode.toUpperCase() === "PRC" ? linkedTransfer?.prcSubtype ?? "" : "");
  const previewTitle = buildMatterTitle({
    municipality,
    serviceCode: svcCode,
    serviceSubtype: effectivePrcStage,
    // The transfer's reference replaces the client name where there is one.
    transferReference: linkedTransfer?.reference ?? null,
    clientName,
    property,
  });

  const submit = async () => {
    if (mode === "new" && !clientName.trim()) return toast.error("Client name required");
    if (mode === "existing" && !clientId) return toast.error("Pick a client");
    setLoading(true);
    const res = await fetch("/api/admin/matters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: mode === "existing" ? clientId : undefined,
        entity_type: entityType,
        first_name: entityType === "natural_person" ? firstName : undefined,
        last_name: entityType === "natural_person" ? lastName : undefined,
        business_name: entityType !== "natural_person" ? name : undefined,
        email, cell, service_id: serviceId, municipality, property_description: property, priority,
        // Blank inside a transfer: the API prefers the checklist line's stage.
        service_subtype: prcStage || undefined,
        transfer_id: linkedTransfer?.id,
        // Only sent for COO — the API seeds both sides regardless, but an
        // untouched side is left undefined so it gets a placeholder rather than
        // a party row full of empty strings.
        seller: isCoo ? partyPayload(seller) : undefined,
        buyer: isCoo ? partyPayload(buyer) : undefined,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create matter");
    toast.success(transfer ? "Matter created in this transfer" : "Matter created");
    setDone({ matterId: json.matter_id, title: json.title, token: json.onboarding_token });
    router.refresh();
  };

  if (done) {
    return (
      <Card className="border-green-300 bg-green-50">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-green-900">Matter created</p>
              <p className="text-sm text-green-800 font-mono">{done.title}</p>
            </div>
            {/* Open matter LEADS (Zewn, 2026-08-28). Capturing details and
                documents in place on the matter is the primary path — /onboard
                is the self-serve fallback for a client who will do it
                themselves, and api/fica/capture says as much. Offering the link
                first taught staff to send a form for work they can finish on
                the page they are one click away from.

                The link is kept, not removed: it is the only route a client or
                an attorney has to upload matter-level FICA, and three other
                surfaces still open it. Demoted, not retired — see the note in
                RESUME_HERE about whether it should be retired properly. */}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push(`/admin/matters/${done.matterId}`)}>
                Open matter
              </Button>
              <Button variant="outline" onClick={() => window.open(`/onboard?token=${done.token}`, "_blank", "noopener")}>
                Send a FICA link instead <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setDone(null)}>Create another</Button>
            </div>
            <p className="text-xs text-green-800">
              Capture the client&rsquo;s details and documents on the matter itself. The link is for
              when they will do it themselves.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      {transfer && (
        <div className="flex items-start gap-2 rounded-lg bg-action-fill/[0.04] px-3 py-2.5">
          <Home className="mt-0.5 h-4 w-4 shrink-0 text-action" />
          <div className="min-w-0 text-xs">
            <p className="font-medium text-ink">Creating a matter inside transfer {transfer.reference}</p>
            <p className="mt-0.5 text-ink-3">
              It is linked to the transfer on creation, and inherits the property and municipality — those describe the{" "}
              <b>transaction</b>, so they are not retyped per matter.
            </p>
          </div>
        </div>
      )}

      {/* SERVICE FIRST. It decides the pipeline AND the shape of the parties —
          a Change of Ownership has a seller and a buyer, everything else has one
          client — so asking "who is this for" before "what is it" asks a question
          whose right answer is not yet knowable. */}
      <Select
        label="Service"
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
        // 🔴 `services.name` IS A SECOND VOCABULARY. It still said "Certificates"
        // after the 2026-09-02 rename to COC, because that rename landed in
        // SERVICE_LABELS — the map every transfer surface reads — while this one
        // dropdown was reading the row's own name column straight out of the
        // database. Found by opening the form, minutes after the deploy.
        //
        // 066 for the fourth time: two names for one service, and the one on
        // screen is whichever the reader happens to be looking at. The label map
        // wins; `s.name` is the fallback for a service code the map has never
        // heard of, which is exactly what serviceLabel() already does.
        options={services.map((s) => ({
          value: s.id,
          label: serviceDisplayName(s.code, s.name),
        }))}
      />

      {/* Then the transaction it belongs to. ~90% of matters hang off a property
          transfer, so linking is offered at creation rather than left as a chore
          afterwards — and linking is what makes the seller and buyer already known. */}
      {!transfer && transferOptions.length > 0 && (
        <div className="space-y-2">
          <Select
            label="Property transfer"
            value={pickedTransferId}
            onChange={(e) => pickTransfer(e.target.value)}
            options={[
              { value: "", label: "— None (standalone matter) —" },
              ...transferOptions.map((t) => ({
                value: t.id,
                label: `${t.reference}${t.property_description ? ` · ${t.property_description}` : ""}`,
              })),
            ]}
          />
          {linkedTransfer && (
            <p className="text-xs text-ink-3">
              Property and council inherited from {linkedTransfer.reference}
              {linkedTransfer.parties.length > 0
                ? ` · ${linkedTransfer.parties.length} part${linkedTransfer.parties.length === 1 ? "y" : "ies"} available as the client`
                : " · no parties captured on it yet"}
              .
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={"px-3 py-1.5 rounded-lg text-sm font-medium " + (mode === "existing" ? "bg-action-fill text-white" : "bg-raised text-ink-2")}
        >
          Existing client
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={"px-3 py-1.5 rounded-lg text-sm font-medium " + (mode === "new" ? "bg-action-fill text-white" : "bg-raised text-ink-2")}
        >
          New client
        </button>
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          {/* The transfer's own seller and buyer, one click away. On a transfer,
              the matter is nearly always for one of them — and hunting for that
              person in a list of every client is the thing Jukka complained about. */}
          {linkedTransfer && linkedTransfer.parties.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-3">This transfer:</span>
              {linkedTransfer.parties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setClientId(p.id)}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs font-medium " +
                    (clientId === p.id
                      ? "border-line bg-action-fill text-white"
                      : "border-line text-ink-2 hover:border-line/40")
                  }
                >
                  {p.label} <span className="opacity-70">· {p.role}</span>
                </button>
              ))}
            </div>
          )}
          <SearchSelect
            label="Client"
            value={clientId}
            onChange={setClientId}
            placeholder="Search clients…"
            emptyLabel="— Select a client —"
            options={clients.map((c) => ({ value: c.id, label: c.business_name || c.full_name || "Unnamed" }))}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 🔴 THE ATTORNEY ALREADY TYPED THIS. Jukka, watching a new client
              being created inside a transfer: "this we would have to have
              autofilled, it doesn't do that at the moment." Zewn: "we want to
              autofill from the data that's been entered into the property
              transfer actually, because that would be better."

              Since 2026-09-02 the request's seller and buyer land on the
              transfer as captures — a name, a type, an email, a cell — and this
              is where that becomes a client record. It FILLS, it does not
              submit: staff still check the detail against the FICA documents
              before anything is created, which is the whole point of the check
              Jukka described. */}
          {(linkedTransfer?.capturedParties ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-raised px-3 py-2">
              <span className="text-xs text-ink-3">Take from this transfer:</span>
              {(linkedTransfer?.capturedParties ?? []).map((p) => (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => {
                    const type =
                      p.entityType === "business" || p.entityType === "trust"
                        ? p.entityType
                        : "natural_person";
                    setEntityType(type);
                    if (type === "natural_person") {
                      // Split on the LAST space: "van der Merwe" keeps its
                      // surname intact, which a first-space split destroys.
                      const whole = (p.fullName ?? p.businessName ?? "").trim();
                      const cut = whole.lastIndexOf(" ");
                      setFirstName(cut > 0 ? whole.slice(0, cut) : whole);
                      setLastName(cut > 0 ? whole.slice(cut + 1) : "");
                      setName("");
                    } else {
                      setName((p.businessName ?? p.fullName ?? "").trim());
                      setFirstName("");
                      setLastName("");
                    }
                    setEmail(p.email ?? "");
                    setCell(p.cell ?? "");
                  }}
                  className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-action hover:text-action"
                >
                  {p.businessName || p.fullName} <span className="opacity-70">· {p.role}</span>
                </button>
              ))}
            </div>
          )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Entity type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as typeof entityType)}
            options={[
              { value: "natural_person", label: "Natural Person" },
              { value: "business", label: "Business" },
              { value: "trust", label: "Trust" },
            ]}
          />
          {entityType === "natural_person" ? (
            <>
              <Input label="First name(s)" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Surname" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </>
          ) : (
            <Input label="Business / Trust name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Cell" value={cell} onChange={(e) => setCell(e.target.value)} />
        </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} options={MUNI} />
        {/* The stage decides the pipeline, the document list AND the title, so
            it is asked for at creation rather than left to be corrected later.
            Inside a transfer it can be left blank — the checklist line's stage
            wins server-side. */}
        {svcCode.toUpperCase() === "PRC" && (
          <Select
            label="Rates clearance stage"
            value={prcStage}
            onChange={(e) => setPrcStage(e.target.value)}
            options={[
              { value: "", label: linkedTransfer ? "— Take it from the transfer —" : "— Not chosen —" },
              ...PRC_SUBTYPES.map((x) => ({ value: x.code, label: x.label })),
            ]}
          />
        )}
        <Input label="Property description" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="ERF 123 VALHALLA" />
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as MatterPriority)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
      </div>

      {/* A COO is a two-sided transaction: seller (current owner) and buyer (new
          owner) are distinct parties with their own identity documents, and the
          intake files documents against them by (matter, party, type). Capturing
          them here means the matter is usable immediately; leaving a side blank
          still creates its section, to be filled in on the matter or by the
          client through the onboarding link. */}
      {isCoo && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Parties to the transaction</h3>
            <p className="text-xs text-ink-3 mt-0.5">
              Optional now — both sections are created either way, and each side gets
              its own document slots. Fill in what you have.
            </p>
          </div>
          {/* Stacked, not side by side. Each side is a full identity — name, ID,
              email, cell — and two of them in one row halves the field width for
              no gain; they are filled one after the other, not compared. */}
          <div className="space-y-4">
            <PartyFields title="Seller (current owner)" value={seller} onChange={setSeller} clients={clients} />
            <PartyFields title="Buyer (new owner)" value={buyer} onChange={setBuyer} clients={clients} />
          </div>
        </div>
      )}

      <div className="rounded-lg bg-raised shadow-sm dark:ring-1 dark:ring-line p-3">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Matter title (auto)</p>
        <p className="text-sm font-mono text-action mt-1">{previewTitle}</p>
      </div>

      <Button onClick={submit} loading={loading} size="lg">Create matter</Button>
    </Card>
  );
}
