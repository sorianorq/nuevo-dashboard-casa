import { SubsectionNav } from "@/components/layout/subsection-nav";

export default function PagosLayout({ children }: LayoutProps<"/pagos">) {
  return (
    <>
      <SubsectionNav sectionId="pagos" />
      {children}
    </>
  );
}
