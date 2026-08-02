import { changeScene, render } from "./router.js";

let reactionsInitialized = false;
let colorMap = d3.interpolateYlOrBr;

const journey = {
  data: null,
  facts: null,
  years: null,
  state: {
    yearIndex: -1,
    currentData: null,
    selectedCountry: null,
  },
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

  subscribe("yearIndex", () => {
    setState("currentData", selectData(journey.years[journey.state.yearIndex]));

    updateTimeline();
  });

  subscribe("selectedCountry", () => {});

  subscribe("currentData", () => {
    updateMap();
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

  setupReactions();

  journey.data = await loadData();
  journey.years = [...new Set(journey.data.map((d) => d.year))].sort();

  journey.facts = await d3.json("data/facts.json");

  setState("yearIndex", 0);

  renderTimeline();
  renderMap();
}

function renderTimeline() {
  const track = d3.select("#timeline-track");
  track.selectAll("*").remove();

  const points = track
    .selectAll(".timeline-point")
    .data(journey.years)
    .enter()
    .append("div")
    .attr("class", (d) =>
      d === journey.years[journey.state.yearIndex]
        ? "timeline-point active"
        : "timeline-point",
    )
    .on("click", (event, year) => {
      setState("yearIndex", journey.years.indexOf(year));
    });
  points.append("div").attr("class", "timeline-marker");
  points
    .append("span")
    .attr("class", "timeline-year")
    .text((d) => d);

  setupTimelineControls();
}

function updateTimeline() {
  d3.selectAll(".timeline-point").classed(
    "active",
    (d) => d === journey.years[journey.state.yearIndex],
  );

  setTimelineControlsState();
  updateStoryPanel();
}

function setupTimelineControls() {
  d3.select("#timeline-prev").on("click", () => {
    if (journey.state.yearIndex > 0) {
      setState("yearIndex", journey.state.yearIndex - 1);
    }
  });
  d3.select("#timeline-next").on("click", () => {
    if (journey.state.yearIndex < journey.years.length - 1) {
      setState("yearIndex", journey.state.yearIndex + 1);
    }
  });

  setTimelineControlsState();
}

function setTimelineControlsState() {
  d3.select("#timeline-prev").property(
    "disabled",
    journey.state.yearIndex === 0,
  );

  d3.select("#timeline-next").property(
    "disabled",
    journey.state.yearIndex === journey.years.length - 1,
  );
}

function updateStoryPanel() {
  const fact = journey.facts.find(
    (d) => d.year === journey.years[journey.state.yearIndex],
  );
  d3.select("#story-headline").text(fact.headline);
  d3.select("#story-paras")
    .selectAll("p")
    .data(fact.paras)
    .join("p")
    .text((d) => d);
  d3.select("#story-tags")
    .selectAll("span")
    .data(fact.tags)
    .join("span")
    .text((d) => d);
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

  const zoomGroup = svg.append("g");

  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      zoomGroup.attr("transform", event.transform);
    });

  svg.call(zoom);

  const lookup = createLookup(journey.state.currentData);

  const colorScale = d3
    .scaleSequential(colorMap)
    .domain(d3.extent(journey.state.currentData, (d) => d.gdpPerCapita));

  console.log(journey.state.currentData);
  console.log(d3.extent(journey.state.currentData, (d) => d.gdpPerCapita));

  d3.json("data/countries-110m.json").then((world) => {
    const countries = topojson
      .feature(world, world.objects.countries)
      .features.filter((d) => d.properties.name !== "Antarctica");

    zoomGroup
      .selectAll(".country")
      .data(countries)
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

        // openCountryModal(d);
      });
  });
}

function updateMap() {
  const lookup = createLookup(journey.state.currentData);

  const colorScale = d3
    .scaleSequential(colorMap)
    .domain(d3.extent(journey.state.currentData, (d) => d.gdpPerCapita));

  console.log(journey.state.currentData);
  console.log(d3.extent(journey.state.currentData, (d) => d.gdpPerCapita));

  d3.selectAll(".country")
    .transition()
    .duration(750)
    .attr("fill", (d) => {
      const row = lookup.get(String(d.id));
      if (!row) {
        return "#333";
      }
      return colorScale(row.gdpPerCapita);
    });
}

// function openCountryModal(d) {
//   const currentData = journey.state.currentData;
//   const countryData = currentData.find((row) => row.isoNum === String(d.id));

//   if (!countryData) {
//     console.error("No data found for country:", d.properties.name);
//     return;
//   }

//   const modalContent = `
//     <h2>${countryData.country} (${countryData.year})</h2>
//     <p>Continent: ${countryData.continent}</p>
//     <p>Life Expectancy: ${countryData.lifeExpectancy}</p>
//     <p>Population: ${countryData.population}</p>
//     <p>GDP per Capita: ${countryData.gdpPerCapita}</p>
//   `;

//   const modal = document.createElement("div");
//   modal.classList.add("modal");
//   modal.innerHTML = `
//     <div class="modal-content">
//       ${modalContent}
//       <button id="close-modal">Close</button>
//     </div>
//   `;

//   document.body.appendChild(modal);

//   document.getElementById("close-modal").addEventListener("click", () => {
//     document.body.removeChild(modal);
//   });
// }
