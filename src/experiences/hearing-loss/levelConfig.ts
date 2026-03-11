// Hearing Loss level toggles.
//
// Goal: allow shipping different builds with a subset of levels *without deleting*
// anything. All level content stays in `HearingLoss.tsx`; this file only controls
// which levels are shown/accessible.
//
// How to use:
// - Default: this map controls enabled levels.
// - Build-time override: set `VITE_HEARINGLOSS_ENABLED_LEVELS` to a comma-separated
//   list of level ids to include (e.g. "intro,hf_sloping_age,notch_4khz").
//
// Notes:
// - "intro" is always enabled.

// When enabled, UI labels for hearing-loss profiles are replaced with generic
// placeholder copy so learners must infer the profile from the audio/task.
export const HIDE_HEARING_LOSS_PROFILE_LABELS = true;

export const HEARING_LOSS_LEVELS_ENABLED: Record<string, boolean> = {
  intro: true,
  // High-frequency loss
  hf_sloping_age: true,

  // Low-frequency loss
  low_frequency_loss: true,

  // Full loss
  deafness: true,

  // Disabled by default (kept for future builds)
  notch_4khz: false,
  broad_hf_noise_damage: false,
  flat_snhl: false,
  steep_hf_sloping: false,
  cookie_bite: false,
  asymmetric_lr: false,
  conductive_muffling: false,
  mixed_loss: false,
  speech_in_noise: false,
  profound: false,
};

const parseCsvSet = (raw: unknown): Set<string> | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const set = new Set(
    trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.size > 0 ? set : null;
};

const envEnabledSet = parseCsvSet(import.meta.env.VITE_HEARINGLOSS_ENABLED_LEVELS);

export function isHearingLossLevelEnabled(levelId: string): boolean {
  if (levelId === "intro") return true;

  // If the env var is set, it becomes the source of truth.
  if (envEnabledSet) return envEnabledSet.has(levelId);

  // Otherwise fall back to the local toggle map (default true if missing).
  return HEARING_LOSS_LEVELS_ENABLED[levelId] ?? true;
}
