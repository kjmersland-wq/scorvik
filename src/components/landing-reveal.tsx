"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./landing-v2.module.css";

type State = "visible" | "hidden" | "shown";

/**
 * Soft scroll-in for landing sections. Content is visible in the server-rendered HTML: it is only hidden after
 * hydration, and only when it starts below the fold, so the page is never blank without JavaScript.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("visible");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already in view: leave it alone
    // A scroll check (not IntersectionObserver) so sections skipped by anchor jumps or fast scrolling still appear.
    const check = () => {
      if (element.getBoundingClientRect().top < window.innerHeight * 0.88) {
        setState("shown");
        window.removeEventListener("scroll", check);
      }
    };
    setState("hidden");
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${state === "hidden" ? styles.revealHidden : ""} ${className}`}
      style={{ "--delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
