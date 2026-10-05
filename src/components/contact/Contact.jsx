import "./Contact.css"
import emailjs from '@emailjs/browser';
import { useRef, useState } from 'react';
const Contact = () => {
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(false);
    const form = useRef();
    const sendEmail = (e) => {
    e.preventDefault();

    emailjs
      .sendForm(import.meta.env.VITE_SERVICE_ID, import.meta.env.VITE_TEMPLATE_ID, form.current, {
        publicKey: import.meta.env.VITE_PUBLIC_KEY,
      })
      .then(
        () => {
          setSuccess(true);
        },
        (error) => {
          setError(true);
        },
      );
  };
  return (
    <div className='contact'>
      <div className='cSection'>
        <form ref={form} onSubmit={sendEmail}>
          <h1>Let's keep in touch!</h1>
          <div className='formItem'>
            <label>Name</label>
            <input type="text" name="name" placeholder="Your Full Name" />
            </div>

            <div className='formItem'>
            <label>Email</label>
            <input type="email" name="email" placeholder="Your Email" />
            </div>

            <div className='formItem'>
            <label>Message</label>
            <textarea rows={10} name="message" placeholder="Write your message..."></textarea>
            </div>

            <button className='formButton'>Send</button>
            
              {success && <span>"Your message was sent successfully!"</span>}
              {error && <span>"Failed to send message."</span>}
        </form>
      </div>
      <div className='cSection'>
        SVG
      </div>
      
    </div>
  )
}

export default Contact