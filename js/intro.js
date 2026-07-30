import { changeScene } from "./router.js";

export async function renderIntro(app) {
  const response = await fetch("scenes/intro.html");
  const html = await response.text();
  app.innerHTML = html;

  const button = app.querySelector(".start-button");
  button.addEventListener("click", () => {
    changeScene("journey");
  });
}
