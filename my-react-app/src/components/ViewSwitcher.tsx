import './ViewSwitcher.css'

export type ViewMode = '3d' | '2d' | 'sim'

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: '3d', label: '3D Scene' },
  { value: '2d', label: '2D Noise' },
  { value: 'sim', label: 'Simulation' },
]

type ViewSwitcherProps = {
  view: ViewMode
  onChange: (view: ViewMode) => void
}

export default function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  return (
    <nav className="view-switcher" aria-label="View mode">
      {VIEWS.map((item) => (
        <button
          key={item.value}
          type="button"
          className="view-switcher__button"
          aria-pressed={view === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
