import "./hero.css";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import Speech from "./Speech";


const heroTitleVariants = {
  initial: {
    y: -300,
    opacity: 0,
  },
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 2,
    },
  },
};

const heroTitleMobileVariants =
{
  initial: {
    y: -300,
    opacity: 0,
  },
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 2,
    },
  },
};

const certificationsVariants = {
  initial: {
    x: -300,
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 1,
      staggerChildren: 0.4,
    },
  },
};


const certificationsMobileVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 1,
      delay: 1.2,
    },
  },
};

const bubbleVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 1, delay: 0.8, ease: "easeOut" },
  },
};

const bubbleMobileVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 1, delay: 1.0 },
  },
};

const socialVariants = {
  initial: {
    y: -300,
    opacity: 0,
  },
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 1.5,
      staggerChildren: 0.2,
    },
  },
};

const mobileMediaQuery =
  "(max-width: 884px) and (max-height: 1104px) and (min-height: 1025px), " +
  "(max-width: 820px) and (max-height: 1180px) and (min-height: 1081px), " +
  "(max-width: 984px) and (max-height: 1092px) and (min-height: 1025px), " +
  "(max-width: 834px)  and (max-height: 1194px) and (min-height: 1085px), " +
  "(max-width: 800px) and (max-height: 1280px) and (min-height: 1180px), " +
  "(max-width: 768px) and (max-height: 1076px) and (min-height: 1000px), " +
  "(max-width: 744px) and (max-height: 1133px) and (min-height: 1030px)";

const Hero = () => {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(mobileMediaQuery).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(mobileMediaQuery);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const activeCertVariants = isMobile ? certificationsMobileVariants : certificationsVariants;
  const activeBubbleVariants = isMobile ? bubbleMobileVariants : bubbleVariants;
  const activeHeroTitleVariants = isMobile ? heroTitleMobileVariants : heroTitleVariants;
  return (
    <div className='hero'>
      <div className="heroSection left">
        {/* TITLE */}
        <motion.h1
          variants={activeHeroTitleVariants}
          initial="initial"
          animate="animate"
          className="heroTitle">
          Hey There, <br /><span>I'm Vishal!</span></motion.h1>
        {/* CERTIFICATIONS */}
        <motion.div
          variants={activeCertVariants}
          initial="initial"
          animate="animate"
          className="certifications">

          <motion.h2>My certifications</motion.h2>
          <motion.p>Click to verify on Credly</motion.p>
          <motion.div variants={activeCertVariants} className="certificationsImages">
            <a href="https://www.credly.com/badges/c4fe3356-aa55-4677-af31-f441984ae352" target="_blank" rel="noreferrer">
              <motion.img variants={activeCertVariants} src="/ibm.png" alt="IBM Java Certification" title="IBM Java Certification" />
            </a>
            <a href="https://www.credly.com/badges/dc54d9be-8484-4569-9a73-e6c514391d4e" target="_blank" rel="noreferrer">
              <motion.img variants={activeCertVariants} src="/google.png" alt="Google AI Professional Certification" title="Google AI Professional Certification" />
            </a>
            <a href="https://www.credly.com/earner/earned/badge/56cd79b9-abe5-4ed9-b89c-09e93faac39d" target="_blank" rel="noreferrer">
              <motion.img variants={activeCertVariants} src="/AWS_Cloud.png" alt="AWS Cloud Practitioner Certification" title="AWS Cloud Practitioner Certification" />
            </a>
          </motion.div>
        </motion.div>
        {/* SCROLL SVG */}
        <motion.a animate={{ y: [0, 5], opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}

          href="#about" className="scroll">
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

        </motion.a>
      </div>
      <div className="heroSection right">
        {/* SOCIALS */}
        <motion.div variants={socialVariants} initial="initial" animate="animate" className="socials">
          <motion.a variants={socialVariants} href="https://github.com/vm0303" target="_blank" rel="noreferrer">
            <img src="/github.png" alt="GitHub" title="GitHub" />
          </motion.a>
          <motion.a variants={socialVariants} href="https://www.linkedin.com/in/vishal-madhav/" target="_blank" rel="noreferrer">
            <img src="/linkedin.png" alt="LinkedIn" title="LinkedIn" />
          </motion.a>
          <motion.a variants={socialVariants} href="https://www.instagram.com/vmadhav33/" target="_blank" rel="noreferrer">
            <img src="/instagram.png" alt="Instagram" title="Instagram" />
          </motion.a>
          <div className="socialsTextContainer">
            <div className="socialsText">FOLLOW ME</div>
          </div>
        </motion.div>
        {/* BUBBLE */}
        <Speech variants={activeBubbleVariants} />
        {/* CONTACT ME BUTTON */}
        <motion.a href="/#contact" className="contactButtonLink" animate={{ x: [200, 0], opacity: [0, 1] }} transition={{ duration: 2 }}>
          <motion.div className="contactButton" animate={{ rotate: [0, 360] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
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
          </motion.div>
        </motion.a>
      </div>
      <div className="bg">
        {/* 3d */}
        <div className="hImg">
          <img src="/Hero.png" alt="Hero" title="Hero" />
        </div>
      </div>
    </div >
  )
}

export default Hero