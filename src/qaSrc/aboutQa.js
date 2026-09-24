const MODELS_BY_SCENE = {
  developer: ["laptop"],
  backend: ["java", "spring"],
  frontend: ["react"],
  cloud: ["cloud", "gears"],
  hobbies: [
    "dumbbell",
    "ps5",
    "bicycle",
    "clapperboard",
  ],
};


export const readAboutQaConfig = () => {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      scene: null,
      model: null,
    };
  }


  const params =
    new URLSearchParams(
      window.location.search
    );


  if (
    params.get("about-qa") !== "1"
  ) {
    return {
      enabled: false,
      scene: null,
      model: null,
    };
  }


  const requestedScene =
    params.get("about-scene");

  const scene =
    Object.prototype.hasOwnProperty.call(
      MODELS_BY_SCENE,
      requestedScene
    )
      ? requestedScene
      : "developer";


  const requestedModel =
    params.get("about-model");

  const allowedModels =
    MODELS_BY_SCENE[scene];


  const model =
    allowedModels.includes(
      requestedModel
    )
      ? requestedModel
      : allowedModels[0];


  return {
    enabled: true,
    scene,
    model,
  };
};
