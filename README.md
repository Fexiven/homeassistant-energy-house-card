# Energy House Card

> **Beta (0.1.0-beta).** Options may still change before 1.0.

A Home Assistant dashboard card that shows your home as an isometric house with
animated energy flows: roof and ground solar, grid, home battery, heat pump and an
electric car at a standing charger. One self-contained JavaScript file, no
dependencies.

The layout is **fixed**. You only tell the card which sensors you have; equipment
and its cable appear when its sensor is configured and disappear otherwise.

## Installation

### HACS (recommended)

1. HACS → **⋮ → Custom repositories** → add
   `https://github.com/Fexiven/homeassistant-energy-house-card`, type **Dashboard**.
2. Install **Energy House Card**. HACS registers the dashboard resource for you.
3. Reload the browser.

### Manual

1. Copy `energy-house-card.js` to `/config/www/energy-house-card.js`.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**:
   `/local/energy-house-card.js?v=0.1.0-beta`, type **JavaScript module**.
   Bump `?v=` whenever you replace the file.
3. Reload the browser.

## Configuration

Add the card from the card picker (**Energy House Card**) and pick your sensors in
the visual editor, or paste YAML:

```yaml
type: custom:energy-house-card
entities:
  grid: sensor.grid_power
  solar: sensor.solar_power
  home: sensor.home_power
```

See [`examples/full.yaml`](examples/full.yaml) for every option.

### Sensors (`entities`)

| Key | Shows | Sign convention |
| --- | --- | --- |
| `grid` | Grid pole + cable | + import, − export |
| `home` | Home badge | consumption |
| `solar` | Rooftop panels + cable | production |
| `solar_ground` | Ground-mounted array + cable | production |
| `battery_power` | Battery + cable | + discharging, − charging |
| `battery_soc` | Battery level (%) | |
| `car_power` | Car, charger + cable | + charging, − discharging (V2H) |
| `car_soc` | Car battery level (%) | |
| `heat_pump` | Heat pump + cable | consumption |
| `sun` | Day/night lighting (default `sun.sun`) | |
| `weather` | Rain/snow effect (needs `weather_effects: true`) | |

Power sensors may report W, kW or MW (no unit = W). SOC sensors must be 0–100 %.
Unavailable or non-numeric readings show **—** and stop the flow; they never show 0.
If a sensor uses the opposite sign, flip it:

```yaml
invert:
  grid: true
  battery_power: true
```

Click a badge to open the sensor's more-info dialog.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `title` | `Energy` | Heading; `""` hides it |
| `threshold` | `10` | Flows are active above this absolute power (W) |
| `animate` | `true` | `false` keeps a static picture |
| `night` | from `sun` | Force day (`false`) or night (`true`) |
| `theme_background` | `false` | Use the Home Assistant card background |
| `weather_effects` | `false` | CSS rain/snow from `entities.weather` |
| `car.name` | `Car` | Car badge label |
| `car.style` | `sedan` | `sedan` or `suv` |
| `car.color` / `car.color_entity` | off-white | Hex color, or a sensor with a hex value or a Tesla paint name |
| `battery.style` | `wall` | `wall` (with level strip) or `rack` |
| `battery.color` | per style | Hex color |
| `house.wall_color` / `house.roof_color` | `#d9cbb3` / `#3d4b5c` | Hex colors |

## Development

The preview uses synthetic data and never connects to Home Assistant.

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open `http://127.0.0.1:8766/dev/preview.html` (add `?test` to run the browser tests,
`?set=solar:both,time:night` to preselect controls).

**Releasing:** attach `energy-house-card.js` itself to every GitHub release. HACS
installs release assets instead of the repository files, so a release with only a ZIP
leaves HACS without the card ("Custom element doesn't exist").
