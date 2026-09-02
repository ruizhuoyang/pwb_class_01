import './SidePanel.css'

export default function SidePanel() {
  return (
    <aside className="side-panel" aria-label="Scene controls">
      <h2 className="side-panel__title">Controls</h2>
      <p className="side-panel__hint">Sliders will go here soon.</p>

      <div className="side-panel__placeholder">
        <label className="side-panel__label" htmlFor="rotation-slider">
          Rotation
        </label>
        <input
          id="rotation-slider"
          className="side-panel__slider"
          type="range"
          min={0}
          max={100}
          defaultValue={50}
          disabled
        />
      </div>

      <div className="side-panel__placeholder">
        <label className="side-panel__label" htmlFor="scale-slider">
          Scale
        </label>
        <input
          id="scale-slider"
          className="side-panel__slider"
          type="range"
          min={0}
          max={100}
          defaultValue={50}
          disabled
        />
      </div>
    </aside>
  )
}
