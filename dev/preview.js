const ICON_PATHS = {
  "mdi:lightning-bolt": "M13 2 4 14h7l-1 8 10-12h-7z",
  "mdi:solar-power-variant": "M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  "mdi:transmission-tower": "M12 2 5 22m7-20 7 20M7 9h10M6 14h12M9 4h6M5 22l13-8M19 22 6 14",
  "mdi:home-lightning-bolt": "M3 11 12 3l9 8M5 10v11h14V10M13 10l-4 6h4l-1 4 5-7h-4z",
  "mdi:car-electric": "M4 11l2-6h12l2 6M3 11h18v8H3zM5 19v3m14-3v3M6 14h2m8 0h2",
  "mdi:heat-pump": "M3 5h18v14H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M12 12V7.5M12 12l3.9 2.25M12 12l-3.9 2.25",
  "mdi:battery": "M9 2h6v2h3v18H6V4h3zM9 13h6v6H9z",
};
const previewWidth = Number(new URLSearchParams(location.search).get("viewport"));
if (Number.isFinite(previewWidth) && previewWidth >= 320 && previewWidth <= 1920) {
  document.documentElement.style.width = `${previewWidth}px`;
  document.documentElement.style.maxWidth = "100%";
  document.documentElement.classList.toggle("preview-mobile", previewWidth <= 700);
}

customElements.define("ha-card", class extends HTMLElement {});
customElements.define("ha-icon", class extends HTMLElement {
  static get observedAttributes() { return ["icon"]; }
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    const icon = this.getAttribute("icon");
    const path = ICON_PATHS[icon] || (icon?.startsWith("mdi:battery") && ICON_PATHS["mdi:battery"]) || "M9 2h6v3h4v17H5V5h4zM9 9h6m-6 4h6m-6 4h6";
    this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}svg{width:100%;height:100%}</style><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
});

window.mockState = (state, unit = "") => ({ state: String(state), attributes: { unit_of_measurement: unit } });
window.mockConfig = {
  type: "custom:energy-house-card",
  title: "Energy",
  entities: {
    solar: "sensor.demo_solar", grid: "sensor.demo_grid", home: "sensor.demo_home",
    battery_soc: "sensor.demo_battery_soc", battery_power: "sensor.demo_battery_power",
    car_soc: "sensor.demo_car_soc", car_power: "sensor.demo_car_power",
    sun: "sun.demo", weather: "weather.demo",
  },
  car: { name: "Electric car", style: "sedan" },
};
window.mockHass = (overrides = {}) => ({
  states: {
    "sensor.demo_solar": mockState(6800, "W"),
    "sensor.demo_grid": mockState(-300, "W"),
    "sensor.demo_home": mockState(1200, "W"),
    "sensor.demo_battery_soc": mockState(54, "%"),
    "sensor.demo_battery_power": mockState(-900, "W"),
    "sensor.demo_car_soc": mockState(42, "%"),
    "sensor.demo_car_power": mockState(4.4, "kW"),
    "sun.demo": mockState("above_horizon"),
    "weather.demo": mockState("sunny"),
    ...overrides,
  },
});

window.PLAYGROUND_DEFAULTS = {
  solar: "roof", battery: "wall", car: "sedan", carColor: "#ecebe6", grid: true, heatPump: true,
  roof: "#3d4b5c", time: "day", weather: "clear",
  solarW: 6800, groundW: 2400, homeW: 1200, batteryW: -900, batterySoc: 54, carW: 4400, carSoc: 42, pumpW: 650,
};
const hasRoof = (o) => o.solar === "roof" || o.solar === "both";
const hasGround = (o) => o.solar === "ground" || o.solar === "both";

// The layout is fixed: equipment appears simply because its sensor is configured.
window.buildPlaygroundConfig = (o) => {
  const entities = { home: "sensor.demo_home" };
  if (o.grid) entities.grid = "sensor.demo_grid";
  if (hasRoof(o)) entities.solar = "sensor.demo_solar";
  if (hasGround(o)) entities.solar_ground = "sensor.demo_ground_solar";
  if (o.battery !== "none") Object.assign(entities, { battery_power: "sensor.demo_battery_power", battery_soc: "sensor.demo_battery_soc" });
  if (o.car !== "none") Object.assign(entities, { car_power: "sensor.demo_car_power", car_soc: "sensor.demo_car_soc" });
  if (o.heatPump) entities.heat_pump = "sensor.demo_pump";
  entities.weather = "weather.demo";
  return {
    title: "Energy",
    entities,
    ...(o.car !== "none" && { car: { name: "Car", style: o.car, color: o.carColor } }),
    ...(o.battery !== "none" && { battery: { style: o.battery } }),
    house: { roof_color: o.roof },
    night: o.time === "night",
    weather_effects: o.weather === "rain",
  };
};

// Grid balances the scene: positive import, negative export. Battery positive = discharging.
window.playgroundGrid = (o) =>
  o.homeW + (o.car !== "none" ? o.carW : 0) + (o.heatPump ? o.pumpW : 0) -
  (hasRoof(o) ? o.solarW : 0) - (hasGround(o) ? o.groundW : 0) - (o.battery !== "none" ? o.batteryW : 0);

window.buildPlaygroundHass = (o) => mockHass({
  "sensor.demo_solar": mockState(hasRoof(o) ? o.solarW : 0, "W"),
  "sensor.demo_ground_solar": mockState(hasGround(o) ? o.groundW : 0, "W"),
  "sensor.demo_home": mockState(o.homeW, "W"),
  "sensor.demo_grid": mockState(playgroundGrid(o), "W"),
  "sensor.demo_battery_power": mockState(o.batteryW, "W"),
  "sensor.demo_battery_soc": mockState(o.batterySoc, "%"),
  "sensor.demo_car_power": mockState(o.carW, "W"),
  "sensor.demo_car_soc": mockState(o.carSoc, "%"),
  "sensor.demo_pump": mockState(o.pumpW, "W"),
  "weather.demo": mockState(o.weather === "rain" ? "rainy" : "sunny"),
});

const toYaml = (value, indent = "") => {
  const scalar = (v) => typeof v === "string" ? (/^[\w./-]+$/.test(v) && !/^(true|false|null|\d)/.test(v) ? v : JSON.stringify(v)) : String(v);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object")) return `[${value.map(scalar).join(", ")}]`;
    return value.map((v) => `\n${indent}- ${toYaml(v, indent + "  ").replace(/^\n\s*/, "")}`).join("");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([k, v]) => {
      const inner = toYaml(v, indent + "  ");
      return `\n${indent}${k}:${inner.startsWith("\n") ? "" : " "}${inner}`;
    }).join("");
  }
  return scalar(value);
};

window.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#controls");
  const card = document.querySelector("#playground");
  const yaml = document.querySelector("#yaml");
  // ?set=solar:both,time:night preselects controls (handy for screenshots and links).
  const preset = Object.fromEntries((new URLSearchParams(location.search).get("set") || "").split(",").filter(Boolean).map((pair) => pair.split(":")));
  const state = { ...PLAYGROUND_DEFAULTS };
  for (const [key, value] of Object.entries(preset)) if (Object.hasOwn(state, key)) state[key] = typeof state[key] === "number" ? Number(value) : typeof state[key] === "boolean" ? value === "true" : value;
  let configKey = "";

  for (const [key, value] of Object.entries(state)) {
    const input = form.elements[key];
    if (!input) continue;
    if (input.type === "checkbox") input.checked = value; else input.value = value;
  }

  const read = () => {
    for (const key of Object.keys(state)) {
      const input = form.elements[key];
      if (!input) continue;
      state[key] = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
    }
  };

  const render = () => {
    read();
    const config = buildPlaygroundConfig(state);
    const key = JSON.stringify(config);
    if (key !== configKey) {
      try {
        card.setConfig(config);
        configKey = key;
        yaml.textContent = `type: custom:energy-house-card${toYaml(config)}`;
        form.querySelector("#error").textContent = "";
      } catch (error) {
        form.querySelector("#error").textContent = error.message;
      }
    }
    card.hass = buildPlaygroundHass(state);
    const fmt = (w) => Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`;
    for (const output of form.querySelectorAll("output[for]")) {
      const input = form.elements[output.htmlFor.value];
      output.textContent = input.name.endsWith("Soc") ? `${input.value}%` : fmt(Number(input.value));
    }
    const grid = playgroundGrid(state);
    form.querySelector("#grid-out").textContent = `${fmt(Math.abs(grid))} ${grid >= 0 ? "import" : "export"}`;
    for (const row of form.querySelectorAll("[data-needs]")) {
      const [k, values] = row.dataset.needs.split("=");
      row.hidden = values ? !values.split("|").includes(state[k]) : !state[k];
    }
  };

  form.addEventListener("input", render);
  form.querySelector("#reset").addEventListener("click", () => {
    for (const [key, value] of Object.entries(PLAYGROUND_DEFAULTS)) {
      const input = form.elements[key];
      if (input) { if (input.type === "checkbox") input.checked = value; else input.value = value; }
    }
    render();
  });
  render();
});
