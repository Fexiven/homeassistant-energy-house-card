<div align="center">

# ⚡ Energy House Card

**Your home's energy, as a living isometric house.**
Solar, grid, battery, heat pump and EV — with animated power flowing through every cable.

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5?logo=homeassistantcommunitystore&logoColor=white)](https://hacs.xyz)
[![Release](https://img.shields.io/github/v/release/Fexiven/homeassistant-energy-house-card?include_prereleases&label=release&color=ffb74d)](https://github.com/Fexiven/homeassistant-energy-house-card/releases)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.8%2B-18BCF2?logo=homeassistant&logoColor=white)](https://www.home-assistant.io)
![Dependencies](https://img.shields.io/badge/dependencies-none-69f0ae)

<img src="https://raw.githubusercontent.com/Fexiven/homeassistant-energy-house-card/main/docs/preview.png" alt="Energy House Card showing roof and ground solar, grid, battery, heat pump and a charging car" width="760">

</div>

> [!NOTE]
> **Beta (0.1.0-beta).** Options may still change before 1.0. Feedback and issues are very welcome.

## ✨ Features

- 🏠 **Zero layout work.** Pick your sensors and the scene builds itself. Equipment you don't have simply isn't drawn.
- 🔆 **Everything a modern home has:** rooftop and ground-mounted solar, grid, home battery, heat pump, EV with charger.
- 🌊 **Live energy flows.** Dots run along each cable in the direction of the power, faster as it increases.
- 🌙 **Day & night.** Windows light up after sunset (from `sun.sun`); optional rain and snow from your weather entity.
- 🎛️ **Visual editor** built in, plus a card picker that pre-selects your sensors.
- 👆 **Tap any badge** to open the sensor's more-info dialog.
- 🪶 **One small JavaScript file**, no libraries. Animations are pure CSS, pause off-screen and respect *reduced motion*.

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/Fexiven/homeassistant-energy-house-card/main/docs/preview-night.png" alt="Night scene with lit windows, an SUV and a rack battery"></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/Fexiven/homeassistant-energy-house-card/main/docs/preview-minimal.png" alt="Minimal setup with only roof solar and grid"></td>
  </tr>
  <tr>
    <td align="center"><sub>At night — SUV, rack battery, custom car color</sub></td>
    <td align="center"><sub>Minimal setup — just solar, grid and home</sub></td>
  </tr>
</table>

## 📦 Installation

### HACS (recommended)

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Fexiven&repository=homeassistant-energy-house-card&category=plugin)

Or manually: HACS → **⋮ → Custom repositories** → add
`https://github.com/Fexiven/homeassistant-energy-house-card` as type **Dashboard**,
then install **Energy House Card**.
While in beta, enable **Show beta versions** for the repository in HACS.

### Manual

1. Download `energy-house-card.js` from the
   [latest release](https://github.com/Fexiven/homeassistant-energy-house-card/releases) into `/config/www/`.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**:
   `/local/energy-house-card.js?v=0.1.0-beta`, type **JavaScript module**.
3. Reload the browser.

## 🚀 Quick start

Add **Energy House Card** from the card picker and choose your sensors — or paste:

```yaml
type: custom:energy-house-card
entities:
  grid: sensor.grid_power
  solar: sensor.solar_power
  home: sensor.home_power
```

That's it. Add more sensors and the battery, car, heat pump or ground array appear.

<details>
<summary><b>Full example with every option</b></summary>

```yaml
type: custom:energy-house-card
title: Energy
entities:
  grid: sensor.grid_power                  # + import / − export
  home: sensor.home_power
  solar: sensor.roof_solar_power           # rooftop panels
  solar_ground: sensor.ground_solar_power  # ground-mounted array
  battery_power: sensor.battery_power      # + discharging / − charging
  battery_soc: sensor.battery_soc
  car_power: sensor.car_charge_power       # + charging
  car_soc: sensor.car_soc
  heat_pump: sensor.heat_pump_power
  weather: weather.home                    # only used with weather_effects
invert:
  grid: false                              # true if your sensor uses the opposite sign
car:
  name: Car
  style: sedan                             # sedan | suv
  color: "#ecebe6"
battery:
  style: wall                              # wall | rack
house:
  wall_color: "#d9cbb3"
  roof_color: "#3d4b5c"
weather_effects: false
```

</details>

## ⚙️ Configuration

### Sensors — `entities`

| Key | Adds to the scene | Sign convention |
| --- | --- | --- |
| `grid` | 🗼 Grid pole + cable | ➕ import · ➖ export |
| `home` | 🏠 Home badge | consumption |
| `solar` | ☀️ Rooftop panels + cable | production |
| `solar_ground` | ☀️ Ground-mounted array + cable | production |
| `battery_power` | 🔋 Battery + cable | ➕ discharging · ➖ charging |
| `battery_soc` | 🔋 Battery level (%) | |
| `car_power` | 🚗 Car, charger + cable | ➕ charging · ➖ discharging (V2H) |
| `car_soc` | 🚗 Car battery level (%) | |
| `heat_pump` | ♨️ Heat pump + cable | consumption |
| `sun` | 🌙 Day/night lighting — default `sun.sun` | |
| `weather` | 🌧️ Rain/snow (needs `weather_effects: true`) | |

Power sensors can report **W, kW or MW** (no unit = W); levels must be **0–100 %**.
Unavailable or non-numeric readings show **—** and stop the flow — never a fake `0`.

> [!TIP]
> Sensor counts the other way round? Flip it instead of creating a template sensor:
> ```yaml
> invert:
>   grid: true
>   battery_power: true
> ```

### Options

| Option | Default | Description |
| --- | --- | --- |
| `title` | `Energy` | Card heading; `""` hides it |
| `threshold` | `10` | A flow is active above this absolute power (W) |
| `animate` | `true` | `false` for a static picture |
| `night` | from `sun` | Force day (`false`) or night (`true`) |
| `theme_background` | `false` | Use your theme's card background |
| `weather_effects` | `false` | Rain/snow from `entities.weather` |
| `car.name` | `Car` | Car badge label |
| `car.style` | `sedan` | `sedan` or `suv` |
| `car.color` | off-white | Hex body color |
| `car.color_entity` | — | Sensor with a hex color or Tesla paint name (`PearlWhite`, `DeepBlue`, …) |
| `battery.style` | `wall` | `wall` (with level strip) or `rack` |
| `battery.color` | per style | Hex enclosure color |
| `house.wall_color` | `#d9cbb3` | Hex wall color |
| `house.roof_color` | `#3d4b5c` | Hex roof color |

## 🛠️ Development

The preview uses synthetic data and never connects to Home Assistant.

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

| URL | What it does |
| --- | --- |
| `/dev/preview.html` | Interactive playground with equipment toggles and sliders |
| `/dev/preview.html?test` | Runs the browser test suite |
| `/dev/preview.html?set=solar:both,time:night` | Preselects playground controls |
| `/dev/screenshot.html?time=night&car=suv` | Bare card at 760 px, used for the README images |

README images are taken with a headless Chromium browser, for example:

```sh
msedge --headless=new --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor=2 --window-size=760,582 \
  --screenshot=docs/preview.png "http://127.0.0.1:8766/dev/screenshot.html"
```

**Releasing:** attach `energy-house-card.js` itself to every GitHub release. HACS installs
release assets instead of repository files, so a release with only a ZIP leaves HACS
without the card ("Custom element doesn't exist").
