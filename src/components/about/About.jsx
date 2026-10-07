import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";

import {
  motion,
  useInView,
  AnimatePresence,
} from "motion/react";

import {
  useGLTF,
} from "@react-three/drei";

import AboutModelContainer
  from "./stage/AboutModelContainer";

import LaptopScreenModal
  from "./LaptopScreenModal";

import {
  readAboutQaConfig,
} from "../../qaSrc/aboutQa";

import "./about.css";


/*
 * About always enters on the developer/laptop scene.
 * Start fetching that one GLB when this module loads so
 * the visibility gate does not also become the asset-load gate.
 * Other About models keep their existing on-demand behavior.
 */
useGLTF.preload(
  "./about/laptop.glb"
);


const titleVariants = {
  initial: {
    x: -100,
    y: -50,
    opacity: 0,
  },

  animate: {
    x: 0,
    y: 0,
    opacity: 1,

    transition: {
      duration: 0.55,
    },
  },
};


const listVariants = {
  initial: {
    x: -80,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 0.5,
      staggerChildren: 0.1,
    },
  },
};


const paragraphVariants = {
  initial: {
    x: -80,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 0.45,
    },
  },
};


const titleMobileVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 0.55,
    },
  },
};


const listMobileVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 0.5,
      staggerChildren: 0.1,
    },
  },
};


const paragraphMobileVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 0.45,
    },
  },
};


const modelMobileVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 0.7,
      delay: 0.05,
    },
  },
};


const mobileMediaQuery =
  "(max-width: 1024px) and (orientation: portrait), " +
  "(max-height: 1376px) and (orientation: portrait)";


const buttonVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 1.2,
    },
  },

  exit: {
    opacity: 0,

    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
};


const AboutKeyword = ({
  scene,
  activeScene,
  setActiveScene,
  children,
}) => {
  const isActive =
    activeScene === scene;


  const activate =
    useCallback(() => {
      setActiveScene(scene);
    }, [
      scene,
      setActiveScene,
    ]);


  const handleKeyDown =
    useCallback(
      (event) => {
        if (
          event.key !== "Enter" &&
          event.key !== " "
        ) {
          return;
        }


        event.preventDefault();

        activate();
      },
      [activate]
    );


  return (
    <span
      className="aboutKeyword"

      role="button"

      tabIndex={0}

      data-active={
        isActive
      }

      aria-pressed={
        isActive
      }

      onClick={
        activate
      }

      onKeyDown={
        handleKeyDown
      }
    >
      <span
        className=
          "aboutKeywordText"
      >
        {children}
      </span>
    </span>
  );
};


const About = () => {
  /*
   * QA-only deterministic scene/model selection.
   * Production behavior is unchanged unless about-qa=1
   * is present in the URL.
   */
  const aboutQaRef =
    useRef(
      readAboutQaConfig()
    );

  const aboutQa =
    aboutQaRef.current;


  /*
   * Match Hero.jsx: portrait phones/tablets use fade-only entry motion.
   * Landscape intentionally keeps the existing directional About motion.
   */
  const [
    isMobile,
    setIsMobile,
  ] = useState(
    () =>
      window
        .matchMedia(
          mobileMediaQuery
        )
        .matches
  );


  useEffect(() => {
    const mq =
      window.matchMedia(
        mobileMediaQuery
      );

    const handler =
      (event) =>
        setIsMobile(
          event.matches
        );

    mq.addEventListener(
      "change",
      handler
    );

    return () =>
      mq.removeEventListener(
        "change",
        handler
      );
  }, []);


  const activeTitleVariants =
    isMobile
      ? titleMobileVariants
      : titleVariants;

  const activeListVariants =
    isMobile
      ? listMobileVariants
      : listVariants;

  const activeParagraphVariants =
    isMobile
      ? paragraphMobileVariants
      : paragraphVariants;


  const [
    activeScene,
    setActiveScene,
  ] = useState(
    () =>
      aboutQa.scene ??
      "developer"
  );


  const aboutRef =
    useRef(null);


  const [
    isLaptopScreenOpen,
    setIsLaptopScreenOpen,
  ] = useState(false);


  const screenTriggerRef =
    useRef(null);


  const [
    isLaptopModelReady,
    setIsLaptopModelReady,
  ] = useState(false);


  const openLaptopScreen =
    useCallback(() => {
      setIsLaptopScreenOpen(true);
    }, []);


  const closeLaptopScreen =
    useCallback(() => {
      setIsLaptopScreenOpen(false);
    }, []);


  const handleLaptopModelReady =
    useCallback(() => {
      setIsLaptopModelReady(true);
    }, []);


  const isInView =
    useInView(
      aboutRef,
      {
        amount: 0.15,
        once: false,
      }
    );


  useEffect(() => {
    if (
      !isInView &&
      !aboutQa.enabled
    ) {
      setActiveScene("developer");

      setIsLaptopModelReady(false);
    }
  }, [
    isInView,
    aboutQa.enabled,
  ]);


  useEffect(() => {
    if (
      activeScene !== "developer"
    ) {
      setIsLaptopModelReady(false);
    }
  }, [activeScene]);


  /*
   * If About leaves view or another
   * model chapter becomes active,
   * make sure the laptop modal closes.
   */
  useEffect(() => {
    if (
      !isInView ||
      activeScene !== "developer"
    ) {
      closeLaptopScreen();
    }
  }, [
    isInView,
    activeScene,
    closeLaptopScreen,
  ]);


  /*
   * Preload the readable screen image
   * once About becomes visible.
   *
   * This avoids a visible image-loading
   * delay the first time View Screen
   * is pressed.
   */
  useEffect(() => {
    if (!isInView) {
      return;
    }


    const image =
      new Image();


    image.src =
      "/about/laptop-screen.png";
  }, [isInView]);


  return (
    <div
      className="about"
      ref={aboutRef}
    >
      <div className="aSection left">
        <motion.h1
          className="aTitle"

          variants={
            activeTitleVariants
          }

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >
          About Me
        </motion.h1>


        <motion.div
          className="aboutList"

          variants={
            activeListVariants
          }

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >
          <motion.p
            variants={
              activeParagraphVariants
            }
          >
            <span
              className=
                "aboutParagraphText"
            >
              I’m a{" "}

              <AboutKeyword
                scene="developer"

                activeScene={
                  activeScene
                }

                setActiveScene={
                  setActiveScene
                }
              >
                full-stack software engineer
              </AboutKeyword>{" "}

              who enjoys turning complex
              problems into reliable,
              intuitive experiences.

              Over the years, I’ve
              worked across{" "}

              <AboutKeyword
                scene="backend"

                activeScene={
                  activeScene
                }

                setActiveScene={
                  setActiveScene
                }
              >
                Java and Spring-based
                systems,
              </AboutKeyword>{" "}

              <AboutKeyword
                scene="frontend"

                activeScene={
                  activeScene
                }

                setActiveScene={
                  setActiveScene
                }
              >
                modern front-end
                development,
              </AboutKeyword>{" "}
              and{" "}

              <AboutKeyword
                scene="cloud"

                activeScene={
                  activeScene
                }

                setActiveScene={
                  setActiveScene
                }
              >
                cloud &amp; automation,
              </AboutKeyword>{" "}

              building applications
              and tools that are designed
              to scale and stay dependable.
            </span>
          </motion.p>


          <motion.p
            variants={
              activeParagraphVariants
            }
          >
            <span
              className=
                "aboutParagraphText"
            >
              What keeps me excited about
              software is the constant
              opportunity to learn,
              experiment, and build
              something better.

              Whether I’m creating an
              interactive interface,
              improving a backend service,
              automating a deployment
              workflow, or exploring new
              technologies, I enjoy
              understanding how all the
              pieces fit together.
            </span>
          </motion.p>


          <motion.p
            variants={
              activeParagraphVariants
            }
          >
            <span
              className=
                "aboutParagraphText"
            >
              Outside of development,
              you’ll usually find me{" "}

              <AboutKeyword
                scene="hobbies"

                activeScene={
                  activeScene
                }

                setActiveScene={
                  setActiveScene
                }
              >
                working out, gaming,
                cycling, or getting lost
                in a good movie or TV
                series.
              </AboutKeyword>
            </span>
          </motion.p>
        </motion.div>
      </div>


      <motion.div
        className="aSection right"

        variants={
          isMobile
            ? modelMobileVariants
            : undefined
        }

        initial={
          isMobile
            ? "initial"
            : false
        }

        animate={
          isMobile
            ? (
                isInView
                  ? "animate"
                  : "initial"
              )
            : undefined
        }
      >
        {isInView && (
          <>
            <AboutModelContainer
              activeScene={
                activeScene
              }

              onLaptopReady={
                handleLaptopModelReady
              }

              qaMode={
                aboutQa.enabled
              }

              qaModelId={
                aboutQa.model
              }
            />


            <AnimatePresence>
              {activeScene ===
                "developer" &&
                isLaptopModelReady && (
                  <motion.button
                    key=
                      "view-screen-button"

                    ref={
                      screenTriggerRef
                    }

                    type="button"

                    className=
                      "aboutScreenTrigger"

                    variants={
                      buttonVariants
                    }

                    initial="initial"

                    animate="animate"

                    exit="exit"

                    aria-haspopup=
                      "dialog"

                    onClick={
                      openLaptopScreen
                    }
                  >
                    <span>
                      View screen
                    </span>


                    <span
                      aria-hidden="true"

                      className=
                        "aboutScreenTriggerIcon"
                    >
                      ↗
                    </span>
                  </motion.button>
                )}
            </AnimatePresence>
          </>
        )}
      </motion.div>


      <LaptopScreenModal
        open={
          isLaptopScreenOpen
        }

        onClose={
          closeLaptopScreen
        }

        returnFocusRef={
          screenTriggerRef
        }
      />
    </div>
  );
};


export default About;