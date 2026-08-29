import { TypeAnimation } from "react-type-animation";
import { motion } from "motion/react";


const Speech = ({ variants }) => {
  const qaMode =
    typeof window !== "undefined" &&
    new URLSearchParams(
      window.location.search
    ).get("qa") === "1";


  return (
    <motion.div
      variants={variants}

      /*
        In QA mode, skip the entrance animation
        and start directly in the final state.
      */
      initial={
        qaMode
          ? false
          : "initial"
      }

      animate="animate"

      className="bubbleContainer"
    >
      <div className="bubble">

        {qaMode ? (
          /*
            Fixed QA phrase.

            We always use the same text so screenshots
            and element measurements are repeatable.
          */
          <span>
            I love to code!
          </span>
        ) : (
          <TypeAnimation
            sequence={[
              "I love to watch movies or TV shows!",
              1000,

              "I love to play video games!",
              1000,

              "I love to play basketball!",
              1000,

              "I love to code!",
              1000,

              "I love to learn new things!",
              1000,

              "I love to bike!",
              1000,

              "I love nature!",
              1000,

              "I love being social!",
              1000,

              "I love to travel!",
              1000,

              "I love to shop!",
              2000,
            ]}

            wrapper="span"

            speed={40}

            deletionSpeed={60}

            repeat={Infinity}
          />
        )}

      </div>


      <img
        src="/man.png"

        alt="Speech Bubble Man"

        title="Speech Bubble Man"
      />
    </motion.div>
  );
};


export default Speech;