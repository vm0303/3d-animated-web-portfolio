import {
  useEffect,
  useRef,
} from "react";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";

import {
  createPortal,
} from "react-dom";


const LaptopScreenModalContent = ({
  onClose,
  returnFocusRef,
}) => {
  const closeButtonRef =
    useRef(null);

  const reduceMotion =
    useReducedMotion();


  useEffect(() => {
    const html =
      document.documentElement;

    const body =
      document.body;


    const previousHtmlOverflow =
      html.style.overflow;

    const previousBodyOverflow =
      body.style.overflow;


    html.style.overflow =
      "hidden";

    body.style.overflow =
      "hidden";


    /*
     * X is intentionally the ONLY
     * user-controlled close action.
     *
     * Escape does not close the modal.
     * Clicking the backdrop does not close it.
     */
    const handleKeyDown = (event) => {
      if (event.key === "Tab") {
        event.preventDefault();

        closeButtonRef
          .current
          ?.focus();
      }
    };


    window.addEventListener(
      "keydown",
      handleKeyDown
    );


    const focusFrame =
      window.requestAnimationFrame(
        () => {
          closeButtonRef
            .current
            ?.focus();
        }
      );


    return () => {
      window.cancelAnimationFrame(
        focusFrame
      );


      window.removeEventListener(
        "keydown",
        handleKeyDown
      );


      html.style.overflow =
        previousHtmlOverflow;

      body.style.overflow =
        previousBodyOverflow;


      returnFocusRef
        ?.current
        ?.focus();
    };
  }, [
    returnFocusRef,
  ]);


  const backdropTransition = {
    duration:
      reduceMotion
        ? 0
        : 0.2,

    ease: "easeOut",
  };


  const dialogTransition = {
    duration:
      reduceMotion
        ? 0
        : 0.24,

    ease: [
      0.22,
      1,
      0.36,
      1,
    ],
  };


  return (
    <motion.div
      className="laptopScreenModal"

      initial={{
        opacity: 0,
      }}

      animate={{
        opacity: 1,
      }}

      exit={{
        opacity: 0,
      }}

      transition={
        backdropTransition
      }
    >
      <motion.div
        className="laptopScreenDialog"

        role="dialog"
        aria-modal="true"
        aria-labelledby="laptop-screen-title"

        initial={
          reduceMotion
            ? false
            : {
                opacity: 0,
                y: 10,
                scale: 0.985,
              }
        }

        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}

        exit={
          reduceMotion
            ? {
                opacity: 0,
              }
            : {
                opacity: 0,
                y: 6,
                scale: 0.99,
              }
        }

        transition={
          dialogTransition
        }
      >
        <div
          className=
            "laptopScreenToolbar"
        >
          <h2
            id="laptop-screen-title"
            className=
              "laptopScreenTitle"
          >
            Portfolio screen
          </h2>


          <button
            ref={closeButtonRef}
            type="button"
            className=
              "laptopScreenClose"
            aria-label=
              "Close portfolio screen"
            onClick={onClose}
          >
            <span
              className=
                "laptopScreenCloseIcon"
              aria-hidden="true"
            />
          </button>
        </div>


        <div
          className=
            "laptopScreenViewport"
        >
          <img
            className=
              "laptopScreenImage"
            src=
              "/about/laptop-screen.png"
            alt=
              "Full-stack software engineer portfolio dashboard showing Vishal Madhav, Java and Spring, React, AWS, and profile details."
            draggable="false"
          />
        </div>
      </motion.div>
    </motion.div>
  );
};


const LaptopScreenModal = ({
  open,
  onClose,
  returnFocusRef,
}) => {
  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }


  return createPortal(
    <AnimatePresence>
      {open && (
        <LaptopScreenModalContent
          key="laptop-screen-modal"
          onClose={onClose}
          returnFocusRef={
            returnFocusRef
          }
        />
      )}
    </AnimatePresence>,

    document.body
  );
};


export default LaptopScreenModal;