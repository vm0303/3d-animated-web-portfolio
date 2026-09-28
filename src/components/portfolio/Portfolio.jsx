import "./portfolio.css"
import {motion,useScroll, useTransform} from "motion/react"
import { useRef,useState,useEffect } from "react"


const items = [
  {
    id: 1,
    img: "/p1.jpg",
    title: "WeathAware",
    desc: "An interactive React weather dashboard delivering current conditions, hourly trends, multi-day forecasts, geolocation, autocomplete, adaptive weather themes, dark mode, notifications, and smooth Framer Motion animations through WeatherAPI integration across modern devices.",
    link: "https://weathaware-alpha.vercel.app/",
  },
  {
    id: 2,
    img: "/p2.jpg",
    title: "NYC Info Tours",
	desc: "A full-stack serverless NYC tour booking platform using AWS Lambda, DynamoDB, API Gateway, S3, CloudFront, SES, and ACM, with responsive forms, pricing calculations, validation, confirmations, and secure HTTPS delivery for users.",    
	link: "https://www.nycinfotours.app/",
  },
  {
    id: 3,
    img: "/p3.jpg",
    title: "2048",
	desc: "A Vue CLI recreation of the classic 2048 game backed by Google Firestore, featuring responsive gameplay and mobile swipe support for an interactive browser-based puzzle experience across devices and desktops.",
    link: "https://2048-using-vue-and-firestore.vercel.app/",
  },
  {
    id: 4,
    img: "/p4.jpg",
    title: "DocQuery",
	desc: "An AI-powered document question-answering application supporting PDF, TXT, and DOCX uploads, using FAISS, OpenAI embeddings, LangChain, and Streamlit to deliver source-grounded natural-language answers through a clean chat workflow for uploaded files.",
    link: "https://docquerybot-0303.streamlit.app/",
  },
  {
    id: 5,
    img: "/p5.jpg",
    title: "React Arcade Puzzles",
	desc: "A React-based collection of interactive puzzle games designed around problem-solving, featuring Towers of Hanoi with Redux-assisted interactions and a sliding puzzle animated with React Motion for engaging browser gameplay across devices.",
    link: "https://react-arcade-puzzles.vercel.app/",
  },
];



const ListItem = ({ item }) => {
  return (
    <div className="pItem">
      <div className="pImg">
        <img src={item.img} alt="" />
      </div>
      <div className="pText">
        <h1>{item.title}</h1>
        <p>{item.desc}</p>
        <a href={item.link} target="_blank" rel="noopener noreferrer">
          <button>View Project</button>
        </a>
      </div>
    </div>
  );
}


const Portfolio = () => {

  const [containerDistance,setContainerDistance] = useState(0);

  const ref = useRef(null);
  
  const {scrollYProgress} = useScroll({ target: ref });

  const xTranslate = useTransform(scrollYProgress, [0, 1], [0, -window.innerWidth * items.length]);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setContainerDistance(rect.left);
    }
  }, []);

  return (
    <div className='portfolio' ref={ref}>
      <motion.div className="pList" style={{ x: xTranslate }}>
        <div className="empty"
        style={{ width: window.innerWidth - containerDistance }}
        />
        {items.map(item=>(
          <ListItem item={item} key={item.id}/>
        ))}
      </motion.div>
      <section/>
      <section/>
      <section/>
      <section/>
      <section/>
    </div>
  )
}

export default Portfolio