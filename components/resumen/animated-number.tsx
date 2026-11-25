"use client";

import { useEffect, useState } from "react";
import { formatAmount, formatPercent } from "@/lib/format";

/**
 * Cifra que cuenta desde 0 hasta su valor al aparecer (0,6 s, frenando al
 * final). Sin animación si el sistema pide reducir el movimiento. El servidor
 * la pinta ya con su valor, así se lee aunque no haya JavaScript.
 */
export function AnimatedNumber({ value, kind }: { value: number; kind: "amount" | "percent" }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const text = kind === "amount" ? formatAmount(shown) : formatPercent(shown);
  const final = kind === "amount" ? formatAmount(value) : formatPercent(value);
  return (
    <>
      <span aria-hidden>{text}</span>
      <span className="sr-only">{final}</span>
    </>
  );
}
