import { forwardRef } from 'react'
import AppIcon from './AppIcon'

const SearchField = forwardRef(function SearchField({ value, onChange, onClear, placeholder = 'Search…', className = '', inputClassName = '', ariaLabel, hint = true, ...props }, ref) {
  const clear = () => {
    if (onClear) onClear()
    else onChange?.({ target: { value: '' } })
  }
  return (
    <div className={`relative min-w-0 ${className}`}>
      <AppIcon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        {...props}
        ref={ref}
        data-qol-search="true"
        type="search"
        aria-label={ariaLabel || placeholder}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`input-field rounded-lg pl-9 ${value ? 'pr-20' : hint ? 'pr-14' : 'pr-3'} ${inputClassName}`}
      />
      {value ? (
        <button type="button" onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-black uppercase text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Clear search">Clear</button>
      ) : hint ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-bold text-gray-500 sm:inline">/</span>
      ) : null}
    </div>
  )
})

export default SearchField
