import {
  ComputerModel
} from "../computer/ComputerModel";

import JavaModel from "../java/JavaModel";
import SpringModel from "../spring/SpringModel";
import ReactModel from "../react/ReactModel";
import CloudModel from "../cloud/CloudModel";

import DumbbellModel from "../dumbbell/DumbbellModel";
import Ps5Model from "../ps5/Ps5Model";
import BicycleModel from "../bicycle/BicycleModel";
import ClapperboardModel from "../clapperboard/ClapperboardModel";


export const ABOUT_SCENES = {
  developer: {
    id: "developer",

    items: [
      {
        id: "laptop",
        Model: ComputerModel,
        assetPath: "./about/laptop.glb",

        stageIntensity: 0.50,

        visualScale: 1.3,
      },
    ],
  },


  backend: {
    id: "backend",

    /*
     * Full centered/rotating dwell time.
     * The slide duration is separate.
     */
    interval: 6500,

    items: [
      {
        id: "java",
        Model: JavaModel,
        assetPath: "./about/java.glb",

        stageIntensity: 0.65,

        visualScale: 1.3,
      },

      {
        id: "spring",
        Model: SpringModel,
        assetPath: "./about/spring.glb",

        stageIntensity: 0.65,

        visualScale: 1.3,
      },
    ],
  },


  frontend: {
    id: "frontend",

    items: [
      {
        id: "react",
        Model: ReactModel,
        assetPath: "./about/react.glb",

        stageIntensity: 0.50,

        visualScale: 1.3,
      },
    ],
  },


  cloud: {
    id: "cloud",

    items: [
      {
        id: "cloud",
        Model: CloudModel,
        assetPath: "./about/cloud.glb",

        stageIntensity: 0.55,

        visualScale: 1.3,
      },
    ],
  },


  hobbies: {
    id: "hobbies",

    interval: 6500,

    items: [
      {
        id: "dumbbell",
        Model: DumbbellModel,
        assetPath: "./about/dumbbell.glb",

        stageIntensity: 0.95,

        visualScale: 1.3,
      },

      {
        id: "ps5",
        Model: Ps5Model,
        assetPath: "./about/ps5.glb",

        stageIntensity: 0.65,

        visualScale: 1.3,
      },

      {
        id: "bicycle",
        Model: BicycleModel,
        assetPath: "./about/bicycle.glb",

        stageIntensity: 0.75,

        visualScale: 1.3,
      },

      {
        id: "clapperboard",
        Model: ClapperboardModel,
        assetPath: "./about/clapperboard.glb",

        stageIntensity: 0.70,

        visualScale: 1,
      },
    ],
  },
};