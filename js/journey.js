import { changeScene, render } from "./router.js";

let reactionsInitialized = false;

const journey = {
  data: null,
  state: { currentYear: null, selectedCountry: null },
  listeners: {},
};

function subscribe(key, callback) {
  if (!journey.listeners[key]) {
    journey.listeners[key] = [];
  }

  journey.listeners[key].push(callback);
}

function setState(key, value) {
  journey.state[key] = value;

  if (journey.listeners[key]) {
    journey.listeners[key].forEach((callback) => {
      callback(value);
    });
  }
}

function setupReactions() {
  if (reactionsInitialized) return;
  reactionsInitialized = true;
  subscribe("currentYear", () => {
    updateTimeline();
    updateMap();
    if (journey.state.selectedCountry) {
      updateCountryModal();
    }
  });
  subscribe("selectedCountry", () => {
    openCountryModal();
  });
}

export async function loadData() {
  return await d3.csv("data/gap.csv", (d) => ({
    country: d.country,
    continent: d.continent,
    year: +d.year,
    lifeExpectancy: +d.lifeExpectancy,
    population: +d.population,
    gdpPerCapita: +d.gdpPerCapita,
    isoAlpha: d.isoAlpha,
    isoNum: d.isoNum.padStart(3, "0"),
  }));
}

function selectData(year) {
  return journey.data.filter((d) => d.year === year);
}

export async function renderJourney(app, state) {
  const response = await fetch("scenes/journey.html");
  const html = await response.text();
  app.innerHTML = html;

  journey.data = await loadData();

  setupReactions();
  renderTimeline();
  renderMap();
}

function renderTimeline() {
  const years = [...new Set(journey.data.map((d) => d.year))].sort();

  journey.state.currentYear = years[0];

  const track = d3.select("#timeline-track");
  track.selectAll("*").remove();

  const points = track
    .selectAll(".timeline-point")
    .data(years)
    .enter()
    .append("div")
    .attr("class", (d) =>
      d === journey.state.currentYear
        ? "timeline-point active"
        : "timeline-point",
    )
    .on("click", (event, year) => {
      setState("currentYear", year);
    });
  points.append("div").attr("class", "timeline-marker");
  points
    .append("span")
    .attr("class", "timeline-year")
    .text((d) => d);
}

function updateTimeline() {
  d3.selectAll(".timeline-point").classed(
    "active",
    (d) => d === journey.state.currentYear,
  );

  const active = d3.select(".timeline-point.active");
}

function createLookup(data) {
  return new Map(data.map((d) => [d.isoNum, d]));
}

function renderMap() {
  const width = document.querySelector("#world-map").clientWidth;
  const height = width / 2;

  const svg = d3
    .select("#world-map")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const projection = d3
    .geoNaturalEarth1()
    .scale(width / 6)
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  const currentData = selectData(journey.state.currentYear);
  const lookup = createLookup(currentData);

  const colorScale = d3
    .scaleSequential(d3.interpolateYlOrBr)
    .domain(d3.extent(currentData, (d) => d.gdpPerCapita));

  d3.json("data/countries-110m.json").then((world) => {
    const countries = topojson.feature(world, world.objects.countries);

    const filteredCountries = countries.features.filter(
      (d) => d.properties.name !== "Antarctica",
    );

    svg
      .selectAll(".country")
      .data(filteredCountries)
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("fill", (d) => {
        const row = lookup.get(d.id);
        if (!row) return "#333";
        return colorScale(row.gdpPerCapita);
      })
      .attr("d", path)
      .on("click", function (event, d) {
        d3.selectAll(".country").classed("selected", false);
        d3.select(this).classed("selected", true).raise();

        openCountryModal(d);
      });
  });
}

function updateMap() {
  const currentData = selectData(journey.state.currentYear);
  const lookup = createLookup(currentData);

  const colorScale = d3
    .scaleSequential(d3.interpolateYlOrBr)
    .domain(d3.extent(currentData, (d) => d.gdpPerCapita));

  d3.selectAll(".country")
    .transition()
    .duration(800)
    .attr("fill", (d) => {
      const row = lookup.get(String(d.id));

      if (!row) {
        return "#333";
      }

      return colorScale(row.gdpPerCapita);
    });
}

function openCountryModal(d) {
  const currentData = selectData(journey.state.currentYear);
  const countryData = currentData.find((row) => row.isoNum === String(d.id));

  if (!countryData) {
    console.error("No data found for country:", d.properties.name);
    return;
  }

  const modalContent = `
    <h2>${countryData.country} (${countryData.year})</h2>
    <p>Continent: ${countryData.continent}</p>
    <p>Life Expectancy: ${countryData.lifeExpectancy}</p>
    <p>Population: ${countryData.population}</p>
    <p>GDP per Capita: ${countryData.gdpPerCapita}</p>
  `;

  const modal = document.createElement("div");
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content">
      ${modalContent}
      <button id="close-modal">Close</button>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("close-modal").addEventListener("click", () => {
    document.body.removeChild(modal);
  });
}
