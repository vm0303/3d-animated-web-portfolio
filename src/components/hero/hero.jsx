import "./hero.css"
import { motion } from "framer-motion"
import Speech from "./Speech"
const Hero = () => {
  return (
    <div className='hero'>
      <div className="heroSection left">
        {/* TITLE */}
        <h1 className="heroTitle">Hey There, <br /><span>I'm Vishal!</span></h1>
        {/* SOCIALS */}
        <div className="certifications">
          <h2>Certifications</h2>
          <p>Click to verify on Credly</p>
          <div className="certificationsImages">
            <a href="https://www.credly.com/badges/c4fe3356-aa55-4677-af31-f441984ae352" target="_blank" rel="noreferrer">
              <img src="/ibm.png" alt="IBM Java Certification" title="IBM Java Certification" />
            </a>
            <a href="https://www.credly.com/badges/dc54d9be-8484-4569-9a73-e6c514391d4e" target="_blank" rel="noreferrer">
              <img src="/google.png" alt="Google AI Professional Certification" title="Google AI Professional Certification" />
            </a>
            <a href="https://www.credly.com/earner/earned/badge/56cd79b9-abe5-4ed9-b89c-09e93faac39d" target="_blank" rel="noreferrer">
              <img src="/AWS_Cloud.png" alt="AWS Cloud Practitioner Certification" title="AWS Cloud Practitioner Certification" />
            </a>



          </div>
        </div>
        {/* SCROLL SVG */}
        <a href="#about" className="scroll">
          <svg
            width="50px"
            height="50px"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 9C5 5.13401 8.13401 2 12 2C15.866 2 19 5.13401 19 9V15C19 18.866 15.866 22 12 22C8.13401 22 5 18.866 5 15V9Z"
              stroke="white"
              strokeWidth="1"
            />
            <motion.path
              animate={{ y: [0, 5] }}
              transition={{
                repeat: Infinity,
                duration: 4,
                ease: "easeInOut",
              }}
              d="M12 5V8"
              stroke="white"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>

        </a>
      </div>
      <div className="heroSection right">
        {/* SOCIALS */}
        <div className="socials">
          <a href="https://github.com/vm0303" target="_blank" rel="noreferrer">
            <img src="/github.png" alt="GitHub" title="GitHub" />
          </a>
          <a href="https://www.linkedin.com/in/vishal-madhav/" target="_blank" rel="noreferrer">
            <img src="/linkedin.png" alt="LinkedIn" title="LinkedIn" />
          </a>
          <a href="https://www.instagram.com/vmadhav33/" target="_blank" rel="noreferrer">
            <img src="/instagram.png" alt="Instagram" title="Instagram" />
          </a>
          <div className="socialsTextContainer">
            <div className="socialsText">FOLLOW ME</div>
          </div>
        </div>
        {/* BUBBLE */}
        <Speech />
        {/* CONTACT ME BUTTON */}
        <a href="/#contact" className="contactButtonLink">
          <div className="contactButton">
            <svg viewBox="0 0 200 200" width="150" height="150">
              <circle cx="100" cy="100" r="90" fill="#010134" />
              <path
                id="innerCirclePath"
                fill="none"
                d="M 100,100 m -60,0 a 60,60 0 1,1 120,0 a 60,60 0 1,1 -120,0"
              />
              <text className="circleText" fill="white">
                <textPath href="#innerCirclePath">Hire Now •</textPath>
              </text>
              <text className="circleText" fill="white">
                <textPath href="#innerCirclePath" startOffset="44%">
                  Contact Me •
                </textPath>
              </text>
            </svg>
            <div className="arrow">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="50"
                height="50"
                fill="none"
                stroke="white"
                strokeWidth="2"
              >
                <line x1="6" y1="18" x2="18" y2="6" />
                <polyline points="9 6 18 6 18 15" />
              </svg>
            </div>


          </div></a>
      </div>
    </div>
  )
}

export default Hero