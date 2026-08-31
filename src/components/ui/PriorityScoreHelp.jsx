import AppIcon from './AppIcon'

export default function PriorityScoreHelp({ align = 'left' }) {
  return (
    <details className="relative inline-block group">
      <summary
        className="list-none inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-navy-600 hover:bg-navy-50 cursor-pointer"
        aria-label="Explain priority score bands"
      >
        <AppIcon name="info" className="h-3.5 w-3.5" />
      </summary>
      <div className={`absolute z-30 mt-2 w-64 rounded-xl border border-navy-100 bg-white p-3 text-left shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
        <p className="text-xs font-black text-navy-900">Priority score bands</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-600">
          <dt className="font-bold text-green-700">Low</dt><dd>0–29</dd>
          <dt className="font-bold text-amber-700">Medium</dt><dd>30–59</dd>
          <dt className="font-bold text-red-700">High</dt><dd>60–100</dd>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">The system estimates priority from the complaint type, matched words or phrases, detected urgency, and whether a photo was attached.</p>
      </div>
    </details>
  )
}
