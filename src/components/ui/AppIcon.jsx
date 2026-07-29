const PATHS = {
  alert: <><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></>,
  announcement: <><path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2Z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/></>,
  assignment: <><path d="M9 5h6"/><path d="M9 9h6"/><path d="M9 13h4"/><path d="M7 3h10a2 2 0 0 1 2 2v14H5V5a2 2 0 0 1 2-2Z"/><path d="m14 17 2 2 4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  billing: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h3"/></>,
  camera: <><path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10H3V8a2 2 0 0 1 2-2h3l1.5-2h5Z"/><circle cx="12" cy="12" r="3"/></>,
  chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  clipboard: <><path d="M9 4h6"/><path d="M9 8h6"/><path d="M8 2h8a2 2 0 0 1 2 2v18H6V4a2 2 0 0 1 2-2Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>,
  document: <><path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5"/><path d="M9 12h6"/><path d="M9 16h6"/></>,
  droplet: <path d="M12 3c-4.5 4.8-7 8-7 11a7 7 0 0 0 14 0c0-3-2.5-6.2-7-11Z"/>,
  external: <><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v6H5V5h6"/></>,
  feedback: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/><path d="M8 9h8"/><path d="M8 13h5"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  meter: <><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><path d="M6 18h12"/></>,
  pressure: <><path d="M4 6h16"/><path d="m7 10 5 5 5-5"/><path d="M12 15v6"/></>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11"/><path d="M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  tool: <><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6"/><path d="M18 14a5 5 0 0 1 3 6"/></>,
  waterOff: <><path d="M12 3c-3 3.2-5 5.8-6 8"/><path d="M5 15a7 7 0 0 0 11 4"/><path d="M18 16c.7-3.3-1.5-7.3-6-13"/><path d="m3 3 18 18"/></>,
}

export default function AppIcon({ name, className = 'w-5 h-5', title }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name] || PATHS.info}
    </svg>
  )
}
