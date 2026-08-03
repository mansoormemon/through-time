import { state } from "./state.js";
import { renderIntro } from "./intro.js";
import { renderJourney } from "./journey.js";
import { renderFarewell } from "./farewell.js";

const app = document.querySelector("#app");

const scenes = {
  intro: renderIntro,
  journey: renderJourney,
  farewell: renderFarewell,
};

export async function changeScene(nextScene) {
  const current = document.querySelector(".scene");
  current.classList.add("transition-out");
  setTimeout(async () => {
    app.innerHTML = "";

    state.scene = nextScene;

    await render();

    const next = document.querySelector(".scene");
    next.classList.add("transition-in");
  }, 500);
}

export async function render() {
  await scenes[state.scene](app, state);
}
