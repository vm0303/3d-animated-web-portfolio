import { TypeAnimation } from "react-type-animation"

const Speech = () => {
  return (
    <div className='bubbleContainer'>
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
          ]}
          wrapper="span"
          speed={40}
          deletionSpeed={60}
          repeat={Infinity}
        />
      </div>
      <img src="/man.png" alt="Speech Bubble Man" title="Speech Bubble Man" />
    </div>
  )
}

export default Speech