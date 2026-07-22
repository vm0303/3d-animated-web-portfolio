import Hero from './components/hero/Hero'
import About from './components/about/About'
import Portfolio from './components/portfolio/Portfolio'
import Contact from './components/contact/Contact'
 
const App = () => {
  return (
    <div className='container'>
      <section id="#hero">
      <Hero/>
      </section>
      <section id="#about">
        <About/>
      </section>
      <section id="#portfolio">
        <Portfolio/>
      </section>
      <section id="#contact">
        <Contact/>
      </section>
    </div>
  )
}


export default App