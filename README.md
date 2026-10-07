<div align="center">

# 🐸 Froggy Road 3D

**High-performance 3D isometric arcade hopper built with Three.js, procedural endless world generation, dynamic diurnal lighting cycles, and a custom Web Audio API synthesis engine.**

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Three.js](https://img.shields.io/badge/Three.js-r128-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![WebGL](https://img.shields.io/badge/WebGL-2.0-990000?style=flat-square&logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-Synthesizer-4CAF50?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![HTML5 / CSS3](https://img.shields.io/badge/HTML5_/_CSS3-Responsive-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-222222?style=flat-square&logo=githubpages&logoColor=white)](https://adiletbtrv.github.io/froggy-road/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

**[Game Showcase](#-game-showcase)** • **[Engineering Highlights](#-key-architectural--engineering-highlights)** • **[System Architecture](#-system-architecture)** • **[Tech Stack](#-tech-stack)** • **[Project Structure](#-project-structure)** • **[Game Mechanics & Rules](#-game-mechanics--rules)** • **[Controls & Input](#-controls--input-schemes)** • **[Getting Started](#-getting-started)** • **[Performance & Optimizations](#-performance--optimizations)** • **[License & Author](#-license--author)**

</div>

---

## 🎮 Game Showcase

<div align="center">
  <table border="0">
    <tr>
      <td align="center">
        <b>Procedural Endless World</b><br />
        <sub>Infinite pseudo-random terrain generation across grass, road, and river biomes with adaptive spacing and obstacle distribution.</sub>
      </td>
      <td align="center">
        <b>Dynamic Day/Night Cycle</b><br />
        <sub>120-second continuous cycle interpolating skybox gradients, distance fog, directional sunlight, and starfield particle opacity.</sub>
      </td>
      <td align="center">
        <b>Real-Time Audio Synthesis</b><br />
        <sub>Zero audio asset overhead. 100% synthesized SFX and 130 BPM polyphonic chiptune soundtrack via Web Audio API.</sub>
      </td>
    </tr>
    <tr>
      <td align="center">
        <b>Squash & Stretch Physics</b><br />
        <sub>Non-linear sine-interpolated hop arcs with procedural body deformation, landing recovery, and pinned ground blob shadows.</sub>
      </td>
      <td align="center">
        <b>Exploit-Proof Combo System</b><br />
        <sub>Distance-progress-gated combo multiplier mathematically preventing lateral hop farming and backward grinding.</sub>
      </td>
      <td align="center">
        <b>Universal Responsive Controls</b><br />
        <sub>Desktop keyboard inputs (WASD / Arrows), gesture-based touch swipe tracking, and an adaptive on-screen mobile D-Pad.</sub>
      </td>
    </tr>
  </table>
</div>

---

## ⚡ Key Architectural & Engineering Highlights

### 1. Zero-Clone Material Batching & Geometric Edge Fade (`game.js`)
To maintain steady 60+ FPS on resource-constrained mobile browsers without garbage collection pauses:
* **Centralized Material & Geometry Pools:** All game entities (vehicles, logs, trees, rocks, ground tiles) draw directly from static pools (`M{}` and `G{}`). No material instances are cloned during lane generation or entity spawning.
* **Geometric Edge Clipping:** Rather than updating per-object alpha opacity (which forces expensive shader switches and disables depth write sorting), off-screen wrapping and boundary transitions utilize geometric fading:
  $$s_y = \max\left(0.001,\, f\right), \quad y_{\text{pos}} = -(1 - f) \cdot 0.5$$
  where $f \in [0, 1]$ measures distance relative to the boundary fade zone:
  $$f = \text{clamp}\left(1 - \frac{|x| - (w_{\max} - d_{\text{fade}})}{d_{\text{fade}}},\, 0,\, 1\right)$$
  Vehicles and logs cleanly sink and compress into the road plane as they reach grid edges, allowing Three.js to batch render calls with zero per-frame material mutations.

### 2. Lookahead Audio Scheduler & Pure Web Audio Synthesis (`audio.js`)
The entire audio landscape operates with zero external sound file dependencies (0 KB audio payload):
* **Lookahead Scheduler:** A RequestAnimationFrame-driven scheduling loop monitors the hardware audio timeline:
  $$t_{\text{next}} < t_{\text{curr}} + 0.2\text{ s}$$
  Scheduling events in tight lookahead windows eliminates timing drift caused by main-thread animation hitches or tab throttling.
* **Dual-Channel Chiptune Synthesis:** The background soundtrack executes a 130 BPM tempo with an 8-step bassline (triangle wave) and a 16-step melody line (square wave), shaped through custom envelopes featuring 10 ms linear attack ramps and exponential release decay:
  $$g(t) = g_{\max} \cdot e^{-\alpha(t - t_0)}$$
* **Procedural Sound Effects:** Custom synthesizer pipelines produce jumping pops (frequency sweeps from 420 Hz to 860 Hz), score chimes, mushroom collection dual-sine arpeggios, white noise vehicular collision bursts, and bandpass-filtered water splashes ($f_c = 900\text{ Hz},\, Q = 0.6$).

### 3. Piecewise Keyframe Diurnal Cycle & Progressive Danger Shading (`game.js`)
Atmospheric lighting transitions smoothly across a 120-second continuous cycle governed by 7 canonical astronomical keyframes:
* **Atmospheric Interpolation:** Parameters for sky color, fog density, ambient lighting, directional sun warmth, and night starfield visibility are calculated via piecewise linear interpolation between active keyframes:
  $$V(t) = V_a + (V_b - V_a) \cdot \frac{t - t_a}{t_b - t_a}$$
* **Headlight Additive Projection:** Nighttime triggers vehicle headlights with flat road-surface glow planes configured with `THREE.AdditiveBlending` and active emissive lamps without heavy real-time dynamic spot-lighting calculations.
* **Progressive Difficulty Matrix:** Deep progression scales lane difficulty and shifts the ambient horizon towards a crimson alert gradient:
  $$\text{danger} = \max\left(0,\, \frac{\text{diff}(z) - 0.6}{0.4}\right), \quad \text{diff}(z) = \min\left(\frac{z}{60},\, 1\right)$$

### 4. Exploit-Proof Combo Architecture & Sine Jump Physics (`game.js`)
* **Strict Distance Progression Gate:** Score and combo increments require breaking new ground ($z > z_{\max}$) within a 1000 ms hop window:
  ```javascript
  const isNewGround = this.gz > this.maxZ;
  if (isNewGround && now - this.lastJumpTime < 1000) {
      this.combo++;
  } else if (isNewGround) {
      this.combo = 1;
  } else {
      this.combo = 0; // Lateral hops & backtracking immediately invalidate combo
  }
  ```
  This renders infinite score farming via side-to-side hopping or backward retreats mathematically impossible.
* **Squash-and-Stretch Kinematics:** Parabolic hop trajectories evaluate smooth sine easing over jump duration ($\tau = 120\text{ ms}$):
  $$y(t) = y_{\text{rest}} + \sin(\pi t) \cdot H_{\text{jump}}$$
  Synchronized scale deformation dynamically elongates the model along the jump vector during apex flight and compresses it upon landing:
  $$S(t) = \left(1 - 0.13\sin(\pi t),\, 1 + 0.32\sin(\pi t),\, 1 - 0.13\sin(\pi t)\right)$$

---

## 🏛 System Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               FROGGY ROAD ENGINE                                  │
│                 (Three.js r128 / WebGL Orthographic Isometric View)               │
└────────────────────────────────────────┬──────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴────────────────────────────────────────┐
 │                              VIEWPORT & UI LAYER                               │
 │  ┌──────────────────────────────────────────────────────────────────────────┐  │
 │  │ DOM HUD Overlay: Real-time Score, Floating Combo Toast, Mute Toggle      │  │
 │  ├──────────────────────────────────────────────────────────────────────────┤  │
 │  │ Responsive Canvas Viewport: Aspect-Ratio Clamped Orthographic Frustum    │  │
 │  ├──────────────────────────────────────────────────────────────────────────┤  │
 │  │ Overlay Dialogs: Main Menu Start, High Score Banner, Game Over Card      │  │
 │  └──────────────────────────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────┬────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴────────────────────────────────────────┐
 │                            CORE SIMULATION ENGINE                              │
 │  ┌─────────────────────────────────────┐  ┌─────────────────────────────────┐  │
 │  │       Game Loop & State Machine     │  │       World & Lane Generator    │  │
 │  │  • requestAnimationFrame (dt clamp) │  │  • Biome Selector (Grass/Road)  │  │
 │  │  • State: 'menu' | 'play' | 'over'  │  │  • Obstacle & Pickup Spawner    │  │
 │  │  • Orthographic Camera Follow Z     │  │  • Frustum Culled Lane Purging  │  │
 │  └──────────────────┬──────────────────┘  └────────────────┬────────────────┘  │
 │                     │                                      │                   │
 │                     └───────────────────┬──────────────────┘                   │
 │                                         │                                      │
 │                       ┌─────────────────┴─────────────────┐                    │
 │                       │     Collision & Physics System    │                    │
 │                       │  • AABB Voxel Overlap Detection   │                    │
 │                       │  • River Log Drift Coupling       │                    │
 │                       │  • Sine Hop Arc & Scale Deform    │                    │
 │                       └─────────────────┬─────────────────┘                    │
 └─────────────────────────────────────────┼──────────────────────────────────────┘
                                           │
 ┌─────────────────────────────────────────┴────────────────────────────────────────┐
 │                          AUDIO & INPUT SUBSYSTEMS                                │
 │  ┌────────────────────────────────────────┐ ┌───────────────────────────────┐ │
 │  │        Web Audio API Synthesizer       │ │      Multi-Modal Input Engine  │ │
 │  │  • Lookahead RAF Audio Scheduler       │ │  • Keyboard (WASD / Arrows)    │ │
 │  │  • Dual-channel Chiptune Music Stream  │ │  • Touch Swipe Delta Tracker   │ │
 │  │  • Dynamic SFX Synthesis (No Assets)   │ │  • On-Screen Mobile D-Pad      │ │
 │  └────────────────────────────────────────┘ └───────────────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer / Domain | Technologies & Libraries | Version | Description & Purpose |
| :--- | :--- | :--- | :--- |
| **3D Rendering Engine** | **Three.js** | `r128` | WebGL scene graph, shadow mapping, lighting, materials, geometries |
| **Projection Model** | **OrthographicCamera** | *Native* | Parallax-free isometric projection with dynamic aspect-ratio clamping |
| **Audio Synthesis** | **Web Audio API** | *Native* | Real-time chiptune music synthesis and algorithmic sound effects |
| **Core Language** | **Vanilla JavaScript** | `ES6+` | Object-oriented game loop, state management, procedural generation |
| **Styling & Typography** | **CSS3 & Google Fonts** | *Fredoka, Nunito* | Responsive arcade HUD, glassmorphism overlays, touch D-Pad controls |
| **Storage & Persistence**| **Web Storage API** | *Native* | High score persistence via `localStorage` |
| **Deployment & CI/CD** | **GitHub Actions & Pages** | `v4` | Automated deployment workflow to GitHub Pages on push to `main` |

---

## 📁 Project Structure

```
froggy-road/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Automated GitHub Pages CI/CD deployment workflow
├── audio.js                    # Web Audio API engine: lookahead scheduler & SFX synthesis
├── game.js                     # Core game logic: Three.js renderer, world gen, hop physics
├── index.html                  # Main application entry point, DOM overlays, script tags
├── style.css                   # Responsive layout styling, arcade typography, HUD themes
├── .gitignore                  # Git tracking exclusion list
├── LICENSE                     # MIT License
└── README.md                   # Comprehensive technical documentation & system design
```

---

## 🕹 Game Mechanics & Rules

### Biome Types
* **🌱 Grasslands (Safe & Obstacle Zones):** Starting buffer and resting zones populated with voxel trees and decorative boulders that block movement. Randomly spawns edible fly agaric mushrooms ($+1\text{ point}$).
* **🛣️ Highways (Vehicular Hazards):** Multi-lane traffic consisting of sedans, trucks, and vans traveling at randomized speeds. Lane directions alternate systematically. Stepping into a moving vehicle triggers instant collision death.
* **🌊 Rivers (Water Hazards):** Swift rivers with floating tree logs. Landing directly in water sinks the frog. Surviving requires hopping onto logs and managing lateral drift along the river's current.
* **⚠️ Trailing Camera Boundary:** If the player falls behind the camera's advancing frustum window ($z < \text{camZ} - 6$), an out-of-bounds death is triggered.

### Scoring & Multipliers
* **Distance Progress:** $+1\text{ point}$ for every new cell reached along the forward axis ($z > z_{\max}$).
* **Mushroom Pickups:** $+1\text{ bonus point}$ per collected mushroom with custom audio chime.
* **Fast-Paced Streak Combo:** Advancing to new ground within $1000\text{ ms}$ of the preceding hop stacks the combo counter ($\text{COMBO } \times N$), granting additional score bonuses per hop.

---

## 🎮 Controls & Input Schemes

| Action | Desktop Keyboard | Mobile Touchscreen | Virtual D-Pad |
| :--- | :--- | :--- | :--- |
| **Hop Forward** | `W` / `Arrow Up` | Swipe Up | `▲` Up Button |
| **Hop Backward** | `S` / `Arrow Down` | Swipe Down | `▼` Down Button |
| **Hop Left** | `A` / `Arrow Left` | Swipe Left | `◀` Left Button |
| **Hop Right** | `D` / `Arrow Right` | Swipe Right | `▶` Right Button |
| **Mute / Unmute** | Click Sound Icon | Tap Sound Icon | Tap Sound Icon |
| **Restart Game** | Click Restart Button | Tap Restart Button | Tap Restart Button |

---

## 🚀 Getting Started

### Prerequisites
* Any modern web browser supporting **WebGL 2.0** and the **Web Audio API** (Chrome, Firefox, Safari, Edge, Opera).
* No build step, package manager, or compilation required.

### Local Installation & Execution
```bash
# Clone the repository
git clone https://github.com/adiletbtrv/froggy-road.git
cd froggy-road

# Option A: Run via Python 3 built-in HTTP server
python -m http.server 8080

# Option B: Run via Node.js npx serve
npx serve .

# Option C: Use VS Code Live Server extension
# Right-click index.html and select "Open with Live Server"
```
Navigate to `http://localhost:8080` in your browser.

### Live Deployment
The project is hosted on GitHub Pages:
🔗 **[https://adiletbtrv.github.io/froggy-road/](https://adiletbtrv.github.io/froggy-road/)**

---

## ⚡ Performance & Optimizations

* **Shared Asset Pools:** Reuses pre-allocated materials and geometries across all rendered entities to avoid runtime allocations.
* **Shadow Map Frustum Optimization:** Compact `DirectionalLight` orthographic bounding box ($26 \times 26$ units) combined with $1024 \times 1024$ shadow mapping delivers crisp shadows with minimal GPU overhead.
* **Off-Screen Culling:** Lanes falling behind the camera ($z < \text{camZ} - 12$) are pruned from the Three.js scene graph and garbage collected.
* **Zero External HTTP Asset Latency:** Zero external 3D models (`.gltf`/`.obj`), textures (`.png`/`.jpg`), or audio clips (`.mp3`/`.wav`) are loaded. Initial page load completes in under $100\text{ ms}$.

---

## 📜 License & Author

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

**Author:** [Adilet Batyrov](https://github.com/adiletbtrv) • Connect on [LinkedIn](https://www.linkedin.com/in/adilet-batyrov/)
