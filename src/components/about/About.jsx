import { useState, useRef, useEffect } from "react";
import { motion, useInView } from "motion/react";


import AboutModelContainer from "./stage/AboutModelContainer";

import "./about.css";

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
      duration: 0.8,
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
      duration: 0.7,
      staggerChildren: 0.18,
    },
  },
};

const paragraphVariants = {
  initial: {
    x: -40,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 0.6,
    },
  },
};

const About = () => {
  const [activeScene, setActiveScene] =
    useState("developer");

  const aboutRef = useRef(null);

  const isInView = useInView(aboutRef, {
    amount: 0.15,
    once: false,
  });

  useEffect(() => {
    if (!isInView) {
      setActiveScene("developer");
    }
  }, [isInView]);




  return (
    <div
      className="about"
      ref={aboutRef}
    >
      <div className="aSection left">
        <motion.h1
          className="aTitle"
          variants={titleVariants}
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
          variants={listVariants}
          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >
          <motion.p variants={paragraphVariants}>
            I’m a{" "}
            <button
              type="button"
              className="aboutKeyword"
              data-active={activeScene === "developer"}
              aria-pressed={activeScene === "developer"}
              onClick={() => setActiveScene("developer")}
            >
              <span className="aboutKeywordText">
                full-stack software engineer
              </span>
            </button>{" "}
            who enjoys turning complex problems
            into reliable, intuitive experiences.
            Over the years, I’ve worked across{" "}
            <button
              type="button"
              className="aboutKeyword"
              data-active={
                activeScene === "backend"
              }
              aria-pressed={
                activeScene === "backend"
              }
              onClick={() =>
                setActiveScene("backend")
              }
            >
              <span className="aboutKeywordText">
                Java and Spring-based systems
              </span>
            </button>
            ,{" "}
            <button
              type="button"
              className="aboutKeyword"
              data-active={
                activeScene === "frontend"
              }
              aria-pressed={
                activeScene === "frontend"
              }
              onClick={() =>
                setActiveScene("frontend")
              }
            >
              <span className="aboutKeywordText">
                modern front-end development
              </span>
            </button>
            , and{" "}
            <button
              type="button"
              className="aboutKeyword"
              data-active={
                activeScene === "cloud"
              }
              aria-pressed={
                activeScene === "cloud"
              }
              onClick={() =>
                setActiveScene("cloud")
              }
            >
              <span className="aboutKeywordText">
                cloud &amp; automation
              </span>
            </button>
            , building applications and tools
            that are designed to scale and stay
            dependable.
          </motion.p>

          <motion.p variants={paragraphVariants}>
            What keeps me excited about software
            is the constant opportunity to learn,
            experiment, and build something
            better. Whether I’m creating an
            interactive interface, improving a
            backend service, automating a
            deployment workflow, or exploring
            new technologies, I enjoy
            understanding how all the pieces fit
            together.
          </motion.p>

          <motion.p variants={paragraphVariants}>
            Outside of development, you’ll
            usually find me{" "}
            <button
              type="button"
              className="aboutKeyword"
              data-active={
                activeScene === "hobbies"
              }
              aria-pressed={
                activeScene === "hobbies"
              }
              onClick={() =>
                setActiveScene("hobbies")
              }
            >
              <span className="aboutKeywordText">
                working out, gaming, cycling, or
                getting lost in a good movie or TV
                series
              </span>
            </button>
            .
          </motion.p>
        </motion.div>
      </div>

      <div className="aSection right">
        {isInView && (
          <AboutModelContainer
            activeScene={activeScene}
          />
        )}
      </div>
    </div>
  );
};

export default About;