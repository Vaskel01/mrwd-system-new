import { passwordStrength } from './passwordPolicy'

export function PasswordStrengthMeter({ password = '' }) {
  const { score, label, checks } = passwordStrength(password)
  const colors = ['bg-gray-300', 'bg-red-500', 'bg-amber-400', 'bg-brand-500', 'bg-green-600']

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map(level => (
          <span
            key={level}
            className={`h-1.5 flex-1 rounded-full ${score >= level ? colors[score] : 'bg-gray-200'}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-gray-600">Strength: {label}</span>
        <span className="text-gray-500">
          {checks.length ? '8+ characters' : 'Needs 8+ characters'} · {checks.letter ? 'letter' : 'needs a letter'} · {checks.number ? 'number' : 'needs a number'}
        </span>
      </div>
    </div>
  )
}
