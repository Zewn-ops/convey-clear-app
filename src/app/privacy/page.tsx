import type { Metadata } from "next";
import LegalShell, { LegalSection, Placeholder } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy — ConveyClear",
  description:
    "How Convey Clear (Pty) Ltd collects, uses, stores and protects your personal information under POPIA.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated="16 June 2026">
      <p className="mt-6 text-[15px] leading-relaxed text-gray-700">
        This Privacy Policy explains how <strong>Convey Clear (Pty) Ltd</strong> (&ldquo;ConveyClear&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, shares, stores and protects your personal
        information when you use our client portal and conveyancing-related services. We are committed
        to processing your personal information lawfully and transparently in accordance with the{" "}
        <strong>Protection of Personal Information Act, 2013 (POPIA)</strong>.
      </p>

      <LegalSection n={1} title="Who we are (Responsible Party)">
        <p>
          The responsible party for your personal information is Convey Clear (Pty) Ltd, Registration No.
          2025/057574/07, of 9 Lauriston Place Street, Glen Lauriston, Centurion, 0185, South Africa.
        </p>
        <p>
          <strong>Information Officer:</strong> <Placeholder>name &amp; email of the registered Information Officer</Placeholder>.
          Under POPIA the Information Officer (by default the head of the organisation, unless delegated)
          is responsible for compliance and must be registered with the Information Regulator.
        </p>
      </LegalSection>

      <LegalSection n={2} title="The personal information we collect">
        <p>Depending on the service, we may collect and process:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Identifying information — full name, South African ID number or passport number, date of birth.</li>
          <li>Contact details — email address, cellphone number, postal and physical address.</li>
          <li>Entity information (for businesses/trusts) — company/trust name, registration or IT number, directors&apos;/trustees&apos; details.</li>
          <li>Property information — erf/property description, municipality, deeds and transfer details.</li>
          <li>
            <strong>FICA verification material</strong> — certified copies of identity documents, proof of
            residence, and bank/financial confirmation. This is <strong>special and high-sensitivity personal
            information</strong> and is treated with heightened safeguards (see section 7).
          </li>
          <li>Documents you upload, signed Powers of Attorney, and correspondence with us.</li>
          <li>Limited technical/usage data needed to operate and secure the portal (e.g. authentication logs).</li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="Why we process your information and our lawful basis">
        <p>We process your personal information to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>provide the conveyancing and property-related services you request (e.g. Change of Ownership, Property Rates Clearance, Compliance and related services);</li>
          <li>verify your identity and meet our obligations under the Financial Intelligence Centre Act (FICA/FIC Act) and other applicable law;</li>
          <li>prepare, lodge and manage documents with municipalities, the Deeds Office, conveyancing attorneys and other parties to your matter;</li>
          <li>communicate with you about your matter and provide quotes; and</li>
          <li>keep records, prevent fraud, and protect the security of the portal.</li>
        </ul>
        <p>
          Our lawful bases under POPIA §11 are: your <strong>consent</strong>; that processing is{" "}
          <strong>necessary to perform or conclude our agreement</strong> with you; and that processing is
          required to <strong>comply with a legal obligation</strong> (such as FICA). You may withdraw consent
          where consent is the basis, but this may prevent us from delivering the service.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Who we share it with (Operators and third parties)">
        <p>
          We share personal information only as needed to deliver your matter, and with operators
          (processors) that process it on our behalf under written agreement:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>conveyancing attorneys, municipalities, the Deeds Office, and banks involved in your transaction;</li>
          <li>our technology operators: <strong>Supabase</strong> (database &amp; document storage), <strong>Vercel</strong> (application hosting), <strong>Google</strong> (document handling) and our workflow/automation host;</li>
          <li>professional advisors, and authorities where required by law.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection n={5} title="Cross-border transfer of information">
        <p>
          Our database and documents are hosted by Supabase in the <strong>European Union (Ireland,
          eu-west-1)</strong>. This means your personal information is transferred outside South Africa.
          We rely on POPIA §72 on the basis that (a) the recipient is subject to laws providing an adequate
          and comparable level of protection — the EU&apos;s General Data Protection Regulation (GDPR); and
          (b) the transfer is necessary to perform the conveyancing service you requested, and/or is made
          with your consent. <Placeholder>Confirm final wording and any operator/transfer agreements with legal.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={6} title="How we secure your information">
        <ul className="list-disc space-y-1 pl-6">
          <li>Documents are kept in <strong>private storage</strong> with no public access; each file is access-controlled at the row level (RLS) and reachable only through short-lived, server-issued signed links.</li>
          <li>Data is encrypted in transit (TLS, enforced) and at rest.</li>
          <li>Access is role-based and restricted to authorised staff; sensitive accounts use multi-factor authentication.</li>
          <li>We apply the principle of least privilege and keep authentication and activity records.</li>
        </ul>
        <p>
          No system is perfectly secure, but we take reasonable, appropriate technical and organisational
          measures to protect your information as required by POPIA §19.
        </p>
      </LegalSection>

      <LegalSection n={7} title="How long we keep it (retention)">
        <p>
          We keep personal information only for as long as necessary for the purposes above or as required
          by law. FICA verification records are generally retained for at least{" "}
          <strong>five (5) years</strong> after the end of our business relationship or the conclusion of
          the transaction, as required by the FIC Act.{" "}
          <Placeholder>Confirm retention periods per record type and the secure deletion process with legal.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={8} title="Your rights">
        <p>Subject to POPIA, you have the right to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>request access to the personal information we hold about you (POPIA §23);</li>
          <li>request correction or deletion of information that is inaccurate, irrelevant, excessive or out of date (POPIA §24);</li>
          <li>object to processing on reasonable grounds, and withdraw consent where consent is the basis;</li>
          <li>not be subject to a decision based solely on automated processing; and</li>
          <li>lodge a complaint with the Information Regulator.</li>
        </ul>
        <p>
          To exercise these rights, contact us at{" "}
          <a href="mailto:hello@conveyclear.co.za" className="text-[#1B2E6B] hover:underline">
            hello@conveyclear.co.za
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={9} title="Cookies and analytics">
        <p>
          The portal uses only the cookies and local storage necessary to keep you securely signed in and
          to operate the service. <Placeholder>Confirm whether any analytics or non-essential cookies are used, and add a consent mechanism if so.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={10} title="Children">
        <p>
          The portal is intended for adults (18+) entering into property transactions. We do not knowingly
          collect the personal information of children except where it forms part of a matter and is provided
          by a competent person (e.g. a guardian).
        </p>
      </LegalSection>

      <LegalSection n={11} title="Changes to this policy">
        <p>
          We may update this policy from time to time. The &ldquo;last updated&rdquo; date above reflects the
          latest version, and material changes will be communicated through the portal.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contact and complaints">
        <p>
          Questions or requests: contact our Information Officer at{" "}
          <a href="mailto:hello@conveyclear.co.za" className="text-[#1B2E6B] hover:underline">
            hello@conveyclear.co.za
          </a>{" "}
          or +27 (0)76 810 4790.
        </p>
        <p>
          You may also complain to the <strong>Information Regulator (South Africa)</strong> —
          enquiries: <a href="mailto:enquiries@inforegulator.org.za" className="text-[#1B2E6B] hover:underline">enquiries@inforegulator.org.za</a>;
          complaints (POPIA): <a href="mailto:POPIAComplaints@inforegulator.org.za" className="text-[#1B2E6B] hover:underline">POPIAComplaints@inforegulator.org.za</a>.
          <Placeholder>Verify current Regulator contact details before publishing.</Placeholder>
        </p>
      </LegalSection>
    </LegalShell>
  );
}
