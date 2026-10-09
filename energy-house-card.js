/*
 * energy-house-card — isometric energy flow card for Home Assistant.
 * One fixed scene: equipment appears when its sensor is configured. No dependencies.
 * The scene is rendered once per configuration; sensor updates only touch text, classes and attributes.
 */
(() => {
const VERSION = "0.1.0-beta.4";
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

// ---------- isometric geometry ----------
const S = 22, OX = 290, OY = 128, C30 = 0.8660254;
const VB_W = 600, VB_H = 425;
const P = (x, y, z = 0) => [OX + (x - y) * C30 * S, OY + (x + y) * 0.5 * S - z * S];
const pts = (arr) => arr.map((p) => P(...p).map((n) => n.toFixed(1)).join(",")).join(" ");
const poly = (arr, fill, extra = "") => `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`;
const pathD = (arr) => arr.map((p, i) => (i ? "L" : "M") + P(...p).map((n) => n.toFixed(1)).join(" ")).join(" ");

const LIGHT = (() => { const l = [-0.35, 0.55, 1], m = Math.hypot(...l); return l.map((v) => v / m); })();
function hexRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = [...h].map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, f) {
  const c = hexRgb(hex).map((v) => (f <= 1 ? v * f : v + (255 - v) * (f - 1)));
  return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function lit(hex, n) { const m = Math.hypot(...n) || 1; const d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / m; return shade(hex, 0.55 + 0.45 * Math.max(0, d)); }

// axis-aligned box: draws the three visible faces (top, +y, +x)
function box(x0, x1, y0, y1, z0, z1, color, extra = "") {
  return poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], lit(color, [0, 1, 0]), extra) +
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], lit(color, [1, 0, 0]), extra) +
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], lit(color, [0, 0, 1]), extra);
}

// extrude a 2D profile [[u,v],...] along axis "x" (u=y) or "y" (u=x); v is always z
function prism(profile, axis, a0, a1, color, edgeColor) {
  const to3 = (u, v, a) => (axis === "x" ? [a, u, v] : [u, a, v]);
  const n3 = (nu, nv) => (axis === "x" ? [0, nu, nv] : [nu, 0, nv]);
  const cu = profile.reduce((s, p) => s + p[0], 0) / profile.length;
  const cv = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  const strips = [];
  profile.forEach((p, i) => {
    const q = profile[(i + 1) % profile.length];
    let nu = q[1] - p[1], nv = -(q[0] - p[0]);
    if (nu * ((p[0] + q[0]) / 2 - cu) + nv * ((p[1] + q[1]) / 2 - cv) < 0) { nu = -nu; nv = -nv; }
    const n = n3(nu, nv);
    if (n[0] + n[1] + n[2] <= 0.001) return;
    const quad = [to3(p[0], p[1], a0), to3(q[0], q[1], a0), to3(q[0], q[1], a1), to3(p[0], p[1], a1)];
    const depth = quad.reduce((s, c) => s + c[0] + c[1] + c[2], 0);
    strips.push({ depth, svg: poly(quad, lit((edgeColor && edgeColor(i)) || color, n)) });
  });
  strips.sort((a, b) => a.depth - b.depth);
  const cap = poly(profile.map(([u, v]) => to3(u, v, a1)), lit(color, axis === "x" ? [1, 0, 0] : [0, 1, 0]));
  return strips.map((s) => s.svg).join("") + cap;
}

// circle in the x/z plane at a fixed y (projected to an ellipse)
function circleXZ(cx, y, cz, r, fill, n = 18) {
  const a = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; a.push([cx + Math.cos(t) * r, y, cz + Math.sin(t) * r]); }
  return poly(a, fill);
}
function circleYZ(x, cy, cz, r, fill, n = 18) {
  const a = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; a.push([x, cy + Math.cos(t) * r, cz + Math.sin(t) * r]); }
  return poly(a, fill);
}
function groundEllipse(cx, cy, rx, ry, fill, opacity = 1) {
  const a = []; for (let i = 0; i < 20; i++) { const t = (i / 20) * Math.PI * 2; a.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, 0.01]); }
  return poly(a, fill, `opacity="${opacity}"`);
}
// ---------- fixed scene (world units: X down-right, Y down-left, Z up; plot 13 x 12) ----------
const L = {
  house: { x0: 2.5, x1: 10.5, y0: 2, y1: 7, wall: 3, ridgeY: 4.5, ridgeZ: 4.7 },
  car: { x0: 1.4, y0: 8.3, y1: 10.1 },
  battery: { x0: 10.95, x1: 11.65, y0: 5.0, y1: 6.4 },
};
const COLORS = {
  solar: "#ffb74d", grid: "#4fc3f7", battery: "#f06292", home: "#b388ff", car: "#69f0ae", heat_pump: "#74c9df",
};

const TESLA_COLORS = {
  pearlwhite: "#ecebe6", solidblack: "#15171a", obsidianblack: "#1c1d21", midnightsilver: "#5b6168", silvermetallic: "#9ea3a8",
  deepblue: "#1f3a6e", redmulticoat: "#a3161f", ultrared: "#b5121b", quicksilver: "#a7abb0", stealthgrey: "#4b4f55", midnightcherryred: "#5a1420",
};

// Spinning fan drawn in unit coordinates and mapped onto the heat pump's +X face (Y/Z plane).
function fan([cx, cy]) {
  const blade = (deg) => `<path transform="rotate(${deg})" d="M0 0C.12-.16.34-.2.42-.06C.34.02.16.06 0 0Z" fill="#7d8b99"/>`;
  return `<g transform="matrix(${(-C30 * S).toFixed(3)} ${(0.5 * S).toFixed(3)} 0 ${-S} ${cx.toFixed(1)} ${cy.toFixed(1)})"><g class="fan"><circle r=".45" fill="none"/>${[0, 120, 240].map(blade).join("")}<circle r=".1" fill="#a3b1bd"/></g></g>`;
}

const ART = {
  ground() {
    return poly([[0, 0, 0], [13, 0, 0], [13, 12, 0], [0, 12, 0]], "#2c4234") +
      poly([[13, 0, 0], [13, 12, 0], [13, 12, -0.5], [13, 0, -0.5]], "#1b1d22") +
      poly([[0, 12, 0], [13, 12, 0], [13, 12, -0.5], [0, 12, -0.5]], "#24272d") +
      poly([[0.6, 7.6, 0.01], [7.0, 7.6, 0.01], [7.0, 12, 0.01], [0.6, 12, 0.01]], "#3a3f47") +
      poly([[8.45, 7.0, 0.01], [9.35, 7.0, 0.01], [9.35, 12, 0.01], [8.45, 12, 0.01]], "#4a4f57") +
      poly([[2.3, 6.9, 0.01], [11.9, 6.9, 0.01], [11.9, 7.6, 0.01], [2.3, 7.6, 0.01]], "#353a40");
  },

  pole() {
    const wire = (from, to, sag) => {
      const a = P(...from), b = P(...to), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag];
      return `<path d="M${a} Q${m} ${b}" fill="none" stroke="#8a8f99" stroke-width="0.8" opacity="0.7"/>`;
    };
    return groundEllipse(0.8, 4.0, 0.5, 0.5, "#000", 0.25) +
      box(0.7, 0.9, 3.9, 4.1, 0, 6.4, "#6d5a4a") +
      box(0.72, 0.88, 3.1, 4.9, 5.95, 6.1, "#5c4b3e") +
      [3.25, 4.75].map((y) => box(0.74, 0.86, y - 0.06, y + 0.06, 6.1, 6.35, "#cfd8dc")).join("") +
      wire([0.8, 3.25, 6.35], [-5, 0.5, 8.5], 6) + wire([0.8, 4.75, 6.35], [-5, 2.0, 8.5], 6);
  },

  house(o = {}) {
    const h = L.house, wall = o.wall_color || "#d9cbb3", roof = o.roof_color || "#3d4b5c", trim = "#f2ede4";
    const ez = h.wall - 0.4 * ((h.ridgeZ - h.wall) / (h.ridgeY - h.y0)); // eave height with overhang
    const front = poly([[h.x0, h.y1, 0], [h.x1, h.y1, 0], [h.x1, h.y1, h.wall], [h.x0, h.y1, h.wall]], lit(wall, [0, 1, 0]));
    const gable = poly([[h.x1, h.y0, 0], [h.x1, h.y1, 0], [h.x1, h.y1, h.wall], [h.x1, h.ridgeY, h.ridgeZ], [h.x1, h.y0, h.wall]], lit(wall, [1, 0, 0]));
    const plinth = poly([[h.x0, h.y1 + 0.01, 0], [h.x1, h.y1 + 0.01, 0], [h.x1, h.y1 + 0.01, 0.25], [h.x0, h.y1 + 0.01, 0.25]], "#7d7468") +
      poly([[h.x1 + 0.01, h.y0, 0], [h.x1 + 0.01, h.y1, 0], [h.x1 + 0.01, h.y1, 0.25], [h.x1 + 0.01, h.y0, 0.25]], "#6a6258");
    const rx0 = h.x0 - 0.3, rx1 = h.x1 + 0.3, yS = h.y1 + 0.4, yN = h.y0 - 0.4;
    const roofN = poly([[rx0, h.ridgeY, h.ridgeZ], [rx1, h.ridgeY, h.ridgeZ], [rx1, yN, ez], [rx0, yN, ez]], lit(roof, [0, -0.68, 1]));
    // The rake overhang sits in front of the gable wall, so it must be painted after it.
    const roofNRake = poly([[h.x1, h.ridgeY, h.ridgeZ], [rx1, h.ridgeY, h.ridgeZ], [rx1, yN, ez], [h.x1, yN, ez]], lit(roof, [0, -0.68, 1]));
    const roofS = poly([[rx0, h.ridgeY, h.ridgeZ], [rx1, h.ridgeY, h.ridgeZ], [rx1, yS, ez], [rx0, yS, ez]], lit(roof, [0, 0.68, 1]));
    const t = 0.16;
    const fascia = poly([[rx0, yS, ez], [rx1, yS, ez], [rx1, yS, ez - t], [rx0, yS, ez - t]], shade(roof, 0.55)) +
      poly([[rx1, yN, ez], [rx1, h.ridgeY, h.ridgeZ], [rx1, yS, ez], [rx1, yS, ez - t], [rx1, h.ridgeY, h.ridgeZ - t], [rx1, yN, ez - t]], shade(roof, 0.45));
    // Each window pane gets a second, initially transparent copy that lights up at night.
    const pane = (points, fill) => poly(points, fill, 'class="win"') + poly(points, "#ffd27a", 'class="win-lit"');
    const win = (x0, x1, z0, z1) => poly([[x0 - 0.08, h.y1 + 0.01, z0 - 0.08], [x1 + 0.08, h.y1 + 0.01, z0 - 0.08], [x1 + 0.08, h.y1 + 0.01, z1 + 0.08], [x0 - 0.08, h.y1 + 0.01, z1 + 0.08]], trim) +
      pane([[x0, h.y1 + 0.02, z0], [x1, h.y1 + 0.02, z0], [x1, h.y1 + 0.02, z1], [x0, h.y1 + 0.02, z1]], "#1c2430");
    const winG = (y0, y1, z0, z1) => poly([[h.x1 + 0.01, y0 - 0.08, z0 - 0.08], [h.x1 + 0.01, y1 + 0.08, z0 - 0.08], [h.x1 + 0.01, y1 + 0.08, z1 + 0.08], [h.x1 + 0.01, y0 - 0.08, z1 + 0.08]], shade(trim, 0.85)) +
      pane([[h.x1 + 0.02, y0, z0], [h.x1 + 0.02, y1, z0], [h.x1 + 0.02, y1, z1], [h.x1 + 0.02, y0, z1]], "#161d27");
    const door = poly([[8.5, h.y1 + 0.02, 0.25], [9.3, h.y1 + 0.02, 0.25], [9.3, h.y1 + 0.02, 2.0], [8.5, h.y1 + 0.02, 2.0]], "#5b4636") +
      pane([[8.62, h.y1 + 0.03, 1.4], [9.18, h.y1 + 0.03, 1.4], [9.18, h.y1 + 0.03, 1.85], [8.62, h.y1 + 0.03, 1.85]], "#1c2430") +
      box(8.4, 9.4, 7.0, 7.45, 0, 0.12, "#8d8a85") + box(8.4, 9.4, 7.0, 7.25, 0.12, 0.24, "#9a9792");
    const chimney = box(4.0, 4.5, 3.0, 3.5, 3.6, 5.3, "#8b6f5e");
    const panes = [[3.0, 4.3], [6.6, 7.9]];
    // Connection box on the front wall: every cable enters here.
    const service = box(4.7, 6.25, 6.98, 7.2, 0.45, 1.55, "#c9d0d6") +
      poly([[4.85, 7.21, 1.25], [5.45, 7.21, 1.25], [5.45, 7.21, 1.42], [4.85, 7.21, 1.42]], "#3b4450") +
      `<path d="${pathD([[4.72, 7.21, 0.95], [6.23, 7.21, 0.95]])}" stroke="#9aa3ab" stroke-width=".6"/>` +
      poly([[5.95, 7.21, 1.28], [6.08, 7.21, 1.28], [6.08, 7.21, 1.38], [5.95, 7.21, 1.38]], "#69f0ae", 'class="box-led"');
    const windowDividers = panes.map(([a, b]) => (a + b) / 2).map((x) =>
      `<path d="${pathD([[x, 7.04, 1], [x, 7.04, 2.2]])}" stroke="${trim}" stroke-width="1.2"/>`
    ).join("");
    const siding = [0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7].map((z) =>
      `<path d="${pathD([[2.5, 7.005, z], [10.5, 7.005, z]])}" stroke="#716557" stroke-width=".4" opacity=".2"/>`
    ).join("");
    return roofN + chimney + front + gable + roofNRake + plinth + siding +
      panes.map(([a, b]) => win(a, b, 1.0, 2.2)).join("") + win(9.65, 10.2, 1.0, 2.2) +
      windowDividers + winG(3.5, 4.35, 1.0, 2.2) + door + service + roofS + fascia +
      (o.roof_solar ? ART.roofSolar() : "");
  },

  roofSolar() {
    const h = L.house, yS = h.y1 + 0.4, yN = h.ridgeY, ez = h.wall - 0.4 * ((h.ridgeZ - h.wall) / (h.ridgeY - h.y0));
    const at = (x, v) => [x, yS - (yS - yN) * v, ez + (h.ridgeZ - ez) * v + 0.05];
    let s = "";
    for (const [v0, v1] of [[0.14, 0.5], [0.54, 0.9]]) {
      for (let i = 0; i < 6; i++) {
        const x0 = 3.0 + i * 1.18, x1 = x0 + 1.08;
        s += poly([at(x0, v0), at(x1, v0), at(x1, v1), at(x0, v1)], "url(#ehc-panel)", 'stroke="#9fb3c8" stroke-width="0.5"') +
          poly([at(x0, v0), at(x1, v0), at(x1, v1), at(x0, v1)], "#fff", `class="pv-glint" style="animation-delay:${(i * 0.22 + v0).toFixed(2)}s"`);
        const xm = (x0 + x1) / 2, vm = (v0 + v1) / 2;
        s += `<path d="${pathD([at(xm, v0), at(xm, v1)])} ${pathD([at(x0, vm), at(x1, vm)])}" stroke="#7e95ad" stroke-width="0.35" opacity="0.6" fill="none"/>`;
      }
    }
    return s;
  },

  battery(o = {}) {
    const b = L.battery;
    if (o.style === "rack") {
      let s = groundEllipse((b.x0 + b.x1) / 2 + 0.2, (b.y0 + b.y1) / 2 + 0.2, 0.7, 1.0, "#000", 0.3) + box(b.x0 - 0.05, b.x1 + 0.05, b.y0, b.y1, 0, 2.2, o.color || "#2b3038");
      for (let i = 1; i < 5; i++) s += `<path d="${pathD([[b.x1 + 0.06, b.y0 + 0.1, i * 0.42], [b.x1 + 0.06, b.y1 - 0.1, i * 0.42]])}" stroke="#14171c" stroke-width="1"/>`;
      for (let i = 0; i < 5; i++) s += poly([[b.x1 + 0.07, b.y0 + 0.15, i * 0.42 + 0.15], [b.x1 + 0.07, b.y0 + 0.3, i * 0.42 + 0.15], [b.x1 + 0.07, b.y0 + 0.3, i * 0.42 + 0.25], [b.x1 + 0.07, b.y0 + 0.15, i * 0.42 + 0.25]], "#69f0ae", 'class="led"');
      return s;
    }
    return groundEllipse((b.x0 + b.x1) / 2 + 0.2, (b.y0 + b.y1) / 2 + 0.2, 0.6, 1.0, "#000", 0.3) +
      box(b.x0, b.x1, b.y0, b.y1, 0, 2.4, o.color || "#eceff1") +
      poly([[b.x1 + 0.01, b.y0 + 0.6, 0.45], [b.x1 + 0.01, b.y0 + 0.8, 0.45], [b.x1 + 0.01, b.y0 + 0.8, 2.0], [b.x1 + 0.01, b.y0 + 0.6, 2.0]], "#3a3f47") +
      `<polygon class="soc" fill="${COLORS.battery}" points=""/>`;
  },

  car(o = {}) {
    const c = L.car, color = o.color || "#e9e9e6", glass = "#1a2230";
    const suv = o.style === "suv";
    const len = 4.6, w = c.y1 - c.y0;
    const prof = suv
      ? [[0, 0.28], [0, 1.05], [0.15, 1.25], [0.55, 1.78], [3.1, 1.78], [3.85, 1.2], [4.5, 1.02], [4.6, 0.8], [4.6, 0.28]]
      : [[0, 0.25], [0, 0.85], [0.2, 1.0], [1.05, 1.08], [1.75, 1.5], [3.0, 1.5], [3.75, 1.05], [4.45, 0.92], [4.6, 0.72], [4.6, 0.25]];
    const glassEdges = suv ? [2, 3, 4] : [3, 4, 5];
    const P3 = prof.map(([u, v]) => [u + c.x0, v]);
    const y = c.y1 + 0.01;
    const wheel = (wx) => circleXZ(c.x0 + wx, y + 0.01, 0.36, 0.36, "#111") + circleXZ(c.x0 + wx, y + 0.02, 0.36, 0.2, "#9ea4ab");
    const sideWin = suv
      ? [[0.45, 1.2], [0.7, 1.68], [3.0, 1.68], [3.55, 1.2]]
      : [[1.2, 1.06], [1.8, 1.42], [2.95, 1.42], [3.55, 1.06]];
    const glow = Array.from({ length: 24 }, (_, i) => { const t = (i / 24) * Math.PI * 2; return [c.x0 + len / 2 + Math.cos(t) * (len / 2 + 0.9), c.y0 + w / 2 + Math.sin(t) * (w / 2 + 0.85), 0.01]; });
    return poly(glow, "url(#ehc-charge)", 'class="charge-glow"') +
      groundEllipse(c.x0 + len / 2, c.y0 + w / 2 + 0.15, len / 2 + 0.2, w / 2 + 0.25, "#000", 0.35) +
      prism(P3, "y", c.y0, c.y1, color, (i) => (glassEdges.includes(i) ? glass : null)) +
      poly(sideWin.map(([u, v]) => [c.x0 + u, y + 0.02, v]), glass) +
      `<path d="${pathD([[c.x0 + 2.45, y + 0.03, 1.08], [c.x0 + 2.45, y + 0.03, (suv ? 1.68 : 1.42)]])}" stroke="${shade(color, 0.6)}" stroke-width="1.4"/>` +
      poly([[c.x0 + len + 0.01, c.y0 + 0.15, 0.62], [c.x0 + len + 0.01, c.y0 + 0.45, 0.62], [c.x0 + len + 0.01, c.y0 + 0.45, 0.7], [c.x0 + len + 0.01, c.y0 + 0.15, 0.7]], "#e0f7fa") +
      poly([[c.x0 + len + 0.01, c.y1 - 0.45, 0.62], [c.x0 + len + 0.01, c.y1 - 0.15, 0.62], [c.x0 + len + 0.01, c.y1 - 0.15, 0.7], [c.x0 + len + 0.01, c.y1 - 0.45, 0.7]], "#e0f7fa") +
      wheel(0.95) + wheel(3.65);
  },

  charger() {
    return groundEllipse(0.3, 0.3, 0.35, 0.35, "#000", 0.3) +
      box(-0.05, 0.45, -0.05, 0.45, 0, 0.08, "#8d8a85") +
      box(0.06, 0.34, 0.06, 0.34, 0.08, 1.15, "#e4e8ec") +
      box(0.02, 0.38, 0.02, 0.38, 1.15, 1.6, "#2b3038") +
      poly([[0.1, 0.381, 1.28], [0.3, 0.381, 1.28], [0.3, 0.381, 1.5], [0.1, 0.381, 1.5]], "#1b2a33") +
      poly([[0.13, 0.382, 1.2], [0.27, 0.382, 1.2], [0.27, 0.382, 1.24], [0.13, 0.382, 1.24]], "#69f0ae", 'class="led"') +
      circleYZ(0.345, 0.2, 0.75, 0.11, "#2b3038");
  },

  heatPump() {
    return groundEllipse(0.6, 0.85, 0.7, 0.9, "#000", 0.25) + box(0, 1, 0, 1.5, 0, 1.4, "#d3d9de") +
      circleYZ(1.01, 0.75, 0.75, 0.48, "#252f3b") + fan(P(1.02, 0.75, 0.75));
  },

  groundArray() {
    let panels = box(0.2, 0.3, 0.15, 1.6, 0, 0.7, "#697580") + box(3.5, 3.6, 0.15, 1.6, 0, 0.7, "#697580");
    for (let i = 0; i < 4; i++) {
      const x = i * 0.95;
      const face = [[x, 0, 1.5], [x + 0.9, 0, 1.5], [x + 0.9, 1.8, 0.5], [x, 1.8, 0.5]];
      panels += poly(face, "url(#ehc-panel)", 'stroke="#9fb3c8" stroke-width=".6"') + poly(face, "#fff", `class="pv-glint" style="animation-delay:${(i * 0.22).toFixed(2)}s"`);
    }
    return panels;
  },
};

// Equipment in painter order (back to front). `shift` moves the artwork on the ground plane.
// Each item is shown only when one of its `needs` entities is configured.
const EQUIPMENT = [
  { id: "house", needs: null, shift: [0, 0], draw: (c) => ART.house({ ...c.house, roof_solar: !!c.entities.solar }) },
  { id: "grid", needs: ["grid"], shift: [0, 2.5], draw: () => ART.pole() },
  { id: "car", needs: ["car_power", "car_soc"], shift: [0, 0.9], draw: (c, card) => ART.car({ ...c.car, color: card._carColor() }) },
  { id: "heat_pump", needs: ["heat_pump"], shift: [10.75, 2.1], draw: () => ART.heatPump() },
  { id: "charger", needs: ["car_power", "car_soc"], shift: [6.3, 9.2], draw: () => ART.charger() },
  { id: "battery", needs: ["battery_power", "battery_soc"], shift: [0, 0.6], draw: (c) => ART.battery(c.battery) },
  { id: "solar_ground", needs: ["solar_ground"], shift: [9.0, 10.1], draw: () => ART.groundArray() },
];

// Fixed cable routes, split into runs. A run is painted right after the equipment named in
// `over` (or before all equipment when "ground"), so foreground equipment still covers it.
// Positive readings flow along the points in order; `sign: -1` reverses that.
const G = 0.12;
const CABLES = [
  { id: "grid", entity: "grid", sign: 1, color: COLORS.grid, runs: [
    ["grid", [[0.8, 7.25, 6.3], [0.8, 6.62, 6.3], [0.8, 6.62, G], [0.8, 7.25, G]]],
    ["ground", [[0.8, 7.25, G], [4.85, 7.25, G]]],
    ["house", [[4.85, 7.25, G], [4.85, 7.12, G], [4.85, 7.12, 0.45]]],
  ] },
  { id: "car", entity: "car_power", sign: 1, color: COLORS.car, runs: [
    ["house", [[5.1, 7.12, 0.45], [5.1, 7.12, G], [5.1, 8.45, G]]],
    ["ground", [[5.1, 8.45, G], [6.5, 8.45, G], [6.5, 8.9, G]]],
    ["charger", [[6.5, 9.62, 0.9], [6.5, 9.62, 0.5], [6.15, 9.62, 0.5]]],
    ["car", [[6.15, 9.62, 0.5], [6.15, 10.1, 0.5]]],
  ] },
  { id: "solar_ground", entity: "solar_ground", sign: 1, color: COLORS.solar, runs: [
    ["ground", [[10.9, 9.8, G], [10.9, 8.15, G], [5.35, 8.15, G]]],
    ["house", [[5.35, 8.15, G], [5.35, 7.12, G], [5.35, 7.12, 0.45]]],
  ] },
  { id: "battery", entity: "battery_power", sign: -1, color: COLORS.battery, runs: [
    ["house", [[5.6, 7.12, 0.45], [5.6, 7.12, G], [5.6, 7.85, G]]],
    ["ground", [[5.6, 7.85, G], [12.2, 7.85, G], [12.2, 6.3, G], [11.95, 6.3, G]]],
  ] },
  { id: "heat_pump", entity: "heat_pump", sign: 1, color: COLORS.heat_pump, runs: [
    ["house", [[5.85, 7.12, 0.45], [5.85, 7.12, G], [5.85, 7.55, G]]],
    ["ground", [[5.85, 7.55, G], [11.85, 7.55, G], [11.85, 3.9, G], [11.25, 3.9, G]]],
  ] },
  { id: "solar", entity: "solar", sign: 1, color: COLORS.solar, runs: [
    // Leaves the roof array between its two panel rows, crosses to the gable, runs along the
    // gable wall above the battery and drops down the front corner.
    ["house", [[9.4, 5.89, 3.8], [10.53, 5.89, 3.8], [10.53, 5.89, 2.6], [10.53, 7.03, 2.6], [10.53, 7.03, G]]],
    ["ground", [[10.53, 7.03, G], [10.53, 7.25, G], [6.1, 7.25, G]]],
    ["house", [[6.1, 7.25, G], [6.1, 7.12, G], [6.1, 7.12, 0.45]]],
  ] },
];
// Dash offset at the start of every run, so the dot pattern continues across runs.
for (const cable of CABLES) {
  let travelled = 0;
  cable.runs = cable.runs.map(([over, points]) => {
    const run = { over, points, offset: travelled };
    for (let i = 1; i < points.length; i++) { const a = P(...points[i - 1]), b = P(...points[i]); travelled += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return run;
  });
}

// Badges: fixed positions in % of the picture (left, top) on wide cards; on narrow cards they
// form a row of tiles below the picture in this order (sources first, then consumers).
const BADGES = [
  { id: "solar", label: "Solar", icon: "mdi:solar-power-variant", color: COLORS.solar, pos: [52, 14], power: "solar" },
  { id: "solar_ground", label: "Solar array", icon: "mdi:solar-power-variant", color: COLORS.solar, pos: [66, 90], power: "solar_ground" },
  { id: "grid", label: "Grid", icon: "mdi:transmission-tower", color: COLORS.grid, pos: [16, 20], power: "grid" },
  { id: "battery", label: "Battery", icon: "mdi:battery", color: COLORS.battery, pos: [86, 72], power: "battery_power", soc: "battery_soc" },
  { id: "home", label: "Home", icon: "mdi:home-lightning-bolt", color: COLORS.home, pos: [16, 44], power: "home" },
  { id: "heat_pump", label: "Heat pump", icon: "mdi:heat-pump", color: COLORS.heat_pump, pos: [87, 40], power: "heat_pump" },
  { id: "car", label: "Car", icon: "mdi:car-electric", color: COLORS.car, pos: [22, 86], power: "car_power", soc: "car_soc" },
];
// Direction words and arrows for positive / negative readings (same arrows as Home Assistant's
// energy card: grid → import ← export; storage ↓ in ↑ out).
const STATUS = {
  grid: ["Import", "Export", "→", "←"],
  battery: ["Discharging", "Charging", "↑", "↓"],
  car: ["Charging", "Discharging", "↓", "↑"],
};

const POWER_KEYS = ["grid", "solar", "solar_ground", "home", "battery_power", "car_power", "heat_pump"];
const ENTITY_KEYS = [...POWER_KEYS, "battery_soc", "car_soc", "sun", "weather"];
const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

const compactRules = (scope) => `
  ${scope} .badges { position:static; aspect-ratio:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); gap:6px; padding:2px 12px 12px; }
  ${scope} .badge { position:static; transform:none; max-width:none; width:auto; font-size:13px; box-shadow:none; background:rgba(255,255,255,.04); border-radius:12px; padding:.5em .7em; align-items:flex-start; }
  ${scope} .badge .ic { width:auto; height:auto; background:none; margin-top:.15em; }
  ${scope} .badge .ic ha-icon { --mdc-icon-size:18px; }
  ${scope} .badge .v { font-size:1.2em; }
  ${scope} .badge .l { font-size:.85em; }`;

const STYLE = `
:host { display:block; }
ha-card { display:block; overflow:hidden; position:relative; border-radius:var(--ha-card-border-radius,16px); background: var(--ehc-bg, linear-gradient(160deg,#1c2230 0%,#191a26 55%,#2a1730 100%)); color:#eef1f6; }
ha-card.night { --ehc-bg: linear-gradient(160deg,#121521 0%,#15111d 55%,#2b1230 100%); --lit:.95; }
ha-card.themed { --ehc-bg: var(--ha-card-background, var(--card-background-color)); color: var(--primary-text-color); }
.hdr { display:flex; align-items:center; gap:8px; padding:14px 16px 0; font-size:1.15em; font-weight:500; position:relative; z-index:2; }
.hdr ha-icon { --mdc-icon-size:20px; }
ha-card { container: ehc / inline-size; }
.wrap { position:relative; }
.stage { position:relative; width:100%; aspect-ratio:${VB_W}/${VB_H}; }
.stage > svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
.win-lit { opacity:var(--lit,.3); transition:opacity 2s; }
.night-ov { fill:#0b1030; opacity:0; transition:opacity 2s; pointer-events:none; }
ha-card.night .night-ov { opacity:.35; }
ha-card.night .hdr { background:rgba(11,16,48,.35); }
.flow .base { fill:none; stroke-width:1.6; opacity:.16; stroke-linejoin:round; stroke-linecap:round; transition:opacity .6s; }
.flow .glow { fill:none; stroke-width:7; opacity:0; stroke-linejoin:round; stroke-linecap:round; transition:opacity .6s; }
.flow .dots { fill:none; stroke:#fff; stroke-width:2.4; stroke-linecap:round; stroke-dasharray:0.1 11; stroke-dashoffset:var(--o,0px); opacity:0; animation:ehc-move var(--dur,1.5s) linear infinite; animation-play-state:paused; }
.flow.on .base { opacity:.95; }
.flow.on .glow { opacity:.22; }
.flow.on .dots { opacity:.9; animation-play-state:running; }
.flow.rev .dots { animation-direction:reverse; }
@keyframes ehc-move { from { stroke-dashoffset:var(--o,0px); } to { stroke-dashoffset:calc(var(--o,0px) - 22.2px); } }
.led, .box-led { opacity:.35; }
.active .led, .active .box-led { opacity:1; animation:ehc-blink 1.8s ease-in-out infinite; }
.charge-glow { opacity:0; transition:opacity .8s; }
.charging .charge-glow { opacity:.55; animation:ehc-breathe 2.6s ease-in-out infinite; }
.active .soc { animation:ehc-soc 2.4s ease-in-out infinite; }
.fan { transform-box:fill-box; transform-origin:center; }
.active .fan { animation:ehc-spin 1.1s linear infinite; }
.pv-glint { opacity:0; pointer-events:none; }
.solar-on .pv-glint { animation:ehc-glint 5s ease-in-out infinite; }
@keyframes ehc-blink { 50% { opacity:.45; } }
@keyframes ehc-breathe { 0%,100% { opacity:.55; } 50% { opacity:.22; } }
@keyframes ehc-soc { 50% { opacity:.7; } }
@keyframes ehc-spin { to { transform:rotate(360deg); } }
@keyframes ehc-glint { 0%,62%,100% { opacity:0; } 72% { opacity:.16; } }
.badges { position:absolute; inset:0 0 auto; aspect-ratio:${VB_W}/${VB_H}; pointer-events:none; }
.badge { position:absolute; transform:translate(-50%,-50%); display:flex; align-items:center; gap:.5em; padding:.45em .8em .45em .45em; max-width:30%; box-sizing:border-box;
  border-radius:14px; background:rgba(20,22,30,.9); border:1px solid rgba(255,255,255,.06); cursor:pointer; pointer-events:auto;
  width:max-content; font-size:clamp(12px,2.1cqw,15px); line-height:1.25; box-shadow:0 4px 14px rgba(0,0,0,.3); color:#eef1f6; transition:border-color .6s; }
.badge:focus-visible { outline:2px solid var(--c); outline-offset:2px; }
.badge.on { border-color: color-mix(in srgb, var(--c) 60%, transparent); }
.badge .ic { flex-shrink:0; width:1.9em; height:1.9em; border-radius:50%; display:grid; place-items:center; background:color-mix(in srgb, var(--c) 18%, transparent); color:var(--c); }
.badge .ic ha-icon { --mdc-icon-size:1.25em; }
.badge .copy { min-width:0; }
.badge .v { font-weight:700; font-size:1.25em; white-space:nowrap; font-variant-numeric:tabular-nums; }
.badge .l { font-size:.92em; opacity:.7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.badge .s { font-size:.92em; color:var(--c); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.badge .s:empty { display:none; }
/* Compact layout: the picture stays an illustration, the numbers move into readable tiles below it.
   'auto' switches to it on cards up to 500 px wide; 'compact' always uses it, 'wide' never. */
@container ehc (max-width: 500px) { ${compactRules(".layout-auto")} }
${compactRules(".layout-compact")}
.drops { position:absolute; inset:0; pointer-events:none; overflow:hidden; display:none; }
ha-card.rain .drops { display:block; }
.drops i { position:absolute; top:-10%; width:1px; height:5%; background:linear-gradient(transparent, rgba(200,210,255,.45)); animation:ehc-rain linear infinite; }
ha-card.snow .drops i { width:3px; height:3px; border-radius:50%; background:rgba(255,255,255,.7); }
@keyframes ehc-rain { to { transform:translate(-4cqw, 115cqw); } }
.still * { animation:none !important; }
.paused * { animation-play-state:paused !important; }
@media (prefers-reduced-motion: reduce) { ha-card * { animation:none !important; } }
`;

const DEFAULTS = { title: "Energy", layout: "auto", threshold: 10, animate: true, theme_background: false, weather_effects: false };
const LAYOUTS = ["auto", "wide", "compact"];

function normalizeConfig(config) {
  const fail = (message) => { throw new Error(`energy-house-card: ${message}`); };
  const object = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (!object(config)) fail("Configuration must be an object");
  if (config.entities != null && !object(config.entities)) fail("'entities' must be a mapping");
  const entities = { ...(config.entities || {}) };
  for (const [key, id] of Object.entries(entities)) {
    if (!ENTITY_KEYS.includes(key)) fail(`Unknown entity '${key}'. Allowed: ${ENTITY_KEYS.join(", ")}`);
    if (id != null && id !== "" && (typeof id !== "string" || !ENTITY_ID.test(id))) fail(`Invalid entity ID for '${key}'`);
    if (!id) delete entities[key];
  }
  entities.sun ??= "sun.sun";
  if (config.threshold != null && (typeof config.threshold !== "number" || !Number.isFinite(config.threshold) || config.threshold < 0)) fail("'threshold' must be a non-negative number");
  if (config.title != null && typeof config.title !== "string") fail("'title' must be text");
  if (config.layout != null && !LAYOUTS.includes(config.layout)) fail("'layout' must be 'auto', 'wide' or 'compact'");
  for (const key of ["animate", "night", "theme_background", "weather_effects"]) {
    if (config[key] != null && typeof config[key] !== "boolean") fail(`'${key}' must be true or false`);
  }
  for (const key of ["car", "battery", "house", "invert"]) {
    if (config[key] != null && !object(config[key])) fail(`'${key}' must be a mapping`);
  }
  const invert = { ...(config.invert || {}) };
  for (const [key, value] of Object.entries(invert)) {
    if (!POWER_KEYS.includes(key) || typeof value !== "boolean") fail(`invert.${key} must be a boolean for a power entity`);
  }
  const car = { ...(config.car || {}) }, battery = { ...(config.battery || {}) }, house = { ...(config.house || {}) };
  for (const [name, part, fields] of [["car", car, ["color"]], ["battery", battery, ["color"]], ["house", house, ["wall_color", "roof_color"]]]) {
    for (const field of fields) if (part[field] != null && part[field] !== "" && (typeof part[field] !== "string" || !HEX.test(part[field]))) fail(`${name}.${field} must be a hex color like #d9cbb3`);
  }
  if (car.style != null && !["sedan", "suv"].includes(car.style)) fail("car.style must be 'sedan' or 'suv'");
  if (battery.style != null && !["wall", "rack"].includes(battery.style)) fail("battery.style must be 'wall' or 'rack'");
  if (car.name != null && typeof car.name !== "string") fail("car.name must be text");
  if (car.color_entity != null && (typeof car.color_entity !== "string" || !ENTITY_ID.test(car.color_entity))) fail("Invalid car.color_entity");
  return { ...DEFAULTS, ...config, entities, invert, car, battery, house };
}

const sensor = { entity: { domain: "sensor" } };
const CONFIG_FORM = {
  schema: [
    { name: "title", selector: { text: {} } },
    { type: "expandable", name: "entities", title: "Sensors", expanded: true, schema: [
      { type: "grid", name: "", flatten: true, schema: [
        { name: "grid", selector: sensor }, { name: "home", selector: sensor },
        { name: "solar", selector: sensor }, { name: "solar_ground", selector: sensor },
        { name: "battery_power", selector: sensor }, { name: "battery_soc", selector: sensor },
        { name: "car_power", selector: sensor }, { name: "car_soc", selector: sensor },
        { name: "heat_pump", selector: sensor }, { name: "weather", selector: { entity: { domain: "weather" } } },
      ] },
    ] },
    { type: "expandable", name: "invert", title: "Invert sign", schema: [
      { type: "grid", name: "", flatten: true, schema: [
        { name: "grid", selector: { boolean: {} } }, { name: "battery_power", selector: { boolean: {} } }, { name: "car_power", selector: { boolean: {} } },
      ] },
    ] },
    { type: "expandable", name: "car", title: "Car", schema: [
      { type: "grid", name: "", flatten: true, schema: [
        { name: "name", selector: { text: {} } },
        { name: "style", selector: { select: { mode: "dropdown", options: [{ value: "sedan", label: "Sedan" }, { value: "suv", label: "SUV" }] } } },
        { name: "color", selector: { text: {} } },
        { name: "color_entity", selector: { entity: {} } },
      ] },
    ] },
    { type: "expandable", name: "battery", title: "Battery", schema: [
      { type: "grid", name: "", flatten: true, schema: [
        { name: "style", selector: { select: { mode: "dropdown", options: [{ value: "wall", label: "Wall unit" }, { value: "rack", label: "Rack" }] } } },
        { name: "color", selector: { text: {} } },
      ] },
    ] },
    { type: "expandable", name: "house", title: "House", schema: [
      { type: "grid", name: "", flatten: true, schema: [
        { name: "wall_color", selector: { text: {} } }, { name: "roof_color", selector: { text: {} } },
      ] },
    ] },
    { type: "expandable", name: "", flatten: true, title: "Display", schema: [
      { name: "layout", selector: { select: { mode: "dropdown", options: [
        { value: "auto", label: "Automatic (by card width)" }, { value: "wide", label: "Wide: readings on the picture" }, { value: "compact", label: "Compact: readings below the picture" },
      ] } } },
      { name: "threshold", selector: { number: { min: 0, max: 1000, step: 1, mode: "box", unit_of_measurement: "W" } } },
      { type: "grid", name: "", flatten: true, schema: [
        { name: "animate", selector: { boolean: {} } }, { name: "theme_background", selector: { boolean: {} } },
        { name: "weather_effects", selector: { boolean: {} } },
      ] },
    ] },
  ],
  computeLabel: (s) => ({
    title: "Title", grid: "Grid power (+ import / − export)", home: "Home consumption", solar: "Roof solar power",
    solar_ground: "Ground array power", battery_power: "Battery power (+ discharge / − charge)", battery_soc: "Battery level (%)",
    car_power: "Car charging power", car_soc: "Car battery level (%)", heat_pump: "Heat pump power", name: "Name", style: "Style",
    color: "Color (hex)", color_entity: "Color from entity", wall_color: "Wall color (hex)", roof_color: "Roof color (hex)",
    threshold: "Active above", layout: "Layout", animate: "Animations", theme_background: "Use theme background", weather_effects: "Rain/snow effect",
    weather: "Weather entity",
  })[s.name],
  assertConfig: (config) => normalizeConfig(config),
};

class EnergyHouseCard extends HTMLElement {
  static getConfigForm() { return CONFIG_FORM; }

  // Card picker: pre-fill with the user's most likely sensors instead of fake IDs.
  static getStubConfig(hass) {
    const states = hass?.states || {};
    const pick = (pattern, deviceClass) => Object.keys(states).find((id) =>
      id.startsWith("sensor.") && pattern.test(id) && states[id].attributes?.device_class === deviceClass);
    const entities = {
      grid: pick(/grid/, "power"), solar: pick(/solar|pv/, "power"), home: pick(/home|house|load|consumption/, "power"),
      battery_power: pick(/battery/, "power"), battery_soc: pick(/battery/, "battery"),
    };
    return { entities: Object.fromEntries(Object.entries(entities).filter(([, id]) => id)) };
  }

  // Masonry estimate in 50 px units: the picture plus, on narrow cards, the tiles below it.
  getCardSize() { return 9; }
  // No `rows`: in sections view the card takes the height of its content, which grows when
  // narrow cards move the readings below the picture.
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  connectedCallback() {
    if (!this._observer && typeof IntersectionObserver !== "undefined") {
      this._observer = new IntersectionObserver(([entry]) => {
        this._visible = entry.isIntersecting;
        this._card?.classList.toggle("paused", !entry.isIntersecting);
      });
    }
    this._observer?.observe(this);
  }
  disconnectedCallback() {
    this._visible = false;
    this._observer?.disconnect();
    this._card?.classList.add("paused");
  }

  setConfig(config) {
    this._cfg = normalizeConfig(config);
    this._sceneKey = null;
    this._sig = null;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
    const ids = [...Object.values(this._cfg.entities), this._cfg.car.color_entity];
    const sig = JSON.stringify(ids.map((id) => { const s = id && hass.states[id]; return s ? [s.state, s.attributes.unit_of_measurement] : null; }));
    if (sig === this._sig) return; // nothing relevant changed
    this._sig = sig;
    this._update();
  }

  // ----- readings -----
  _has(...keys) { return keys.some((key) => this._cfg.entities[key]); }
  _read(key) {
    const id = this._cfg.entities[key], state = id && this._hass?.states[id];
    if (!state || typeof state.state !== "string" || !state.state.trim()) return null;
    let value = Number(state.state);
    if (!Number.isFinite(value)) return null;
    const unit = (state.attributes.unit_of_measurement || "").trim().toLowerCase();
    if (key.endsWith("_soc")) return (unit === "" || unit === "%") && value >= 0 && value <= 100 ? value : null;
    if (unit === "kw") value *= 1000;
    else if (unit === "mw") value *= 1e6;
    else if (unit !== "" && unit !== "w") return null;
    return this._cfg.invert[key] ? -value : value;
  }
  _fmtW(w) { const a = Math.abs(w); return a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 1 : 2)} kW` : `${Math.round(a)} W`; }
  _carColor() {
    const c = this._cfg.car;
    if (c.color) return c.color;
    const s = c.color_entity && this._hass?.states[c.color_entity];
    if (s) { const k = s.state.toLowerCase().replace(/[^a-z]/g, ""); if (TESLA_COLORS[k]) return TESLA_COLORS[k]; if (/^#?[0-9a-f]{6}$/i.test(s.state)) return s.state.startsWith("#") ? s.state : "#" + s.state; }
    return "#e9e9e6";
  }

  // ----- one-time scene render (only on config or car-color change) -----
  _render() {
    const c = this._cfg;
    const flow = (cable, run) => {
      const d = pathD(run.points);
      return `<g class="flow" data-cable="${cable.id}" style="--o:${(run.offset % 11.1).toFixed(2)}px"><path class="glow" d="${d}" stroke="${cable.color}"/><path class="base" d="${d}" stroke="${cable.color}"/><path class="dots" d="${d}"/></g>`;
    };
    const cables = CABLES.filter((cable) => this._has(cable.entity));
    const runsOver = (over) => cables.flatMap((cable) => cable.runs.filter((run) => run.over === over).map((run) => flow(cable, run))).join("");
    const equipment = EQUIPMENT.map((eq) => {
      const shown = !eq.needs || this._has(...eq.needs);
      const [dx, dy] = eq.shift;
      const art = shown ? `<g class="equipment" id="eq-${eq.id}" transform="translate(${((dx - dy) * C30 * S).toFixed(1)} ${((dx + dy) * S * 0.5).toFixed(1)})">${eq.draw(c, this)}</g>` : "";
      return art + runsOver(eq.id);
    }).join("");
    const badges = BADGES.filter((b) => this._has(b.power, b.soc)).map((b) => {
      const entity = c.entities[b.soc] || c.entities[b.power];
      const label = b.id === "car" && c.car.name ? c.car.name : b.label;
      return `<div class="badge" id="b-${b.id}" data-entity="${escapeHTML(entity)}" role="button" tabindex="0" style="left:${b.pos[0]}%;top:${b.pos[1]}%;--c:${b.color}"><div class="ic"><ha-icon icon="${b.icon}"></ha-icon></div><div class="copy"><div class="v">—</div><div class="l">${escapeHTML(label)}</div><div class="s"></div></div></div>`;
    }).join("");
    const drops = c.weather_effects ? `<div class="drops">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100 + 4}%;animation-duration:${0.7 + ((i * 13) % 7) / 10}s;animation-delay:-${((i * 7) % 10) / 10}s"></i>`).join("")}</div>` : "";
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card class="layout-${c.layout} ${c.theme_background ? "themed" : ""} ${c.animate ? "" : "still"} ${this._visible === false ? "paused" : ""}">
        ${c.title ? `<div class="hdr"><ha-icon icon="mdi:lightning-bolt"></ha-icon><span>${escapeHTML(c.title)}</span></div>` : ""}
        <div class="wrap"><div class="stage">
          <svg viewBox="0 0 ${VB_W} ${VB_H}" aria-hidden="true">
            <defs><linearGradient id="ehc-panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a5d86"/><stop offset=".55" stop-color="#1b2f4d"/><stop offset="1" stop-color="#11203a"/></linearGradient><radialGradient id="ehc-charge"><stop offset="0" stop-color="#69f0ae" stop-opacity=".85"/><stop offset=".55" stop-color="#69f0ae" stop-opacity=".35"/><stop offset="1" stop-color="#69f0ae" stop-opacity="0"/></radialGradient></defs>
            <g class="scene">${ART.ground()}${runsOver("ground")}${equipment}</g>
            <rect class="night-ov" width="${VB_W}" height="${VB_H}"/>
          </svg>${drops}
        </div><div class="badges">${badges}</div></div>
      </ha-card>`;
    this._card = this.shadowRoot.querySelector("ha-card");
    const open = (event) => {
      const badge = event.target.closest?.(".badge");
      if (!badge || (event.type === "keydown" && event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: badge.dataset.entity } }));
    };
    this._card.addEventListener("click", open);
    this._card.addEventListener("keydown", open);
  }

  _toggle(id, cls, on) { this.shadowRoot.getElementById(`eq-${id}`)?.classList.toggle(cls, on); }

  _setFlow(id, power) {
    const on = power != null && Math.abs(power) > this._cfg.threshold;
    for (const g of this.shadowRoot.querySelectorAll(`[data-cable="${id}"]`)) {
      g.classList.toggle("on", on);
      g.classList.toggle("rev", on && power < 0);
      if (on) g.style.setProperty("--dur", `${Math.min(3, Math.max(0.45, 3.2 - 0.7 * Math.log10(Math.abs(power)))).toFixed(2)}s`);
    }
    return on;
  }

  _setBadge(b, power, soc) {
    const el = this.shadowRoot.getElementById(`b-${b.id}`);
    if (!el) return;
    const active = power != null && Math.abs(power) > this._cfg.threshold;
    const [positive, negative, up, down] = STATUS[b.id] || [];
    const status = power == null ? (this._has(b.power) ? "Unavailable" : "") :
      !active ? (positive ? "Idle" : "") : positive ? (power > 0 ? positive : negative) : "";
    const level = soc == null ? "" : `${Math.round(soc)} %`;
    // The big number is always power (with a direction arrow); the level is secondary.
    const arrow = active && up ? `${power > 0 ? up : down} ` : "";
    const value = power != null ? arrow + this._fmtW(power) : level || "—";
    const detail = [power != null ? level : "", status].filter(Boolean).join(" · ");
    el.classList.toggle("on", active);
    el.querySelector(".v").textContent = value;
    el.querySelector(".s").textContent = detail;
    el.title = [value, el.querySelector(".l").textContent, detail].filter(Boolean).join(" · ");
    if (b.id === "battery") {
      const level = soc == null ? null : Math.max(0, Math.min(100, Math.round(soc / 10) * 10));
      const charging = active && power < 0;
      const icon = level == null ? "mdi:battery" : charging ? `mdi:battery-charging${level === 0 ? "-outline" : level === 100 ? "-100" : "-" + level}` :
        level === 100 ? "mdi:battery" : level === 0 ? "mdi:battery-outline" : `mdi:battery-${level}`;
      el.querySelector("ha-icon").setAttribute("icon", icon);
    }
  }

  _update() {
    if (!this._cfg) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const key = JSON.stringify(this._cfg) + this._carColor();
    if (key !== this._sceneKey) { this._sceneKey = key; this._render(); }
    const c = this._cfg, th = c.threshold, card = this._card;

    const sun = c.entities.sun && this._hass?.states[c.entities.sun];
    card.classList.toggle("night", c.night ?? (sun ? sun.state === "below_horizon" : false));
    const weather = (c.entities.weather && this._hass?.states[c.entities.weather]?.state) || "";
    card.classList.toggle("rain", c.weather_effects && /rain|pouring|snow/.test(weather));
    card.classList.toggle("snow", /snow/.test(weather));

    const r = Object.fromEntries(ENTITY_KEYS.map((k) => [k, this._read(k)]));
    let any = false;
    for (const cable of CABLES) if (this._has(cable.entity)) any = this._setFlow(cable.id, r[cable.entity] == null ? null : cable.sign * r[cable.entity]) || any;
    for (const b of BADGES) this._setBadge(b, r[b.power], b.soc ? r[b.soc] : null);

    const above = (v) => v != null && v > th, busy = (v) => v != null && Math.abs(v) > th;
    this._toggle("house", "active", any);
    this._toggle("house", "solar-on", above(r.solar));
    this._toggle("solar_ground", "solar-on", above(r.solar_ground));
    this._toggle("heat_pump", "active", above(r.heat_pump));
    this._toggle("battery", "active", busy(r.battery_power));
    this._toggle("charger", "active", busy(r.car_power));
    this._toggle("car", "charging", above(r.car_power));
    const bar = this.shadowRoot.querySelector("#eq-battery .soc");
    if (bar) {
      const soc = r.battery_soc;
      bar.setAttribute("visibility", soc == null ? "hidden" : "visible");
      if (soc != null) {
        const b = L.battery, z = 0.45 + 1.55 * soc / 100;
        bar.setAttribute("points", pts([[b.x1 + 0.02, b.y0 + 0.6, 0.45], [b.x1 + 0.02, b.y0 + 0.8, 0.45], [b.x1 + 0.02, b.y0 + 0.8, z], [b.x1 + 0.02, b.y0 + 0.6, z]]));
      }
    }
  }
}

if (!customElements.get("energy-house-card")) {
  customElements.define("energy-house-card", EnergyHouseCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "energy-house-card", name: "Energy House Card", preview: true,
    description: "Isometric house with animated energy flows: solar, grid, battery, heat pump and EV.",
    documentationURL: "https://github.com/Fexiven/homeassistant-energy-house-card",
  });
  console.info(`%c ENERGY-HOUSE-CARD %c v${VERSION} `, "background:#ffb74d;color:#000;font-weight:700", "background:#222;color:#fff");
}
})();
