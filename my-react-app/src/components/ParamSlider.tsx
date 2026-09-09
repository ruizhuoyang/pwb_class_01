import './ParamSlider.css'

type ParamSliderProps = {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  format?: (value: number) => string
  onChange: (value: number) => void
}

export default function ParamSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  format = (raw) => String(raw),
  onChange,
}: ParamSliderProps) {
  return (
    <div className="param-slider" data-disabled={disabled || undefined}>
      <div className="param-slider__row">
        <label className="param-slider__label" htmlFor={id}>
          {label}
        </label>
        <output className="param-slider__value" htmlFor={id}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className="param-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
