import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";


const LaptopScreenModal = ({
  open,
  onClose,
  returnFocusRef,
}) => {
  const closeButtonRef = useRef(null);


  useEffect(() => {
    if (!open) {
      return undefined;
    }


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


    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();

        onClose();

        return;
      }


      /*
       * The modal only has one interactive
       * control, so keep keyboard focus inside it.
       */
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
    open,
    onClose,
    returnFocusRef,
  ]);


  if (
    !open ||
    typeof document === "undefined"
  ) {
    return null;
  }


  return createPortal(
    <div
      className="laptopScreenModal"
      onPointerDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="laptopScreenDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="laptop-screen-title"
      >
        <div
          className="laptopScreenToolbar"
        >
          <h2
            id="laptop-screen-title"
            className="laptopScreenTitle"
          >
            Portfolio screen
          </h2>


          <button
            ref={closeButtonRef}
            type="button"
            className="laptopScreenClose"
            aria-label="Close portfolio screen"
            onClick={onClose}
          >
            <span aria-hidden="true">
              ×
            </span>
          </button>
        </div>


        <div
          className="laptopScreenViewport"
        >
          <img
            className="laptopScreenImage"
            src="/about/laptop-screen.png"
            alt="Full-stack software engineer portfolio dashboard showing Vishal Madhav, Java and Spring, React, AWS, and profile details."
            draggable="false"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};


export default LaptopScreenModal;
