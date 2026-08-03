import { changeScene } from "./router.js";

export async function renderFarewell(app, state) {
  const html = await d3.text("scenes/farewell.html");
  d3.select("#app").html(html);

  const button = app.querySelector("#restart-button");
  button.addEventListener("click", () => {
    changeScene("intro");
  });
}
