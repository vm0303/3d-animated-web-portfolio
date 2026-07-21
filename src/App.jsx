import Hero from './components/hero/Hero'
import About from './components/about/About'
import Portfolio from './components/portfolio/Portfolio'
import Contact from './components/contact/Contact'
 
const App = () => {
  return (
    <div className='container'>
      <Hero/>
      <About/>
      <Portfolio/>
      <Contact/>
    </div>
  )
}


export default App