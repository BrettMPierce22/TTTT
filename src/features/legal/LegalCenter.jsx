import "./LegalCenter.css";
import tableTalkAppIcon from "../../assets/table-talk-app-icon.png";

const UPDATED_DATE = "August 24, 2026";

const PAGE_META = {
  privacy: {
    eyebrow: "YOUR DATA",
    title: "Privacy Policy",
    summary:
      "How Table Talk collects, uses, shares, and protects information.",
  },
  terms: {
    eyebrow: "TERMS",
    title: "Terms of Use",
    summary: "The rules for using Table Talk Table Tennis.",
  },
  community: {
    eyebrow: "PLAY FAIR",
    title: "Community Guidelines",
    summary:
      "The standards that keep leagues, chats, reviews, and table listings welcoming and useful.",
  },
  support: {
    eyebrow: "WE CAN HELP",
    title: "Support & Safety",
    summary:
      "Get help with your account, report a safety concern, or find common answers.",
  },
};

function PolicyNav({ activePage, onNavigate }) {
  return (
    <nav className="legal-page-nav" aria-label="Safety and legal pages">
      {Object.entries(PAGE_META).map(([key, item]) => (
        <button
          key={key}
          type="button"
          className={activePage === key ? "legal-page-nav-active" : ""}
          onClick={() => onNavigate(key)}
        >
          {item.title.replace(" Policy", "").replace(" of Use", "")}
        </button>
      ))}
    </nav>
  );
}

function PrivacyPolicy({ supportEmail, onNavigate }) {
  return (
    <>
      <section>
        <h2>Privacy at a glance</h2>
        <p>
          Table Talk Table Tennis uses the information needed to provide
          accounts, leagues, tournaments, chat, player profiles, match records,
          and community table discovery. We do not sell personal information,
          and the current app does not use personal information for targeted
          advertising.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <h3>Account and profile information</h3>
        <ul>
          <li>Email address and authentication identifiers.</li>
          <li>
            Optional display name, profile photo, player description, height,
            and self-reported ball velocity.
          </li>
          <li>League memberships, roles, and account preferences.</li>
        </ul>

        <h3>League and tournament activity</h3>
        <ul>
          <li>
            League names, member lists, invitations, match scores, rankings,
            tournament entries, brackets, and results.
          </li>
          <li>
            Messages sent in league chat or private conversations, along with
            reports and blocks used for community safety.
          </li>
        </ul>

        <h3>Table locator content</h3>
        <ul>
          <li>
            Public venue names, addresses, map coordinates, access details,
            photos, ratings, reviews, and accuracy or safety reports.
          </li>
          <li>
            The account identifier associated with a submission so it can be
            moderated and managed.
          </li>
        </ul>

        <h3>Device location and technical information</h3>
        <p>
          If you choose <strong>Near Me</strong> or another location feature,
          the app requests your device location to center the map and calculate
          nearby tables. Table Talk does not create a separate history of your
          live location. A location you intentionally submit as a public table
          listing is stored with that listing.
        </p>
        <p>
          Hosting, authentication, storage, and mapping providers may process
          routine technical information such as IP address, device or browser
          type, request times, and diagnostic data needed to deliver and secure
          their services.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <ul>
          <li>Authenticate accounts and recover access.</li>
          <li>Operate leagues, rankings, matches, tournaments, and chat.</li>
          <li>Review and publish eligible community table content.</li>
          <li>Investigate reports, prevent abuse, and enforce our rules.</li>
          <li>Maintain security, reliability, and app functionality.</li>
          <li>Respond to support requests and legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>When information is shared</h2>
        <p>We share information only as needed to operate the service:</p>
        <ul>
          <li>
            <strong>Other users.</strong> Player profiles, league activity,
            approved table listings, and other content are visible according to
            the feature and league in which they are posted. Login email
            addresses are not displayed on player profiles.
          </li>
          <li>
            <strong>Supabase.</strong> Supabase provides authentication,
            database, file storage, and server-function infrastructure.
          </li>
          <li>
            <strong>Mapping services.</strong> The iPhone app can use Apple
            geocoding and Apple Maps for directions. Map tiles in the locator
            are provided by OpenStreetMap infrastructure.
          </li>
          <li>
            <strong>Legal and safety needs.</strong> Information may be
            preserved or disclosed when reasonably necessary to comply with
            law, protect users, investigate fraud or abuse, or defend legal
            rights.
          </li>
        </ul>
      </section>

      <section>
        <h2>Retention and account deletion</h2>
        <p>
          We keep information while your account is active and as needed to
          operate, secure, and comply with legal obligations. You can delete
          your account in <strong>My Leagues → My Profile</strong>. Deletion
          removes your login, profile, messages, submissions, ratings, and
          account photos. Historical match records retain an anonymous
          “Deleted Player” entry so other players’ league records remain
          accurate. League owners must transfer or delete owned leagues first.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Edit profile information in the app.</li>
          <li>Manage or delete table listings you submitted.</li>
          <li>Block another player or reviewer where that option appears.</li>
          <li>Deny device-location access in iPhone Settings.</li>
          <li>Delete your account from My Profile.</li>
          <li>
            Contact us to ask about access, correction, deletion, or another
            privacy request.
          </li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          Table Talk is not directed to children under 13, and we do not
          knowingly collect personal information from children under 13. If you
          believe a child has provided information improperly, contact us so we
          can review and remove it.
        </p>
      </section>

      <section>
        <h2>Security and changes</h2>
        <p>
          We use access controls and other reasonable safeguards, but no online
          service can guarantee absolute security. We may update this policy as
          the app changes. Material updates will be identified by a new “Last
          updated” date and, when appropriate, an in-app notice.
        </p>
      </section>

      <ContactBlock
        supportEmail={supportEmail}
        onNavigate={onNavigate}
        privacy
      />
    </>
  );
}

function TermsOfUse({ supportEmail, onNavigate }) {
  return (
    <>
      <section>
        <h2>Agreement and eligibility</h2>
        <p>
          These Terms govern your use of Table Talk Table Tennis. By creating
          an account or using the service, you agree to these Terms and the
          Community Guidelines. You must be at least 13 years old. If you are
          under the age of legal majority where you live, a parent or guardian
          must permit your use of the service.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Provide accurate account information and protect your password.</li>
          <li>Do not share an account or impersonate another person.</li>
          <li>
            You are responsible for activity performed through your account
            unless you promptly report unauthorized access.
          </li>
          <li>
            League organizers are responsible for managing their membership,
            scores, events, and administrator access appropriately.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of content you submit. You grant Table Talk a
          worldwide, non-exclusive, royalty-free license to host, store,
          reproduce, format, display, and distribute that content only as
          reasonably needed to operate, improve, moderate, and promote the
          service. This license ends when the content is deleted, except for
          copies reasonably retained for security, legal compliance, or
          anonymized league history.
        </p>
        <p>
          You must have the right to submit your content. Do not post private
          information, copyrighted material you do not control, or photos of
          people without appropriate permission.
        </p>
      </section>

      <section>
        <h2>Public table listings</h2>
        <p>
          Only submit tables at legitimate public venues or locations where the
          owner has authorized public access. Never list a private residence.
          Access hours, equipment, safety, fees, and availability can change;
          confirm conditions with the venue before visiting. Table Talk does
          not own, operate, inspect, or guarantee listed venues.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You may not use Table Talk to:</p>
        <ul>
          <li>Harass, threaten, exploit, stalk, or deceive another person.</li>
          <li>Post illegal, hateful, sexually explicit, or violent content.</li>
          <li>Publish private information or create unsafe meetups.</li>
          <li>Manipulate matches, ratings, rankings, reports, or accounts.</li>
          <li>Upload malware, scrape the service, or bypass access controls.</li>
          <li>Spam, advertise deceptively, or interfere with other users.</li>
        </ul>
        <button
          type="button"
          className="legal-inline-link"
          onClick={() => onNavigate("community")}
        >
          Read the full Community Guidelines →
        </button>
      </section>

      <section>
        <h2>Moderation and enforcement</h2>
        <p>
          We may review, restrict, reject, remove, or preserve content and may
          warn, suspend, or terminate accounts when reasonably necessary to
          enforce these Terms, protect people, investigate reports, or comply
          with law. Moderation decisions may be imperfect; contact Support if
          you believe we made a mistake.
        </p>
      </section>

      <section>
        <h2>Service changes and availability</h2>
        <p>
          We may change, suspend, or discontinue features. We work to keep Table
          Talk available but do not promise uninterrupted or error-free service.
          League records and table listings should not be relied on for
          emergencies, wagering, official competition certification, or venue
          safety decisions.
        </p>
      </section>

      <section>
        <h2>Disclaimers and responsibility</h2>
        <p>
          To the extent permitted by law, Table Talk is provided “as is” and
          “as available.” You are responsible for your conduct, meetups, league
          decisions, and interactions with venues and other users. Table tennis
          and travel to venues involve ordinary risks; use appropriate judgment
          and follow venue rules.
        </p>
        <p>
          Nothing in these Terms limits rights or remedies that cannot lawfully
          be limited. If a provision is unenforceable, the remaining provisions
          continue to apply.
        </p>
      </section>

      <section>
        <h2>Ending use and updates</h2>
        <p>
          You may stop using Table Talk or delete your account at any time. We
          may update these Terms as the service changes. Material updates will
          be identified by a revised date and, when appropriate, an in-app
          notice. Continued use after an update means you accept the revised
          Terms.
        </p>
      </section>

      <ContactBlock supportEmail={supportEmail} onNavigate={onNavigate} />
    </>
  );
}

function CommunityGuidelines({ supportEmail, onNavigate }) {
  return (
    <>
      <section className="legal-highlight-card">
        <h2>Compete hard. Treat people well.</h2>
        <p>
          Table Talk is for real leagues, friendly competition, and finding
          legitimate places to play. These rules apply to profiles, chats,
          reviews, photos, table listings, league names, and tournament content.
        </p>
      </section>

      <section>
        <h2>Be respectful</h2>
        <ul>
          <li>No harassment, bullying, threats, stalking, or intimidation.</li>
          <li>
            No hateful attacks or degrading content based on identity or
            protected characteristics.
          </li>
          <li>
            No sexual exploitation, sexual content involving minors, or
            unwanted sexual attention.
          </li>
          <li>No encouragement of violence, self-harm, or dangerous conduct.</li>
        </ul>
      </section>

      <section>
        <h2>Protect privacy and safety</h2>
        <ul>
          <li>
            Never post home addresses, phone numbers, private messages, or other
            identifying information without permission.
          </li>
          <li>Do not impersonate another player, venue, or organization.</li>
          <li>
            Do not pressure anyone to meet privately. Use public venues and
            exercise appropriate caution when meeting other players.
          </li>
          <li>
            If there is an immediate threat or emergency, contact local
            emergency services rather than relying on an in-app report.
          </li>
        </ul>
      </section>

      <section>
        <h2>Keep table listings accurate</h2>
        <ul>
          <li>Submit public venues only—never private residences.</li>
          <li>
            Use accurate addresses, pins, access details, photos, and current
            information.
          </li>
          <li>
            Do not advertise a venue as free or public when access is restricted.
          </li>
          <li>
            Report closed, removed, unsafe, private, duplicated, or inaccurate
            listings so moderators can review them.
          </li>
        </ul>
      </section>

      <section>
        <h2>Keep competition honest</h2>
        <ul>
          <li>Record real match results and correct mistakes promptly.</li>
          <li>No fake accounts, review manipulation, or coordinated reporting.</li>
          <li>
            League organizers should explain their rules and apply them fairly.
          </li>
          <li>No spam, scams, malware, or deceptive promotions.</li>
        </ul>
      </section>

      <section>
        <h2>Reporting, blocking, and enforcement</h2>
        <p>
          Use the report option attached to a message, review, or listing when
          possible; it gives moderators the context needed to investigate. You
          can also block abusive players or reviewers where the feature is
          available. For urgent or account-level concerns, contact Support.
        </p>
        <p>
          Depending on severity and history, we may reject or remove content,
          restrict features, warn a user, suspend an account, permanently ban
          an account, preserve evidence, or contact appropriate authorities.
          Good-faith reporting is protected; knowingly false or retaliatory
          reports may themselves violate these rules.
        </p>
      </section>

      <ContactBlock supportEmail={supportEmail} onNavigate={onNavigate} />
    </>
  );
}

function SupportPage({ supportEmail, onNavigate }) {
  const subject = encodeURIComponent("Table Talk support request");
  const body = encodeURIComponent(
    "Please describe what happened. Do not include your password or API keys.\n\nApp area:\nLeague name (if relevant):\nDevice:\n"
  );

  return (
    <>
      <section className="legal-support-hero">
        <div>
          <h2>Contact Table Talk Support</h2>
          <p>
            Include the app area, league name if relevant, and a short
            description. Never send your password or private API keys.
          </p>
        </div>
        <a
          className="legal-contact-button"
          href={`mailto:${supportEmail}?subject=${subject}&body=${body}`}
        >
          Email {supportEmail}
        </a>
      </section>

      <section>
        <h2>Safety reports</h2>
        <p>
          For an offensive chat message, review, or table listing, use its
          in-app <strong>Report</strong> option first. Reports include the item
          needed for moderation. Email Support for account-level abuse, an
          unavailable report control, or additional context. Urgent safety
          concerns are prioritized. For immediate danger, contact local
          emergency services.
        </p>
      </section>

      <section>
        <h2>Account help</h2>
        <h3>Reset a password</h3>
        <p>
          Choose <strong>Forgot password?</strong> on the login screen. A reset
          message will be sent to the email attached to the account.
        </p>
        <h3>Delete an account</h3>
        <p>
          Open <strong>My Leagues → My Profile → Delete Account</strong>. If
          you own a league, transfer ownership or delete that league before
          deleting your account.
        </p>
        <h3>Edit or delete a table listing</h3>
        <p>
          Open <strong>Find Tables</strong>, select your listing, and use its
          edit or delete control. Reports can be used for listings you do not
          own.
        </p>
      </section>

      <section>
        <h2>Useful policies</h2>
        <div className="legal-link-grid">
          {[
            ["privacy", "Privacy Policy", "Data, location, photos, and deletion"],
            ["terms", "Terms of Use", "Account and service rules"],
            ["community", "Community Guidelines", "Safety, content, and moderation"],
          ].map(([key, title, copy]) => (
            <button key={key} type="button" onClick={() => onNavigate(key)}>
              <strong>{title}</strong>
              <span>{copy}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Response expectations</h2>
        <p>
          We aim to acknowledge ordinary support requests within two business
          days. Investigations can take longer depending on complexity. Safety
          reports involving credible threats, minors, or private information
          receive priority.
        </p>
      </section>
    </>
  );
}

function ContactBlock({ supportEmail, onNavigate, privacy = false }) {
  return (
    <section className="legal-contact-block">
      <h2>Contact us</h2>
      <p>
        Questions {privacy ? "or privacy requests " : ""}can be sent to{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
      <button
        type="button"
        className="legal-inline-link"
        onClick={() => onNavigate("support")}
      >
        Open Support & Safety →
      </button>
    </section>
  );
}

export function LegalLinks({ onNavigate, compact = false }) {
  return (
    <div className={compact ? "legal-links legal-links-compact" : "legal-links"}>
      <button type="button" onClick={() => onNavigate("privacy")}>
        Privacy
      </button>
      <button type="button" onClick={() => onNavigate("terms")}>
        Terms
      </button>
      <button type="button" onClick={() => onNavigate("community")}>
        Community
      </button>
      <button type="button" onClick={() => onNavigate("support")}>
        Support
      </button>
    </div>
  );
}

export default function LegalCenter({
  page = "privacy",
  supportEmail,
  onNavigate,
  onClose,
}) {
  const activePage = PAGE_META[page] ? page : "privacy";
  const meta = PAGE_META[activePage];

  return (
    <div className="legal-page">
      <header className="legal-header">
        <div className="legal-header-inner">
          <button type="button" className="legal-brand" onClick={onClose}>
            <img className="legal-brand-icon" src={tableTalkAppIcon} alt="" />
            <span>
              <strong>Table Talk Table Tennis</strong>
              <small>Safety & Legal</small>
            </span>
          </button>
          <button type="button" className="legal-close-button" onClick={onClose}>
            Back to App
          </button>
        </div>
      </header>

      <main className="legal-main">
        <div className="legal-title-card">
          <p>{meta.eyebrow}</p>
          <h1>{meta.title}</h1>
          <span>{meta.summary}</span>
          <small>Last updated {UPDATED_DATE}</small>
        </div>

        <PolicyNav activePage={activePage} onNavigate={onNavigate} />

        <article className="legal-content">
          {activePage === "privacy" && (
            <PrivacyPolicy
              supportEmail={supportEmail}
              onNavigate={onNavigate}
            />
          )}
          {activePage === "terms" && (
            <TermsOfUse
              supportEmail={supportEmail}
              onNavigate={onNavigate}
            />
          )}
          {activePage === "community" && (
            <CommunityGuidelines
              supportEmail={supportEmail}
              onNavigate={onNavigate}
            />
          )}
          {activePage === "support" && (
            <SupportPage
              supportEmail={supportEmail}
              onNavigate={onNavigate}
            />
          )}
        </article>
      </main>

      <footer className="legal-footer">
        <span>© 2026 Table Talk Table Tennis</span>
        <LegalLinks onNavigate={onNavigate} compact />
      </footer>
    </div>
  );
}
