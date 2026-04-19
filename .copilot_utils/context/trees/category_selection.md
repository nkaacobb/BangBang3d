# BFPL Category Selection Tree

## Purpose

Maps a practical app category (local folder name, server path) to the
correct BFPL website category, JSON data file, and section key for
card display on the site.

---

## Decision Tree

Input: app category description, folder name, or hint about what the app does

```
├─ "music", "audio", "midi", "sound", "synth", "beat", "musical", "instrument"
│  → serverCategory:  music
│  → websiteCategory: musicality
│  → targetJsonFile:  musicality.json
│  ├─ projects     → targetSectionKey: music-projects-grid
│  └─ experiments  → targetSectionKey: music-experiments-grid

├─ "science", "physics", "simulation", "chemistry", "biology",
│  "math", "fractal", "wave", "signal", "quantum", "relativity", "lattice"
│  → serverCategory:  science
│  → websiteCategory: science-simulation
│  → targetJsonFile:  science-simulation.json
│  └─ any           → targetSectionKey: science-grid

├─ "ai", "machine learning", "neural", "llm", "model", "training",
│  "inference", "agent", "gpt", "claude", "generative"
│  → serverCategory:  ai
│  → websiteCategory: ai-explorations
│  → targetJsonFile:  ai-explorations.json
│  └─ any           → targetSectionKey: ai-projects-grid

├─ "game", "3d", "puzzle", "shooter", "platformer", "arcade",
│  "player", "score", "level", "enemy", "physics game", "interactive"
│  → serverCategory:  games
│  → websiteCategory: games (index page)
│  → targetJsonFile:  index.json
│  ├─ projects     → targetSectionKey: projects-grid
│  └─ experiments  → targetSectionKey: experiments-grid

├─ "philosophy", "theory", "logic", "argument", "ethics",
│  "consciousness", "determinism", "prime", "causal", "language"
│  → serverCategory:  philosophy
│  → websiteCategory: philosophy-theory
│  → targetJsonFile:  philosophy-theory.json
│  └─ any           → targetSectionKey: philosophy-grid

├─ "code", "tool", "utility", "dev", "generator", "parser",
│  "editor", "builder", "workflow", "automation", "visualizer"
│  → serverCategory:  tools
│  → websiteCategory: code-craft
│  → targetJsonFile:  code-craft.json
│  ├─ projects     → targetSectionKey: code-projects-grid
│  └─ experiments  → targetSectionKey: code-experiments-grid

└─ Unknown or ambiguous
   → Ask user: "Which category fits best?
     music / science / ai / games / philosophy / tools"
```

---

**Output variables:**
- `serverCategory` — used in /opt/apps/ and local folder paths
- `websiteCategory` — used in /var/www/.../apps/ symlink path and public URL
- `targetJsonFile` — which data JSON file gets the card entry
- `targetSectionKey` — which section within that JSON file
