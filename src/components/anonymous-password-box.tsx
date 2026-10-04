"use client";

import { useActionState } from "react";
import { signInWithPreviewPassword, type SignInState } from "@/app/auth-actions";
import type { Locale } from "@/lib/i18n/copy";
import styles from "./anonymous-password-box.module.css";

const messages = {
  en: {
    region: "SCORVIK preview access",
    eyebrow: "SCORVIK PREVIEW",
    title: "Ready to make a film?",
    description: "Enter the preview password to open the film studio.",
    label: "Password",
    button: "Open the studio",
    pending: "Opening…",
  },
  no: {
    region: "Tilgang til SCORVIK-forhåndsvisning",
    eyebrow: "SCORVIK FORHÅNDSVISNING",
    title: "Klar til å lage film?",
    description: "Skriv inn passordet for å åpne filmverkstedet.",
    label: "Passord",
    button: "Åpne filmverkstedet",
    pending: "Åpner…",
  },
} satisfies Record<Locale, Record<string, string>>;

const initialState: SignInState = {};

export function AnonymousPasswordBox({ locale, nextPath = "/create", standalone = false }: { locale: Locale; nextPath?: string; standalone?: boolean }) {
  const [state, formAction, pending] = useActionState(signInWithPreviewPassword, initialState);
  const text = messages[locale];
  const fieldId = `preview-password-${locale}`;

  return (
    <aside className={`${styles.box} ${standalone ? styles.standalone : ""}`} aria-label={text.region}>
      <span className={styles.eyebrow}>{text.eyebrow}</span>
      <h2 className={styles.title}>{text.title}</h2>
      <p className={styles.description}>{text.description}</p>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor={fieldId}>{text.label}</label>
        <input
          className={styles.input}
          id={fieldId}
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          required
        />
        {state.error && <p className={styles.error} role="alert">{state.error}</p>}
        <button className="button" type="submit" disabled={pending}>
          {pending ? text.pending : text.button}
        </button>
      </form>
    </aside>
  );
}
