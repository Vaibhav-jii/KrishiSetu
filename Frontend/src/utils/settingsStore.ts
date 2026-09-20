/**
 * localStorage-backed farmer profile settings.
 * Used to personalize default values across the app:
 *   - location → Weather page default city
 *   - state → Government Schemes default state
 *   - landAcres → Included in scheme eligibility context
 */

export interface FarmerProfile {
  name: string;
  location: string;   // City/District (e.g. "Agra")
  state: string;      // State (e.g. "Uttar Pradesh")
  landAcres: number;  // Total land in acres
}

const SETTINGS_KEY = "krishisetu_profile";

const DEFAULT_PROFILE: FarmerProfile = {
  name: "",
  location: "Agra",
  state: "Uttar Pradesh",
  landAcres: 0,
};

export function getProfile(): FarmerProfile {
  let profile = { ...DEFAULT_PROFILE };
  try {
    // 1. Try to load saved settings from settings key
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      profile = { ...profile, ...JSON.parse(raw) };
    }
    
    // 2. Override with the logged-in user's data (so it never forgets name/location)
    const userRaw = localStorage.getItem("krishisetu_user");
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (user.name) profile.name = user.name;
      if (user.city) profile.location = user.city;
      if (user.land_owned) profile.landAcres = user.land_owned;
    }
  } catch (e) {
    console.error("Error parsing profile", e);
  }
  return profile;
}

export function saveProfile(profile: FarmerProfile) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(profile));
}

export function getDefaultLocation(): string {
  return getProfile().location || "Agra";
}

export function getDefaultState(): string {
  return getProfile().state || "Uttar Pradesh";
}

export function getLandAcres(): number {
  return getProfile().landAcres || 0;
}
