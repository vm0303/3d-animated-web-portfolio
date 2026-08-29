import { useEffect } from 'react'

import Hero from './components/hero/Hero'
import About from './components/about/About'
import Portfolio from './components/portfolio/Portfolio'
import Contact from './components/contact/Contact'
import { initHeroQA } from './qaSrc/heroQa'
import { initManualRealDeviceEvidence } from './qaSrc/manualRealDeviceEvidence'

const App = () => {
  useEffect(() => {
    const cleanupQA = initHeroQA()
    const cleanupManualEvidence = initManualRealDeviceEvidence()

    return () => {
      cleanupQA?.()
      cleanupManualEvidence?.()
    }
  }, [])

  return (
    <div className="container">
      <section id="#hero">
        <Hero />
      </section>

      <section id="#about">
        <About />
      </section>

      <section id="#portfolio">
        <Portfolio />
      </section>

      <section id="#contact">
        <Contact />
      </section>
    </div>
  )
}

export default App