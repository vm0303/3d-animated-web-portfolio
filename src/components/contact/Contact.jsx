import "./Contact.css"
import emailjs from '@emailjs/browser';
import { useRef, useState } from 'react';
import { motion, useInView } from "motion/react"

const listVariants = {
  initial: {
    x: 100,
    opacity: 0,

  },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      staggerChildren: 0.2,
    },
  }
};

const Contact = () => {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  const sendEmail = (e) => {
    e.preventDefault();

    emailjs
      .sendForm(import.meta.env.VITE_SERVICE_ID, import.meta.env.VITE_TEMPLATE_ID, form.current, {
        publicKey: import.meta.env.VITE_PUBLIC_KEY,
      })
      .then(
        () => {
          setSuccess(true);
          setError(false);
        },
        (error) => {
          setError(true);
          setSuccess(false);
        },
      );
  };
  const form = useRef();
  const isInView = useInView(form, { margin: "-200px" });

  return (
    <div className='contact'>
      <div className='cSection'>
        <motion.form ref={form} onSubmit={sendEmail} variants={listVariants} animate={isInView ? "animate" : "initial"}>
          <motion.h1 variants={listVariants}>Let's keep in touch!</motion.h1>
          <motion.div className='formItem' variants={listVariants}>
            <label>Name</label>
            <input type="text" name="name" placeholder="Your Full Name" />
          </motion.div>

          <motion.div className='formItem' variants={listVariants}>
            <label>Email</label>
            <input type="email" name="email" placeholder="Your Email" />
          </motion.div>

          <motion.div className='formItem' variants={listVariants}>
            <label>Message</label>
            <textarea rows={10} name="message" placeholder="Write your message..."></textarea>
          </motion.div>

          <motion.button className='formButton' variants={listVariants}>Send</motion.button>

          {success && <span>Your message was sent successfully!</span>}
          {error && <span>Failed to send message. Please try again later.</span>}
        </motion.form>
      </div>
      <div className='cSection'>
        SVG
      </div>

    </div>
  )
}

export default Contact