import { SubsectionNav } from "@/components/layout/subsection-nav";

export default function ContabilidadLayout({ children }: LayoutProps<"/contabilidad">) {
  return (
    <>
      <SubsectionNav sectionId="contabilidad" />
      {children}
    </>
  );
}
