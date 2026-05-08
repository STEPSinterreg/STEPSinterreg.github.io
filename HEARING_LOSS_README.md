# STEPS - Hearing Loss Simulator

**STEPS Interactive Simulations** is an educational web application built as part of the STEPS Interreg project. The application lets users experience, understand, and interact with different types of hearing loss through real-time audio processing in the browser. It is available in three languages: Danish, German, and English.

## Purpose

The Hearing Loss Experience is designed to raise awareness and empathy around hearing loss. Rather than simply explaining what hearing loss sounds like, the application lets users hear it first-hand by processing real audio through clinically-inspired hearing loss profiles in real time. Users can also perform a simulated hearing test and attempt to correct the loss using virtual hearing aid controls, demonstrating how modern technology assists people with hearing impairments.

## How It Works

The application uses the **Web Audio API** to build a real-time audio processing pipeline directly in the browser. When a user plays an audio clip (speech, street sounds, birdsong), the audio is routed through a chain of biquad filters, gain nodes, compressors, and other DSP effects that simulate a specific hearing loss profile. Each profile is defined declaratively with randomized parameter ranges so no two experiences are exactly the same, mirroring the natural variation in real hearing loss.

## Two Modes of Exploration

When entering the Hearing Loss Experience, users are presented with a landing page offering two distinct paths:

### Mode 1: Hear and Compare Types of Hearing Loss

A side-by-side comparison dashboard that lets users instantly hear the difference between hearing loss types. Four hearing profiles are displayed in a responsive grid:

| Profile | Description |
|---|---|
| **Normal Hearing** | Baseline playback with no simulated loss (control) |
| **Low-Frequency Loss** | Reduced low frequencies with preserved highs |
| **High-Frequency Sloping Loss** | Progressive reduction in high frequencies, typical of age-related hearing loss |
| **Complete Deafness** | Output is fully muted (educational demonstration) |

Each profile card contains four audio players (female speech, male speech, busy street, birds chirping). Users can press play on any clip and instantly switch between profiles to hear the same audio through different types of hearing loss. The audio engine automatically routes playback through the selected profile's filter chain in real time.

### Mode 2: Experience Hearing Loss and Correct It Using Modern Technology

A guided, level-based experience where users work through 14 progressively unlocking levels. Each level assigns a different hearing loss profile and guides the user through a four-stage workflow:

#### Stage 1: Listen
The user plays audio clips (speech, street sounds, birds) processed through the level's hearing loss profile. They hear first-hand how the specific type of loss affects different kinds of sound. An educational guide explains what to listen for.

#### Stage 2: Test (Simulated Audiometry)
The user performs a self-guided pure-tone hearing test. The application plays calibrated tones at standard audiometric frequencies (250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz) in each ear. The user adjusts a slider to find the quietest level at which they can still hear each tone, simulating the threshold-finding process used in real clinical audiometry.

#### Stage 3: Audiogram
The results of the hearing test are displayed on a standard audiogram chart showing hearing thresholds for both ears across all test frequencies. The chart uses the clinical dB HL scale (-10 to 120 dB) with severity bands labeled (Normal, Mild, Moderate, Moderately Severe, Severe, Profound). Users can see visually where their simulated hearing loss falls.

#### Stage 4: Correct (Virtual Hearing Aid)
The user becomes the audiologist. The audiogram points become draggable, and users can adjust the correction applied at each frequency for each ear independently, mimicking how a real hearing aid is programmed. As points are moved, the audio engine applies real-time EQ correction using a half-gain rule. Users can play audio clips while adjusting to hear the improvement in real time. This demonstrates how hearing aids use frequency-specific amplification to compensate for hearing loss.

> Note: The introductory level (Normal Hearing) does not include the Correct stage, as there is no loss to correct.

## The 14 Hearing Loss Profiles

The experience includes a comprehensive set of clinically-inspired hearing loss profiles:

1. **Normal Hearing (Intro)** - Baseline playback with no loss
2. **High-Frequency Sloping (Age-Related)** - Progressive high-frequency reduction, the most common type of hearing loss
3. **4 kHz Notch (Noise-Induced)** - A characteristic dip around 3-6 kHz caused by loud noise exposure
4. **Broad High-Frequency Noise Damage** - Noise notch combined with overall high-frequency reduction
5. **Flat Sensorineural Hearing Loss** - Uniform attenuation across all frequencies
6. **Steep High-Frequency Sloping** - Near-normal lows and mids with a sharp high-frequency drop
7. **Low-Frequency Loss** - Reduced low frequencies with better high-frequency hearing
8. **Cookie-Bite (Mid-Frequency Dip)** - A U-shaped loss with a dip around 1-2 kHz
9. **Asymmetric Loss (Left/Right Different)** - Different loss patterns between ears
10. **Conductive Muffling** - Global attenuation with reduced high-frequency detail, simulating middle-ear problems
11. **Mixed Loss (Conductive + SNHL)** - Combined conductive and sensorineural loss patterns
12. **Speech-in-Noise Difficulty** - Added shaped noise to reduce speech intelligibility
13. **Profound Loss** - Extreme attenuation across the spectrum
14. **Complete Deafness** - Fully muted output (educational demonstration)

Each profile uses randomized parameter ranges and includes combinations of frequency-specific EQ filters, ear-specific gain adjustments, dynamic range compression, tinnitus simulation, background noise, clarity loss effects, and transient softening to create realistic and varied hearing loss simulations.

## Audio Content

The experience uses four categories of audio for testing:

- **Female Speech (Jessica)** - Two speech clips for testing speech intelligibility
- **Male Speech (Mark)** - Two speech clips at a different pitch range
- **Busy Street** - Four looping urban environment recordings
- **Birds Chirping** - Three looping nature soundscapes

These categories are chosen to cover different frequency ranges (low-frequency traffic rumble, mid-range speech, high-frequency birdsong) so users can observe how each type of hearing loss affects different kinds of everyday sound differently.

## User Flow Summary

```
Landing Page
  |
  +-- "Hear and Compare" --> Compare Dashboard (4 profiles x 4 audio clips)
  |
  +-- "Experience and Correct" --> Experience Menu
        |
        +-- Introduction (Normal Hearing)
        |     Listen -> Test -> Audiogram
        |
        +-- Level 1: High-Frequency Sloping
        |     Listen -> Test -> Audiogram -> Correct
        |
        +-- Level 2: 4 kHz Notch
        |     Listen -> Test -> Audiogram -> Correct
        |
        +-- ... (12 more levels, currently not implemented)
        |
        +-- Level 13: Complete Deafness
              Listen -> Test -> Audiogram -> Correct
```

## Technology

- **React 19** with TypeScript
- **Vite 7** for bundling and development
- **Tailwind CSS 3** for styling
- **Web Audio API** for real-time audio processing (biquad filters, dynamics compression, oscillators, gain nodes)
- **React Router** for navigation
- **i18n** via React Context supporting Danish, German, and English

## Educational Context

This tool is part of the **STEPS Interreg** project, a cross-border educational initiative. It is designed for use in classrooms, workshops, and public awareness events to help people understand the daily auditory challenges faced by individuals with hearing impairments, and to demonstrate how hearing aid technology works to compensate for these challenges.

## Implementation Notes (additional features)

- **Audio engine & calibration:** The repository exposes a programmatic audio engine (`src/audio/engine.ts`) that supports loading clips, initialising playback on user gesture, setting hearing-loss profiles and intensity, and controlling play/pause/stop/destroy. A calibration utility (`src/audio/calibration.ts`) contains a prototype/default calibration profile and helper functions to convert dB HL to playback gain — replace these values with real headphone/device calibration for clinical accuracy.

- **Audiometry algorithm:** The simulated hearing test uses a deterministic R‑App staircase algorithm implemented in `src/experiences/hearing-loss/audiometry/rapp.ts`. Audiometry progress for each level is stored in-memory during a session and is restored when switching levels (note: a full page refresh clears the in-memory session state).

- **Developer AudioLab:** There is an interactive developer/testing page at the `AudioLab` route (`/audio-lab`, implemented in `src/pages/AudioLab.tsx`) that lets developers load audio from `public/hearing-loss/audios`, pick hearing-loss profiles, set intensity, and exercise the audio engine interactively.

- **Tests & CI:** The project includes unit tests (Vitest) covering audio utilities and audiometry logic (see `src/**/*.test.ts`). A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) builds and deploys the site to GitHub Pages.

- **Build & deploy scripts:** Useful scripts are available in `package.json`: `npm run build`, `npm run build:pages`, and `npm run deploy:pages:local` (the latter uses `scripts/postbuild-pages.mjs` and `scripts/deploy-ghpages.mjs`) to support local or CI-driven deployment into a Pages repository.

If you want, I can (a) expand any of these notes into a dedicated developer section with examples and commands, (b) add a short "How to run tests" subsection, or (c) update the top-level README to link here. Which would you prefer?
