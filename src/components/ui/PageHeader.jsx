export default function PageHeader({ eyebrow, title, description, actions, children, className = '' }) {
  return (
    <header className={`page-band wave-header page-header ${className}`}>
      {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.14em] text-gold-300">{eyebrow}</p> : null}
      <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-white">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-navy-200">{description}</p> : null}
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
