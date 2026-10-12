import "./hero.css";
import { motion } from "motion/react";
import { Component, useState, useEffect, useRef, Suspense } from "react";
import Speech from "./Speech";
import { Canvas } from "@react-three/fiber";
import Shape from "./Shape";


class HeroCanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn(
      "[Hero] 3D canvas failed; continuing with the DOM/image Hero fallback.",
      error,
    );
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}


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
    x: -350,
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 1,
      staggerChildren: 0.5,
    },
  },
};


const certificationsMobileVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    x: 0,
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
    y: -350,
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

const backgroundVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 1.6,
      delay: 0.7,
    },
  },
};

const mobileMediaQuery =
  "(max-width: 1024px) and (orientation: portrait), " +
  "(max-height: 1376px) and (orientation: portrait)"

const easeInOutCubic = (progress) =>
  progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

const Hero = () => {
  const hasMounted = useRef(false);
  const scrollAnimationFrameRef = useRef(null);
  const scrollCleanupRef = useRef(null);

  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(mobileMediaQuery).matches
  );

  useEffect(() => {
    hasMounted.current = true;
    const mq = window.matchMedia(mobileMediaQuery);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    /*
     * Safari 26+ on iPhone/iPad uses the floating Liquid Glass browser UI.
     * Real-device validation shows Safari can paint content below the
     * JavaScript visual viewport, while Chrome on the same device behaves
     * correctly.
     *
     * Detect the browser family/version, not an iPhone model, so this applies
     * to every iOS 26-compatible iPhone running Safari 26+.
     */
    const ua = navigator.userAgent;
    const platform = navigator.platform;

    const isIOSDevice =
      /iPhone|iPad|iPod/i.test(ua) ||
      (platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const isOtherIOSBrowser =
      /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|DdgA|YaBrowser/i.test(ua);

    const safariVersionMatch =
      ua.match(/Version\/(\d+)(?:\.(\d+))?.*Safari\//i);

    const safariMajor = safariVersionMatch
      ? Number(safariVersionMatch[1])
      : 0;

    const usesLiquidSafariViewport =
      isIOSDevice &&
      !isOtherIOSBrowser &&
      safariMajor >= 26;

    document.documentElement.classList.toggle(
      "ios-safari-liquid-ui",
      usesLiquidSafariViewport
    );

    return () => {
      document.documentElement.classList.remove("ios-safari-liquid-ui");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(
          scrollAnimationFrameRef.current
        );
      }

      scrollCleanupRef.current?.();
    };
  }, []);

  const handleSectionScroll = (event, sectionId) => {
    event.preventDefault();

    const target = document.getElementById(sectionId);

    if (!target) {
      return;
    }

    const prefersReducedMotion = window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    const targetTop =
      target.getBoundingClientRect().top +
      window.scrollY;

    window.history.replaceState(
      null,
      "",
      `#${sectionId}`
    );

    if (prefersReducedMotion) {
      window.scrollTo({
        top: targetTop,
        behavior: "auto",
      });
      return;
    }

    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(
        scrollAnimationFrameRef.current
      );
      scrollAnimationFrameRef.current = null;
    }

    scrollCleanupRef.current?.();

    const root = document.documentElement;
    const previousSnapType = root.style.scrollSnapType;
    const previousScrollBehavior = root.style.scrollBehavior;

    root.style.scrollSnapType = "none";
    root.style.scrollBehavior = "auto";

    const restoreScrollingStyles = () => {
      root.style.scrollSnapType = previousSnapType;
      root.style.scrollBehavior = previousScrollBehavior;
      scrollCleanupRef.current = null;
    };

    scrollCleanupRef.current = restoreScrollingStyles;

    const startTop = window.scrollY;
    const distance = targetTop - startTop;
    const duration = Math.min(
      2200,
      Math.max(1100, Math.abs(distance) * 0.65)
    );
    const startTime = performance.now();

    const animateScroll = (currentTime) => {
      const progress = Math.min(
        (currentTime - startTime) / duration,
        1
      );

      const easedProgress = easeInOutCubic(progress);

      window.scrollTo(
        0,
        startTop + distance * easedProgress
      );

      if (progress < 1) {
        scrollAnimationFrameRef.current =
          window.requestAnimationFrame(
            animateScroll
          );
        return;
      }

      scrollAnimationFrameRef.current = null;
      restoreScrollingStyles();

      window.scrollTo({
        top: targetTop,
        behavior: "auto",
      });
    };

    scrollAnimationFrameRef.current =
      window.requestAnimationFrame(
        animateScroll
      );
  };

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
          initial={hasMounted.current ? false : "initial"}
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
          href="#about"
          onClick={(event) => handleSectionScroll(event, "about")}
          aria-label="Scroll to About section"
          className="scroll">
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
        <motion.div
          variants={socialVariants}
          initial="initial"
          animate="animate"
          className="socials"
          style={{
            position: "relative",
            zIndex: 20,
            pointerEvents: "auto",
          }}>
          <motion.a
            variants={socialVariants}
            href="https://github.com/vm0303"
            target="_blank"
            rel="noreferrer"
            style={{ position: "relative", zIndex: 21, pointerEvents: "auto" }}>
            <img src="/github.png" alt="GitHub" title="GitHub" />
          </motion.a>
          <motion.a
            variants={socialVariants}
            href="https://www.linkedin.com/in/vishal-madhav/"
            target="_blank"
            rel="noreferrer"
            style={{ position: "relative", zIndex: 21, pointerEvents: "auto" }}>
            <img src="/linkedin.png" alt="LinkedIn" title="LinkedIn" />
          </motion.a>
          <motion.a
            variants={socialVariants}
            href="https://www.instagram.com/vmadhav33/"
            target="_blank"
            rel="noreferrer"
            style={{ position: "relative", zIndex: 21, pointerEvents: "auto" }}>
            <img src="/instagram.png" alt="Instagram" title="Instagram" />
          </motion.a>
          <div className="socialsTextContainer">
            <div className="socialsText">FOLLOW ME</div>
          </div>
        </motion.div>
        {/* BUBBLE */}
        <Speech variants={activeBubbleVariants} />
        {/* CONTACT ME BUTTON */}
        <motion.a
          href="#contact"
          onClick={(event) => handleSectionScroll(event, "contact")}
          aria-label="Scroll to Contact section"
          className="contactButtonLink"
          style={{
            position: "relative",
            zIndex: 20,
            pointerEvents: "auto",
            cursor: "pointer",
          }}
          animate={{ x: [300, 0], opacity: [0, 1] }}
          transition={{ duration: 2 }}>
          <motion.div
            className="contactButton"
            style={{ pointerEvents: "none" }}
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
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
      <motion.div className="bg" variants={backgroundVariants} initial="initial" animate="animate">
        {/* 3d */}
        <HeroCanvasErrorBoundary>
          <Canvas fallback={null}>
            <Suspense fallback={null}>
              <Shape />
            </Suspense>
          </Canvas>
        </HeroCanvasErrorBoundary>
        <div className="hImg">
          <img src="/hero.png" alt="Hero" title="Hero" />
        </div>
      </motion.div>
    </div >
  )
}

export default Hero
