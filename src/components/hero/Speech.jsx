import { TypeAnimation } from "react-type-animation"
import { motion } from "motion/react";
const Speech = ({ variants }) => {
  return (
    <motion.div variants={variants} initial="initial" animate="animate" className='bubbleContainer'>
      <div className='bubble'>
        <TypeAnimation
          sequence={[
            'I love to play video games!',
            1000,
            'I love to play basketball!',
            1000,
            'I love to code!',
            1000,
            'I love to learn new things!',
            1000,
            'I love to bike!',
            1000,
            'I love nature!',
            1000,
            'I love being social!',
            1000,
            'I love to travel!',
            1000,
            'I love to shop!',
            1000,
            'I love to watch movies or TV shows!',
            2000
          ]}
          wrapper="span"
          speed={40}
          deletionSpeed={60}
          repeat={Infinity}
        />
      </div>
      <img src="/man.png" alt="Speech Bubble Man" title="Speech Bubble Man" />
    </motion.div>
  )
}

export default Speech