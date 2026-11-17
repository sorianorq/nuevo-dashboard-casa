export function ResumenSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando resumen" className="animate-pulse space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
        <div className="mx-auto h-[52px] w-full max-w-md rounded-2xl bg-track lg:mx-0" />
        <div className="mx-auto h-[54px] w-60 rounded-2xl bg-track lg:mx-0" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-card border bg-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="h-[340px] rounded-card border bg-card lg:col-span-2" />
        <div className="h-[340px] rounded-card border bg-card" />
      </div>
    </div>
  );
}
