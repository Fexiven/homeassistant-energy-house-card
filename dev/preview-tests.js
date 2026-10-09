window.addEventListener("DOMContentLoaded", async () => {
  if (!new URLSearchParams(location.search).has("test")) return;
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const test = (name, run) => {
    try { run(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  };
  const fixture = (config = mockConfig, hass = mockHass()) => {
    const card = document.createElement("energy-house-card");
    card.setConfig(config);
    card.hass = hass;
    return card;
  };
  const value = (card, key) => card.shadowRoot.querySelector(`#b-${key} .v`).textContent;
  const status = (card, key) => card.shadowRoot.querySelector(`#b-${key} .s`).textContent;
  const flow = (card, key) => card.shadowRoot.querySelector(`[data-cable="${key}"]`).classList;
  const eq = (card, key) => card.shadowRoot.querySelector(`#eq-${key}`);
  const throws = (fn) => { let caught = false; try { fn(); } catch { caught = true; } assert(caught, "Expected configuration error"); };
  // Every drawn cable segment must be vertical or follow an isometric ground axis (slope ±tan 30°).
  const assertStraight = (card, name = "") => {
    for (const base of card.shadowRoot.querySelectorAll(".flow .base")) {
      const pts = [...base.getAttribute("d").matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i][0] - pts[i - 1][0]), dy = Math.abs(pts[i][1] - pts[i - 1][1]);
        if (Math.hypot(dx, dy) < 0.5) continue;
        assert(dx <= 0.15 || Math.abs(dy - 0.57735 * dx) <= 0.15, `${name} ${base.parentNode.dataset.cable}: angled segment`);
      }
    }
  };
  const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  test("Power units and SOC", () => {
    const card = fixture();
    assert(value(card, "solar") === "6.80 kW", "Solar units");
    assert(value(card, "car") === "↓ 4.40 kW" && status(card, "car") === "42 % · Charging", "kW conversion, car level");
    assert(value(card, "battery") === "↓ 900 W" && status(card, "battery") === "54 % · Charging", "Power first, level second");
    assert(value(card, "grid") === "← 300 W", "Export arrow");
  });
  test("Import, export, charging, discharge directions", () => {
    const card = fixture();
    assert(status(card, "grid") === "Export" && flow(card, "grid").contains("rev"), "Export direction");
    assert(status(card, "battery").endsWith("Charging") && flow(card, "battery").contains("on") && !flow(card, "battery").contains("rev"), "Battery charging flows house -> battery");
    assert(flow(card, "car").contains("on") && !flow(card, "car").contains("rev"), "Car charging direction");
    card.hass = mockHass({ "sensor.demo_grid": mockState(100), "sensor.demo_battery_power": mockState(500), "sensor.demo_car_power": mockState(-2, "kW") });
    assert(status(card, "grid") === "Import" && value(card, "grid") === "→ 100 W" && !flow(card, "grid").contains("rev"), "Import direction");
    assert(status(card, "battery").endsWith("Discharging") && value(card, "battery") === "↑ 500 W" && flow(card, "battery").contains("rev"), "Battery discharge direction");
    assert(status(card, "car").endsWith("Discharging") && value(card, "car") === "↑ 2.00 kW" && flow(card, "car").contains("rev"), "Vehicle discharge direction");
  });
  test("Configured inversion and exact threshold", () => {
    const card = fixture({ ...mockConfig, invert: { grid: true, battery_power: true } });
    assert(status(card, "grid") === "Import", "Grid inversion");
    assert(status(card, "battery").endsWith("Discharging"), "Battery inversion");
    card.hass = mockHass({ "sensor.demo_grid": mockState(-10) });
    assert(!flow(card, "grid").contains("on"), "10 W must be inactive");
    card.hass = mockHass({ "sensor.demo_grid": mockState(-10.01) });
    assert(flow(card, "grid").contains("on"), "10.01 W must be active");
  });
  test("Unavailable readings clear stale flows, LEDs and SOC", () => {
    const card = fixture();
    card.hass = { states: Object.fromEntries(Object.keys(mockHass().states).map((id) => [id, mockState("unavailable")])) };
    for (const key of ["solar", "grid", "home", "battery", "car"]) {
      assert(value(card, key) === "—", `${key} must not display old data`);
      assert(status(card, key) === "Unavailable", `${key} status`);
    }
    for (const key of ["solar", "grid", "battery", "car"]) assert(!flow(card, key).contains("on"), `${key} flow must stop`);
    assert(eq(card, "battery").querySelector(".soc").getAttribute("visibility") === "hidden", "Stale SOC bar");
    assert(!eq(card, "car").classList.contains("charging"), "Stale charge glow");
    assert(!eq(card, "battery").classList.contains("active"), "Stale battery LED");
  });
  test("Malformed numbers and invalid SOC never become real readings", () => {
    for (const state of ["", " ", "12junk", "Infinity", "NaN", "unknown"]) {
      assert(value(fixture(mockConfig, mockHass({ "sensor.demo_solar": mockState(state) })), "solar") === "—", `Rejected ${JSON.stringify(state)}`);
    }
    const card = fixture(mockConfig, mockHass({
      "sensor.demo_battery_soc": mockState(101, "%"), "sensor.demo_battery_power": mockState("unknown"), "sensor.demo_solar": mockState(100, "kWh"),
    }));
    assert(value(card, "battery") === "—", "Out-of-range SOC");
    assert(value(card, "solar") === "—", "Not a power unit");
  });
  test("SOC-only batteries don't pretend to be idle", () => {
    const entities = { ...mockConfig.entities };
    delete entities.battery_power;
    const card = fixture({ ...mockConfig, entities });
    assert(status(card, "battery") === "" && value(card, "battery") === "54 %", "Level only, no invented activity");
    assert(!card.shadowRoot.querySelector('[data-cable="battery"]'), "No cable without a power sensor");
    assert(eq(card, "battery"), "Battery still drawn");
  });
  test("Scene retained for sensor and unrelated updates", () => {
    const card = fixture();
    const scene = card.shadowRoot.querySelector(".scene");
    card.hass = mockHass({ "sensor.unrelated": mockState(123) });
    card.hass = mockHass({ "sensor.demo_home": mockState(987) });
    assert(value(card, "home") === "987 W", "Home text update");
    assert(card.shadowRoot.querySelector(".scene") === scene, "Sensor rerender");
  });
  test("Equipment appears only when its sensor is configured", () => {
    const card = fixture({ entities: { solar: "sensor.demo_solar" }, title: "" });
    for (const key of ["grid", "car", "charger", "battery", "heat_pump", "solar_ground"]) assert(!eq(card, key), `${key} drawn without a sensor`);
    assert(!card.shadowRoot.querySelector("#b-car") && !card.shadowRoot.querySelector(".hdr"), "Car badge / title omitted");
    assert(eq(card, "house").querySelector(".pv-glint"), "Roof panels with solar sensor");
    assert(!eq(fixture({ entities: { grid: "sensor.demo_grid" } }), "house").querySelector(".pv-glint"), "No roof panels without solar sensor");
    card.setConfig({ ...mockConfig, animate: false, night: true });
    assert(card.shadowRoot.querySelector("ha-card").classList.contains("still"), "Animations disabled");
    assert(card.shadowRoot.querySelector("ha-card").classList.contains("night"), "Night override");
    assert(status(card, "car").startsWith("42 %"), "New config applied without next HA update");
  });
  test("Invalid configurations rejected explicitly", () => {
    for (const config of [
      null, { entities: [] }, { entities: { solar: "bad id" } }, { entities: { typo: "sensor.x" } },
      { threshold: -1 }, { threshold: Infinity }, { car: { style: "typo" } }, { battery: { style: "typo" } },
      { car: { color: "not-a-color" } }, { animate: "false" }, { invert: { sun: true } },
    ]) throws(() => document.createElement("energy-house-card").setConfig(config));
  });
  test("Custom text remains literal", () => {
    const card = fixture({ ...mockConfig, title: '<img src=x onerror="alert(1)">', car: { name: "<b>Car</b>" } });
    assert(card.shadowRoot.querySelector(".hdr span").textContent.startsWith("<img"), "Title escaped");
    assert(!card.shadowRoot.querySelector(".hdr img, .badge b"), "No injected DOM");
  });
  test("Badges open the entity's more-info dialog", () => {
    const card = fixture();
    let opened = null;
    card.addEventListener("hass-more-info", (event) => { opened = event.detail.entityId; });
    card.shadowRoot.querySelector("#b-grid .v").click();
    assert(opened === "sensor.demo_grid", "Grid more-info");
    card.shadowRoot.querySelector("#b-battery").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
    assert(opened === "sensor.demo_battery_soc", "Keyboard opens SOC entity");
  });
  test("Sections view lets the card grow with its content", () => {
    const options = document.createElement("energy-house-card").getGridOptions();
    assert(!("rows" in options) && !("min_rows" in options), "A fixed row count clips the tiles on narrow cards");
  });
  test("Visual editor schema and stub config", () => {
    const Card = customElements.get("energy-house-card");
    const form = Card.getConfigForm();
    assert(form.schema.length && typeof form.computeLabel === "function", "Form schema");
    throws(() => form.assertConfig({ entities: { typo: "sensor.x" } }));
    form.assertConfig(Card.getStubConfig({ states: {} }));
    const stub = Card.getStubConfig({ states: {
      "sensor.grid_power": { state: "1", attributes: { device_class: "power" } },
      "sensor.grid_energy": { state: "1", attributes: { device_class: "energy" } },
      "sensor.battery_level": { state: "1", attributes: { device_class: "battery" } },
    } });
    assert(stub.entities.grid === "sensor.grid_power" && stub.entities.battery_soc === "sensor.battery_level" && !stub.entities.solar, JSON.stringify(stub));
  });
  test("Rain layers don't change card layout", () => {
    const card = fixture({ ...mockConfig, weather_effects: true }, mockHass({ "weather.demo": mockState("rainy") }));
    card.style.width = "420px";
    document.body.append(card);
    try {
      assert(getComputedStyle(card.shadowRoot.querySelector(".drops")).position === "absolute", "Weather overlay");
      assert(card.getBoundingClientRect().height > 280, "Card geometry");
      assert(!fixture().shadowRoot.querySelector(".drops"), "No weather nodes by default");
    } finally { card.remove(); }
  });
  test("Static and offscreen modes actually stop active animations", () => {
    const card = fixture();
    document.body.append(card);
    try {
      card.shadowRoot.querySelector("ha-card").classList.add("paused");
      assert(getComputedStyle(card.shadowRoot.querySelector('[data-cable="car"] .dots')).animationPlayState === "paused", "Pause ignored");
      card.setConfig({ ...mockConfig, animate: false });
      assert(getComputedStyle(card.shadowRoot.querySelector('[data-cable="car"] .dots')).animationName === "none", "Static mode animates");
    } finally { card.remove(); }
  });
  test("Car color entity and equipment variants", () => {
    const card = fixture({ ...mockConfig, car: { color_entity: "sensor.demo_color" } }, mockHass({ "sensor.demo_color": mockState("PearlWhite") }));
    const scene = card.shadowRoot.querySelector(".scene");
    card.hass = mockHass({ "sensor.demo_color": mockState("DeepBlue") });
    assert(card.shadowRoot.querySelector(".scene") !== scene, "Body color not updated");
    card.setConfig({ ...mockConfig, car: { style: "suv" }, battery: { style: "rack" } });
    assert(eq(card, "battery").querySelectorAll(".led").length === 5, "Rack modules missing");
    assert(!eq(card, "battery").querySelector(".soc"), "Wall indicator on rack");
  });
  test("Night lights every window inside the house layer", () => {
    const card = fixture({ ...mockConfig, night: true });
    assert(eq(card, "house").querySelectorAll(".win-lit").length === 5, "Window lighting missing");
    assert(card.shadowRoot.querySelectorAll(".win-lit").length === 5, "Window escaped house layer");
  });
  test("Every equipment combination renders straight cables and non-overlapping badges", () => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-10000px;top:0";
    document.body.append(host);
    const card = document.createElement("energy-house-card");
    host.append(card);
    const overlap = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    let combos = 0;
    try {
      for (const solar of ["roof", "ground", "both", "none"]) for (const battery of ["wall", "rack", "none"])
      for (const car of ["sedan", "suv", "none"]) for (const grid of [true, false]) for (const heatPump of [true, false]) {
        const o = { ...PLAYGROUND_DEFAULTS, solar, battery, car, grid, heatPump }, name = JSON.stringify({ solar, battery, car, grid, heatPump });
        card.setConfig(buildPlaygroundConfig(o));
        card.hass = buildPlaygroundHass(o);
        assertStraight(card, name);
        for (const width of ["320px", "520px", "720px"]) {
          card.style.width = width;
          const bounds = card.getBoundingClientRect();
          const badges = [...card.shadowRoot.querySelectorAll(".badge")].map((b) => [b.id, b.getBoundingClientRect()]);
          for (const [id, r] of badges) assert(r.left >= bounds.left - 0.5 && r.right <= bounds.right + 0.5 && r.bottom <= bounds.bottom + 0.5, `${name} ${width}: ${id} clipped`);
          for (let i = 0; i < badges.length; i++) for (let j = i + 1; j < badges.length; j++)
            assert(!overlap(badges[i][1], badges[j][1]), `${name} ${width}: ${badges[i][0]} overlaps ${badges[j][0]}`);
        }
        combos++;
      }
    } finally { host.remove(); }
    assert(combos === 144, `Only ${combos} combinations checked`);
  });
  test("Narrow cards show readable tiles below the picture; wide cards overlay the picture", () => {
    const card = fixture();
    document.body.append(card);
    try {
      const svg = () => card.shadowRoot.querySelector(".stage").getBoundingClientRect();
      const badges = () => [...card.shadowRoot.querySelectorAll(".badge")];
      const px = (el, sel) => parseFloat(getComputedStyle(el.querySelector(sel)).fontSize);
      card.style.width = "445px";
      assert(badges().every((b) => b.getBoundingClientRect().top >= svg().bottom - 0.5), "Tiles must sit below the picture");
      assert(badges().map((b) => b.id).join() === "b-solar,b-grid,b-battery,b-home,b-car", "Sources first");
      for (const width of ["445px", "520px", "760px"]) {
        card.style.width = width;
        for (const b of badges()) {
          assert(px(b, ".v") >= 14.5, `${width} ${b.id}: value ${px(b, ".v")}px`);
          assert(px(b, ".l") >= 11 && px(b, ".s") >= 11, `${width} ${b.id}: label ${px(b, ".l")}px`);
        }
      }
      card.style.width = "760px";
      assert(badges().some((b) => b.getBoundingClientRect().top < svg().bottom), "Wide cards overlay the picture");
    } finally { card.remove(); }
  });
  test("Layout option forces wide or compact regardless of width", () => {
    const card = fixture({ ...mockConfig, layout: "compact" });
    document.body.append(card);
    try {
      const below = () => [...card.shadowRoot.querySelectorAll(".badge")].every((b) =>
        b.getBoundingClientRect().top >= card.shadowRoot.querySelector(".stage").getBoundingClientRect().bottom - 0.5);
      card.style.width = "760px";
      assert(below(), "compact must put tiles below a wide card");
      card.setConfig({ ...mockConfig, layout: "wide" });
      card.style.width = "445px";
      assert(!below(), "wide must keep badges on a narrow card");
      card.setConfig({ ...mockConfig, layout: "auto" });
      assert(below(), "auto must switch on a narrow card");
      throws(() => card.setConfig({ ...mockConfig, layout: "big" }));
    } finally { card.remove(); }
  });
  test("Cables are layered against the equipment they pass", () => {
    const o = { ...PLAYGROUND_DEFAULTS, solar: "both" };
    const card = fixture(buildPlaygroundConfig(o), buildPlaygroundHass(o)), root = card.shadowRoot;
    const runs = (id) => [...root.querySelectorAll(`[data-cable="${id}"]`)];
    const house = eq(card, "house"), svg = root.querySelector(".stage > svg");
    // The pole stands in front of the house corner: nothing painted later may cover the grid line.
    assert(runs("grid").some((run) => after(eq(card, "grid"), run)), "Pole covers its own line");
    document.body.append(card);
    try {
      for (const run of runs("grid")) {
        const path = run.querySelector(".base"), length = path.getTotalLength();
        for (let d = 0; d <= length; d += 2) {
          const point = svg.createSVGPoint(), p = path.getPointAtLength(d);
          point.x = p.x; point.y = p.y;
          for (const device of root.querySelectorAll(".equipment")) {
            if (!after(run, device)) continue;
            const local = point.matrixTransform(device.transform.baseVal.consolidate().matrix.inverse());
            const cover = [...device.querySelectorAll("polygon")].find((q) => q.getAttribute("opacity") == null && !q.classList.contains("win-lit") && q.isPointInFill(local));
            assert(!cover, `Grid line hidden by ${device.id} at ${Math.round(p.x)},${Math.round(p.y)}`);
          }
        }
      }
    } finally { card.remove(); }
    assert(new Set(runs("grid").map((run) => run.style.getPropertyValue("--o"))).size === runs("grid").length, "Dot pattern continues across runs");
    assert(runs("solar").some((run) => after(house, run)), "Roof line hidden by house");
    for (const cable of ["battery", "heat_pump", "car"]) assert(runs(cable).some((run) => after(house, run)), `${cable} hidden by house`);
    for (const device of ["battery", "heat_pump"]) assert(runs(device).every((run) => after(run, eq(card, device))), `${device} must cover its own cable`);
    assert(after(runs("car")[0], eq(card, "charger")) && after(eq(card, "charger"), runs("car").at(-1)), "Charger covers its ground cable, not its charging lead");
  });
  test("Every line ends at its own connection-box entry without sharing a lane", () => {
    const o = { ...PLAYGROUND_DEFAULTS, solar: "both" };
    const card = fixture(buildPlaygroundConfig(o), buildPlaygroundHass(o));
    const segments = [];
    for (const base of card.shadowRoot.querySelectorAll(".flow .base")) {
      const pts = [...base.getAttribute("d").matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1], pts[i], base.parentNode.dataset.cable]);
    }
    assert(new Set(segments.map((s) => s[2])).size === 6, "Six cables expected");
    const collinearOverlap = ([a, b, pa], [c, d, pc]) => {
      if (pa === pc) return false;
      const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      if (Math.abs(cross(a, b, c)) > 1 || Math.abs(cross(a, b, d)) > 1) return false;
      const ax = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 0 : 1;
      const lo = Math.max(Math.min(a[ax], b[ax]), Math.min(c[ax], d[ax])), hi = Math.min(Math.max(a[ax], b[ax]), Math.max(c[ax], d[ax]));
      return hi - lo > 1;
    };
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++)
      assert(!collinearOverlap(segments[i], segments[j]), `${segments[i][2]} and ${segments[j][2]} share a lane`);
  });
  test("Active equipment animates; idle equipment is still", () => {
    const o = { ...PLAYGROUND_DEFAULTS, solar: "both" };
    const card = fixture(buildPlaygroundConfig(o), buildPlaygroundHass(o));
    document.body.append(card);
    try {
      const anim = (sel) => getComputedStyle(card.shadowRoot.querySelector(sel)).animationName;
      assert(anim("#eq-car .charge-glow") === "ehc-breathe", "Car charge glow");
      assert(anim("#eq-charger .led") === "ehc-blink", "Charger LED");
      assert(anim("#eq-house .box-led") === "ehc-blink", "Connection box LED");
      assert(anim("#eq-battery .soc") === "ehc-soc", "Battery SOC pulse");
      assert(anim("#eq-heat_pump .fan") === "ehc-spin", "Heat pump fan");
      assert(anim("#eq-house .pv-glint") === "ehc-glint" && anim("#eq-solar_ground .pv-glint") === "ehc-glint", "Panel glint");
      assert(card.shadowRoot.querySelector("#b-solar_ground .v").textContent === "2.40 kW", "Array badge");
      card.hass = buildPlaygroundHass({ ...o, carW: 0, pumpW: 0, solarW: 0, groundW: 0 });
      assert(anim("#eq-car .charge-glow") === "none" && anim("#eq-heat_pump .fan") === "none" && anim("#eq-house .pv-glint") === "none" && anim("#eq-solar_ground .pv-glint") === "none", "Idle equipment must not animate");
    } finally { card.remove(); }
  });
  test("Playground grid balance", () => {
    const o = PLAYGROUND_DEFAULTS;
    assert(playgroundGrid(o) === 1200 + 4400 + 650 - 6800 + 900, "Balance");
    assert(playgroundGrid({ ...o, solar: "both" }) === 1200 + 4400 + 650 - 6800 - 2400 + 900, "Balance with both solar sources");
  });

  window.testResults = { passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
  const output = document.createElement("pre");
  output.id = "test-results";
  output.textContent = JSON.stringify(window.testResults, null, 2);
  document.body.append(output);
});
