import ThreeCanvas from './components/ThreeCanvas'
import SidePanel from './components/SidePanel'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">PWB Class 01</h1>
        <p className="app-subtitle">Interactive Three.js Canvas</p>
      </header>

      <main className="app-main">
        <section className="canvas-section" aria-label="3D viewport">
          <ThreeCanvas />
        </section>
        <SidePanel />
      </main>
    </div>
  )
}

export default App
