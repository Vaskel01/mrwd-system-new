import { useId } from 'react'

export default function FormField({ label, hint, error, required = false, children, id }) {
  const generatedId = useId()
  const fieldId = id || generatedId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = typeof children === 'function'
    ? children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) || undefined })
    : children

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-bold text-gray-700">
        {label}{required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
      </label>
      {hint ? <p id={hintId} className="mt-1 text-sm leading-5 text-gray-500">{hint}</p> : null}
      <div className="mt-2">{control}</div>
      {error ? <p id={errorId} className="mt-1.5 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  )
}
