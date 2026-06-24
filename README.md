# STEPS Interactive Simulations

A Vite + React (TypeScript) web application built for the **STEPS Interreg** cross-border
education project. It hosts browser-based, interactive simulations that let people
*experience* sensory and assistive-technology topics first-hand.

The only experience currently implemented is the **Hearing Loss Simulator**, which
processes real audio through clinically-inspired hearing-loss profiles in real time using
the Web Audio API, lets users run a simulated hearing test, and lets them "program" a
virtual hearing aid to correct the loss.

The UI is fully localised in **Danish (default), German, and English**, and supports a
light/dark/system theme.

> A deeper, domain-focused write-up of the hearing-loss experience lives in
> [HEARING_LOSS_README.md](HEARING_LOSS_README.md). This file focuses on the project as a
> whole, its architecture, and the actual navigation/flow pipeline as implemented.

---

## Tech stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Build / dev server | Vite 7 |
| Routing | React Router 7 (`createBrowserRouter`) |
| Styling | Tailwind CSS 3 (+ PostCSS, Autoprefixer) |
| Audio | Web Audio API (custom DSP engine, no audio libraries) |
| i18n / theming | React Context (`src/i18n`) |
| Tests | Vitest |
| Hosting | GitHub Pages via GitHub Actions |

---

## Project structure

```
src/
  main.tsx                     App entry; mounts the router
  app/
    App.tsx                    Layout shell: header, language/theme toggles, contextual nav
    router.tsx                 Route table (basename = Vite BASE_URL)
  pages/
    Dashboard.tsx              Home: grid of experience cards from the registry
    AudioLab.tsx               Developer-only audio engine playground (/audio-lab)
  experiences/
    registry.ts                List of experiences shown on the dashboard
    hearing-loss/
      HearingLoss.tsx          The whole experience: screens, level flow, audiogram UI
      HearingLossCompare.tsx   "Hear & compare" dashboard (4 profiles x 4 clips)
      levelConfig.ts           Which levels are enabled + label-hiding flag
      audiometry/
        rapp.ts                Deterministic staircase (R-App) tone logic
        model.ts               Per-session audiometry data model
        loudness.ts            Loudness-level <-> playback-gain mapping
  audio/
    engine.ts                  AudioEngine: graph, profiles, tones, mic, correction
    profiles.ts                HearingProfile / CorrectionParams types
    hearingLossProfiles.ts     Declarative, seeded hearing-loss profile definitions
    calibration.ts             Prototype dB-HL calibration + audiogram frequencies
  components/                  UnifiedAudioPlayer, AudioSpectrum, sliders, toggles, cards
  i18n/                        LocaleContext, ThemeContext, translations
public/                        Static assets served as-is (audio, icons, flags, art)
scripts/                       postbuild-pages.mjs, deploy-ghpages.mjs
dist/                          Build output published to GitHub Pages
```

---

## Application flow / navigation pipeline

Navigation has two layers: **React Router routes** (the URL path) and, inside the
hearing-loss experience, a **`?screen=` / `?level=` / `?stage=` query-string state
machine** managed in [HearingLoss.tsx](src/experiences/hearing-loss/HearingLoss.tsx). The
query string is the single source of truth, so the browser back button and deep links work
throughout.

### Top-level routes

| Path | Component | Purpose |
|---|---|---|
| `/` | `Dashboard` | Landing grid of available experiences |
| `/experiences/hearing-loss` | `HearingLoss` | The hearing-loss experience (sub-screens via query string) |
| `/audio-lab` | `AudioLab` | Developer playground for the audio engine |

### The full pipeline

```
/  Dashboard
│   (experience cards come from experiences/registry.ts; only "hearing-loss" exists,
│    status: "prototype")
│
└── click card ──> /experiences/hearing-loss   (screen=landing)
        │
        │  LANDING — choose a mode (two cards)
        │
        ├── "Hear & compare"  ──> screen=compare
        │       HearingLossCompare: a grid of hearing profiles, each with the four
        │       audio clips. Press play and switch profiles to A/B the same sound
        │       through different losses, routed live through the engine.
        │
        ├── "Experience & correct" ──> screen=experience
        │       Level menu. Levels unlock sequentially: a level is locked until the
        │       previous one is marked complete. "intro" is always open.
        │       (Header has a dev "unlock all" button on this screen.)
        │       │
        │       └── start a level ──> screen=level & level=<id> & stage=<stage>
        │               │
        │               │   Per-level four-stage workflow:
        │               │
        │               ├── stage=listen     Play clips processed through this level's
        │               │                    hearing-loss profile. Hear the loss.
        │               │
        │               ├── stage=test       Simulated pure-tone audiometry. Tones
        │               │                    auto-play (~2.6 s cadence) per ear (R then
        │               │                    L) across 250 Hz–8 kHz. Move the slider to
        │               │                    the quietest audible level; "Continue" or
        │               │                    "Can't hear it" records each threshold.
        │               │
        │               ├── stage=audiogram  Plot the measured thresholds on a clinical
        │               │                    dB-HL audiogram (-10..120) with severity
        │               │                    bands (Normal..Profound).
        │               │
        │               └── stage=correct    Become the audiologist: drag audiogram
        │                                     points per ear/frequency to "program" a
        │                                     virtual hearing aid. The engine applies
        │                                     real-time EQ (half-gain rule) so users hear
        │                                     the improvement. (Skipped for "intro" —
        │                                     nothing to correct.)
        │
        └── (hidden) Live microphone ──> screen=live
                Routes the live microphone through a chosen loss profile in real time.
                Reachable via URL; warns to use headphones to avoid feedback.
```

### Which levels actually run

All 14 hearing-loss profiles are defined in code, but
[levelConfig.ts](src/experiences/hearing-loss/levelConfig.ts) gates what ships. By default
**four levels are enabled**: `intro` (Normal Hearing), `hf_sloping_age` (high-frequency
loss), `low_frequency_loss`, and `deafness` (full loss). The remaining profiles are kept in
the code for future builds but disabled.

You can override the enabled set at build time with the
`VITE_HEARINGLOSS_ENABLED_LEVELS` env var (comma-separated level ids; `intro` is always
included). Also note `HIDE_HEARING_LOSS_PROFILE_LABELS = true`: for non-intro,
not-yet-completed levels the profile name/description are replaced with generic placeholder
copy, so learners must infer the loss type from what they hear.

### Audio engine, in one breath

The shared singleton `engine` ([engine.ts](src/audio/engine.ts)) initialises an
`AudioContext` on the first user gesture, then builds a routing graph that can take input
from an `<audio>` element or the microphone, push it through the active `HearingProfile`
(biquad filters, gain, compression, noise/tinnitus, per-ear attenuation), optionally apply
a `CorrectionParams` EQ on top (the hearing-aid step), and out to the speakers. It also
synthesises calibrated pure tones for the audiometry test.

### State & persistence

Per-level progress (audiometry thresholds, slider position, current ear/frequency,
audiogram adjustments, last stage) is kept **in memory** and restored when switching
between levels in a session. It is intentionally **not persisted** — a full page refresh
resets the experience.

---

## Local development

```bash
npm install
npm run dev      # Vite dev server with HMR
```

## Validation

```bash
npm test         # Vitest unit tests (audio utils + audiometry logic)
npm run build    # tsc -b && vite build
npm run lint     # ESLint
```

The `/audio-lab` route is a handy manual test harness for the audio engine: load clips from
`public/hearing-loss/audios`, pick a profile, set intensity, and exercise playback.

---

## GitHub Pages deployment

GitHub Pages publishes the built static site from `dist/`. It does not run the Vite dev
server and it does not compile `src/main.tsx` from the repository root.

Recommended setup:

1. In GitHub, open `Settings -> Pages`.
2. Set `Source` to `GitHub Actions`.
3. Push to `main`.
4. The workflow in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)
   builds the app and publishes `dist/`.

### Base path rules

The Vite `base` is controlled by the `PAGES_BASE` env var (defaults to `/`):

- User/organization site (`<owner>.github.io`) → base `/`.
- Project site (`<owner>.github.io/<repo>/`) → base `/<repo>/`.

The workflow computes this automatically before building.

### Optional local deploy into another Pages repo

To copy the built site into a separate checked-out Pages repository on your machine:

```bash
npm run deploy:pages:local -- "C:/path/to/your/pages-repo"
```

This runs `build:pages` (which calls [scripts/postbuild-pages.mjs](scripts/postbuild-pages.mjs))
followed by [scripts/deploy-ghpages.mjs](scripts/deploy-ghpages.mjs).

---

## Educational context

This tool is part of the STEPS Interreg project, a cross-border educational initiative. It
is designed for classrooms, workshops, and public-awareness events — to help people
understand the daily auditory challenges of living with hearing loss, and to demonstrate
how hearing-aid technology compensates for it. Teaching materials and task sheets are kept
in [Important Notes/](Important%20Notes/) and `public/hearing-loss/tasks/`.
