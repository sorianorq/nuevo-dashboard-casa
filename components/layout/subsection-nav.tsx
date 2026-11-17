"use client";

import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/lib/nav";
import { SegmentedLinks } from "./segmented";

/** Subsecciones como pestañas segmentadas arriba (solo móvil). */
export function SubsectionNav({ sectionId }: { sectionId: string }) {
  const pathname = usePathname();
  const section = NAV.find((s) => s.id === sectionId);
  if (!section?.children) return null;

  return (
    <SegmentedLinks
      label={section.label}
      className="mb-5 lg:hidden"
      items={section.children.map((c) => ({
        label: c.label,
        href: c.href,
        active: isActive(pathname, c.href),
      }))}
    />
  );
}
