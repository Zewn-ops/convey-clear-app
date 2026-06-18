import type { Metadata } from "next";
import LegalShell, { LegalSection, Placeholder } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Terms & Conditions — ConveyClear",
  description:
    "The terms governing your use of the Convey Clear (Pty) Ltd client portal and conveyancing-related services.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms & Conditions" lastUpdated="16 June 2026">
      <p className="mt-6 text-[15px] leading-relaxed text-gray-700">
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of the client
        portal and the conveyancing-related services provided by <strong>Convey Clear (Pty) Ltd</strong>{" "}
        (&ldquo;ConveyClear&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, submitting
        documents, or instructing us, you agree to these Terms.
      </p>

      <LegalSection n={1} title="Definitions">
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Services</strong> — the conveyancing-related services we offer, including Change of Ownership, Property Rates Clearance, Compliance Certificates, and related municipal and property services.</li>
          <li><strong>Portal</strong> — the ConveyClear online client portal.</li>
          <li><strong>Matter</strong> — a specific instruction or transaction you ask us to handle.</li>
          <li><strong>Client / you</strong> — the natural person, business or trust using the Services.</li>
        </ul>
      </LegalSection>

      <LegalSection n={2} title="The Services">
        <p>
          We provide administrative and coordination services to assist with property and municipal matters,
          working with conveyancing attorneys, municipalities, the Deeds Office and other parties as required.
          The precise scope of each Matter is set out in the quote or instruction you accept.{" "}
          <Placeholder>Legal to confirm the exact nature of services and any attorney/non-attorney distinctions.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={3} title="Your obligations">
        <ul className="list-disc space-y-1 pl-6">
          <li>Provide accurate, complete and current information and documents.</li>
          <li>Provide valid FICA verification documents when requested.</li>
          <li>Warrant that you are authorised to instruct us and to provide any third party&apos;s information you submit.</li>
          <li>Keep your account credentials secure and not share access.</li>
          <li>Respond promptly to requests so your Matter is not delayed.</li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Authority and Powers of Attorney">
        <p>
          Where a Matter requires it, you authorise us and/or the appointed conveyancing attorney to act on
          your behalf to the extent set out in the relevant Power of Attorney or mandate. You confirm that
          all such authority is validly granted. <Placeholder>Confirm mandate/PoA wording with legal.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={5} title="Quotes, fees and payment">
        <p>
          Fees for each Matter are set out in the quote we provide and accepted by you before work proceeds.
          Quotes may exclude third-party costs and disbursements (e.g. municipal, Deeds Office, bank or
          attorney charges), which are payable in addition.{" "}
          <Placeholder>Insert fee structure, payment terms, deposits, refunds and interest/late-payment terms.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={6} title="Timeframes and third-party dependencies">
        <p>
          Many steps depend on third parties (municipalities, the Deeds Office, banks and attorneys) whose
          timeframes we do not control. We will act diligently, but we do not guarantee turnaround times that
          depend on third parties and are not liable for delays outside our reasonable control.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Data protection and privacy">
        <p>
          We process your personal information in accordance with our{" "}
          <a href="/privacy" className="text-[#1B2E6B] hover:underline">Privacy Policy</a> and POPIA. By using
          the Services you acknowledge that Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Intellectual property">
        <p>
          The Portal, its content and branding are owned by or licensed to ConveyClear. You may use the Portal
          only to manage your own Matters. You retain ownership of documents you upload.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, ConveyClear is not liable for indirect or consequential loss,
          and our total liability arising from a Matter is limited as set out below.{" "}
          <Placeholder>Insert liability cap, exclusions and indemnities — to be drafted/approved by legal; subject to the Consumer Protection Act where applicable.</Placeholder>
        </p>
      </LegalSection>

      <LegalSection n={10} title="Termination">
        <p>
          You or we may end the engagement on reasonable notice. Fees for work already done and disbursements
          incurred remain payable. Termination does not affect rights or obligations that accrued before it.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Governing law and disputes">
        <p>
          These Terms are governed by the laws of the Republic of South Africa. The parties will attempt to
          resolve disputes amicably; failing which, disputes are subject to{" "}
          <Placeholder>insert dispute-resolution mechanism and jurisdiction</Placeholder>.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Changes to these Terms">
        <p>
          We may update these Terms from time to time. The &ldquo;last updated&rdquo; date above reflects the
          current version; continued use after a change constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Contact">
        <p>
          Convey Clear (Pty) Ltd —{" "}
          <a href="mailto:hello@conveyclear.co.za" className="text-[#1B2E6B] hover:underline">
            hello@conveyclear.co.za
          </a>{" "}
          · +27 (0)76 810 4790.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
