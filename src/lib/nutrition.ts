// Nutrition helpers: BMR/TDEE estimation + macro split

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalDirection = "lose" | "maintain" | "gain";

const ACTIVITY_MULT: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export interface CalcInput {
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: GoalDirection;
}

export interface CalcResult {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Mifflin–St Jeor for females
export function calcNutritionTargets({ weightKg, heightCm, age, activity, goal }: CalcInput): CalcResult {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const tdee = bmr * (ACTIVITY_MULT[activity] ?? 1.4);
  const adjusted = goal === "lose" ? tdee - 400 : goal === "gain" ? tdee + 300 : tdee;
  const calories = Math.max(1200, Math.round(adjusted / 10) * 10);

  // Macro split: protein 1.6 g/kg, fat 30% of cals, carbs fill rest
  const protein_g = Math.round(weightKg * 1.6);
  const fat_g = Math.round((calories * 0.3) / 9);
  const carbsKcal = Math.max(0, calories - protein_g * 4 - fat_g * 9);
  const carbs_g = Math.round(carbsKcal / 4);
  return { calories, protein_g, carbs_g, fat_g };
}

export function lbsToKg(lbs: number) { return lbs / 2.2046226218; }
export function kgToLbs(kg: number) { return kg * 2.2046226218; }
export function cmToInches(cm: number) { return cm / 2.54; }
export function inchesToCm(inches: number) { return inches * 2.54; }
