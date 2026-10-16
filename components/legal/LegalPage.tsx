"use client";

import Link from "@/components/shell/LocalizedLink";
import { usePreferences } from "@/components/shell/PreferencesProvider";
import { legalCopy, legalRoutes, type LegalPageId } from "./legalCopy";
import styles from "./LegalPage.module.css";

export function LegalPage({ page }: { page: LegalPageId }) {
  const { locale, openConsent } = usePreferences();
  const text = legalCopy[locale];
  const document = text.documents[page];

  return (
    <article className={styles.page} lang={locale}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>MMWR / Malaysia Most Wanted Ranking</p>
        <h1>{document.title}</h1>
        <p className={styles.intro}>{document.intro}</p>
        <p className={styles.draft} role="note"><strong>{text.draft}</strong><span>{text.pending}</span></p>
      </header>
      <div className={styles.layout}>
        <nav className={styles.navigation} aria-label={text.navigation}>
          {legalRoutes.map(({ id, href }) => (
            <Link key={id} href={href} aria-current={id === page ? "page" : undefined}>{text.documents[id].title}</Link>
          ))}
          <button type="button" onClick={openConsent}>{text.cookieSettings}</button>
        </nav>
        <div className={styles.sections}>
          {document.sections.map((section, index) => (
            <section key={section.heading} aria-labelledby={`${page}-section-${index}`}>
              <h2 id={`${page}-section-${index}`}>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
