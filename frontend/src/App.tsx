import { useState } from 'react'
import './index.css'

function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]">
      <div className="text-center bg-[var(--color-surface)] p-8 rounded-[10px] border border-[var(--color-border)] max-w-lg w-full">
        <h1 className="text-3xl font-semibold mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Personal Time Intelligence
        </h1>
        <p className="text-[var(--color-ink-muted)] mb-8">
          Welcome to the scheduling-aware habit assistant.
        </p>
        <button className="bg-[var(--color-free)] text-white px-6 py-3 rounded-[10px] font-medium hover:brightness-95 transition-all">
          Get Started
        </button>
      </div>
    </div>
  )
}

export default App
