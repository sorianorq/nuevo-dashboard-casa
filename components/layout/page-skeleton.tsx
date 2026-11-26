/** Marcador mientras llega el contenido que depende de la sesión. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="animate-pulse space-y-4">
      <div className="mx-auto h-[52px] max-w-md rounded-2xl bg-track lg:mx-0" />
      <div className="h-48 fc-float" />
    </div>
  );
}
