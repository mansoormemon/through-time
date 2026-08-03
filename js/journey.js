import { changeScene, render } from "./router.js";

let reactionsInitialized = false;
let colorMap = d3.interpolateBuPu;

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
    updateStoryPanel();
    updateGlobalStats();
  });

  subscribe("selectedCountry", () => {
    updateCountryComparison();
  });

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

function openInfo() {
  d3.select("#info-overlay").classed("active", true);
}

function closeInfo() {
  d3.select("#info-overlay").classed("active", false);
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

  d3.select("#info-button").on("click", openInfo);

  d3.select("#info-close").on("click", closeInfo);

  d3.select("#info-overlay").on("click", function (event) {
    if (event.target === this) {
      closeInfo();
    }
  });

  d3.select("#info-ok").on("click", closeInfo);
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
  updateTimelineProgress();
  updateCountryComparison();
}

function setupTimelineControls() {
  d3.select("#timeline-prev").on("click", () => {
    if (journey.state.yearIndex > 0) {
      setState("yearIndex", journey.state.yearIndex - 1);
    }
  });
  d3.select("#timeline-next").on("click", () => {
    const isLast = journey.state.yearIndex === journey.years.length - 1;
    if (isLast) {
      changeScene("farewell");
    } else {
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

  const isLast = journey.state.yearIndex === journey.years.length - 1;
  d3.select("#timeline-next").classed("continue", isLast);
  d3.select("#timeline-next .next-text").text(isLast ? "Next" : "");
}

function updateTimelineProgress() {
  const progress = journey.state.yearIndex / (journey.years.length - 1);

  d3.select("#timeline-track").style(
    "--timeline-progress",
    `${progress * 100}%`,
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
      .on("mouseenter", function (event, d) {
        d3.select(this).classed("hovered", true);

        d3.select("#map-tooltip").style("opacity", 1).text(d.properties.name);
      })
      .on("mousemove", function (event) {
        d3.select("#map-tooltip")
          .style("left", `${event.clientX + 16}px`)
          .style("top", `${event.clientY + 16}px`);
      })
      .on("mouseleave", function () {
        d3.select(this).classed("hovered", false);

        d3.select("#map-tooltip").style("opacity", 0);
      })
      .on("click", function (event, d) {
        setState("selectedCountry", d.id);
      });
  });
}

function updateMap() {
  const lookup = createLookup(journey.state.currentData);

  const colorScale = d3
    .scaleSequential(colorMap)
    .domain(d3.extent(journey.state.currentData, (d) => d.gdpPerCapita));

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

function updateGlobalStats() {
  const data = journey.state.currentData;

  const population = d3.sum(data, (d) => d.population);
  const globalGDP = d3.sum(data, (d) => d.population * d.gdpPerCapita);

  const medianGDP = d3.median(data, (d) => d.gdpPerCapita);

  d3.select("#global-population").text(`${(population / 1e9).toFixed(2)}B`);
  d3.select("#global-gdp").text(d3.format("$,.2s")(globalGDP));
  d3.select("#median-gdp").text(d3.format("$,.0f")(medianGDP));
}

function updateCountryComparison() {
  const container = d3.select("#country-comparison");
  const country = journey.state.selectedCountry;

  if (!country) {
    return;
  }

  const countryHistory = journey.data.filter(
    (d) =>
      d.isoNum === journey.state.selectedCountry &&
      d.year <= journey.years[journey.state.yearIndex],
  );

  const worldMedianHistory = d3.rollups(
    journey.data.filter(
      (d) => d.year <= journey.years[journey.state.yearIndex],
    ),
    (values) => d3.median(values, (d) => d.gdpPerCapita),
    (d) => d.year,
  );

  const worldHistory = worldMedianHistory.map(([year, gdpPerCapita]) => ({
    year,
    gdpPerCapita,
  }));

  console.log("Country History:", countryHistory);
  console.log("World History:", worldHistory);

  const title = d3.select("#selected-country-name");
  title.text(countryHistory.at(-1).country);

  updateCountryStats(countryHistory.at(-1), worldHistory);
  renderCountryGDPChart(countryHistory, worldHistory);

  const panel = document.querySelector(".story-panel");
  panel.scrollTo({
    top: panel.scrollHeight,
    behavior: "smooth",
  });
}

function updateCountryStats(country) {
  const data = journey.state.currentData;
  const container = d3.select("#country-stats");

  container.html("");

  const worldMedianGDP = d3.median(data, (d) => d.gdpPerCapita);
  const worldGDP = d3.sum(data, (d) => d.gdpPerCapita * d.population);

  const countryGDP = country.gdpPerCapita * country.population;
  const stats = [
    {
      label: "GDP per capita",
      value: d3.format("$,.0f")(country.gdpPerCapita),
    },
    {
      label: "Gap against median",
      value: d3.format("+.1%")(country.gdpPerCapita / worldMedianGDP - 1),
    },
    {
      label: "Population",
      value: `${d3.format(".2f")(country.population / 1e6)}M`,
    },
    {
      label: "Global GDP share",
      value: d3.format(".1%")(countryGDP / worldGDP),
    },
    {
      label: "Life expectancy",
      value: `${d3.format(".1f")(country.lifeExpectancy)} years`,
    },
  ];

  container
    .append("div")
    .attr("class", "global-stats")
    .html(
      `
      <h3>${country.country}</h3>
    `,
    )
    .append("div")
    .attr("class", "stats-grid")
    .selectAll(".stat")
    .data(stats)
    .enter()
    .append("div")
    .attr("class", "stat")
    .html(
      (d) => `
      <div class="stat-label">${d.label}</div>
      <div class="stat-value">${d.value}</div>
    `,
    );

  container.append("br");
}

function renderCountryGDPChart(countryHistory, worldHistory) {
  const width = 480;
  const height = 280;

  const margin = {
    top: 20,
    right: 20,
    bottom: 70,
    left: 60,
  };

  d3.select("#country-gdp-chart").html("");

  const chartContainer = d3
    .select("#country-gdp-chart")
    .append("div")
    .attr("class", "country-gdp-svg-container");

  const svg = chartContainer
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain([
      d3.min(countryHistory, (d) => d.year),
      d3.max(countryHistory, (d) => d.year),
    ])
    .range([0, innerWidth]);

  const y = d3
    .scaleLinear()
    .domain([
      0,
      d3.max([
        ...countryHistory.map((d) => d.gdpPerCapita),
        ...worldHistory.map((d) => d.gdpPerCapita),
      ]),
    ])
    .nice()
    .range([innerHeight, 0]);

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.gdpPerCapita));

  // world median line
  g.append("path")
    .datum(worldHistory)
    .attr("fill", "none")
    .attr("stroke", "var(--color-text-secondary)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,5")
    .attr("d", line);

  // country line
  g.append("path")
    .datum(countryHistory)
    .attr("fill", "none")
    .attr("stroke", "var(--color-accent)")
    .attr("stroke-width", 3)
    .attr("d", line);

  // selected year gap
  const countryEnd = countryHistory.at(-1);
  const worldEnd = worldHistory.at(-1);

  g.append("line")
    .attr("x1", x(countryEnd.year))
    .attr("x2", x(countryEnd.year))
    .attr("y1", y(countryEnd.gdpPerCapita))
    .attr("y2", y(worldEnd.gdpPerCapita))
    .attr("stroke", "var(--color-chart)")
    .attr("stroke-dasharray", "3,3");

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(
          d3.range(
            journey.years[0],
            journey.years[journey.state.yearIndex] + 1,
            5,
          ),
        )
        .tickFormat(d3.format("d")),
    );
  g.append("g").call(
    d3.axisLeft(y).tickFormat((d) => `$${d3.format(".2s")(d)}`),
  );

  g.selectAll(".country-point")
    .data(countryHistory)
    .enter()
    .append("circle")
    .attr("class", "country-point")
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.gdpPerCapita))
    .attr("r", 3)
    .attr("fill", "var(--color-accent)");

  g.selectAll(".world-point")
    .data(worldHistory)
    .enter()
    .append("circle")
    .attr("class", "world-point")
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.gdpPerCapita))
    .attr("r", 3)
    .attr("fill", "var(--color-text-secondary)");

  g.selectAll(".country-value")
    .data(countryHistory)
    .enter()
    .append("text")
    .attr("class", "country-value")
    .attr("x", (d) => x(d.year))
    .attr("y", (d) => y(d.gdpPerCapita) - 8)
    .attr("text-anchor", "middle")
    .text((d) => d3.format(".2s")(d.gdpPerCapita));

  g.selectAll(".world-value")
    .data(worldHistory)
    .enter()
    .append("text")
    .attr("class", "world-value")
    .attr("x", (d) => x(d.year))
    .attr("y", (d) => y(d.gdpPerCapita) + 14)
    .attr("text-anchor", "middle")
    .text((d) => d3.format(".2s")(d.gdpPerCapita));

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${margin.left},${height - 30})`);

  legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 25)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "var(--color-accent)")
    .attr("stroke-width", 3);

  legend
    .append("text")
    .attr("x", 35)
    .attr("y", 4)
    .attr("font-size", "var(--text-xs)")
    .text("Country GDP per capita");

  legend
    .append("line")
    .attr("x1", 180)
    .attr("x2", 205)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "var(--color-text-secondary)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,5");

  legend
    .append("text")
    .attr("x", 215)
    .attr("y", 4)
    .attr("font-size", "var(--text-xs)")
    .text("World median GDP per capita");

  const caption = d3
    .select("#country-gdp-chart")
    .append("div")
    .attr("class", "chart-caption")
    .text(
      "Tracks the country's GDP per capita growth against the global median over time, highlighting the economic divide at the selected year.",
    );
}
