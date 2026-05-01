// Pure domain function — no globals, no DOM, no fetch.
export function calcTargetsFromProfile(p) {
  const bmr = p.sex === 'male'
    ? 10 * p.weight + 6.25 * p.height - 5 * p.age + 5
    : 10 * p.weight + 6.25 * p.height - 5 * p.age - 161;

  const actMult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = bmr * (actMult[p.activity] || 1.55);
  const calories = Math.round(tdee + (p.goalAdj || 0));

  const proteinPerKg = { sedentary: 0.8, light: 1.2, moderate: 1.6, active: 2.0, very_active: 2.2 };
  const protein = Math.round(p.weight * (proteinPerKg[p.activity] || 1.6));
  const fat = Math.round((calories * 0.30) / 9);
  const carbs = Math.max(Math.round((calories - protein * 4 - fat * 9) / 4), 50);

  const fiber = p.age >= 51
    ? (p.sex === 'male' ? 30 : 21)
    : (p.sex === 'male' ? 38 : 25);

  const calcium = (p.sex === 'female' && p.age >= 51) || p.age >= 71 ? 1200 : 1000;
  const iron = p.sex === 'female' && p.age < 51 ? 18 : 8;
  const magnesium = p.sex === 'male' ? (p.age >= 31 ? 420 : 400) : (p.age >= 31 ? 320 : 310);
  const potassium = p.sex === 'male' ? 3400 : 2600;
  const zinc = p.sex === 'male' ? 11 : 8;

  const vitA = p.sex === 'male' ? 900 : 700;
  const vitC = p.sex === 'male' ? 90 : 75;
  const vitD = p.age >= 71 ? 800 : 600;
  const vitB6 = p.age >= 51 ? (p.sex === 'male' ? 1.7 : 1.5) : 1.3;
  const thiamin = p.sex === 'male' ? 1.2 : 1.1;
  const riboflavin = p.sex === 'male' ? 1.3 : 1.1;
  const niacin = p.sex === 'male' ? 16 : 14;
  const vitK = p.sex === 'male' ? 120 : 90;
  const omega3 = p.sex === 'male' ? 1.6 : 1.1;
  const lysine = Math.round(p.weight * 0.030 * 10) / 10; // 30 mg/kg/day

  return {
    'Energy': calories, 'Protein': protein, 'Carbohydrate': carbs,
    'Total lipid': fat, 'Fiber': fiber,
    'Sodium': 1500,
    'Calcium': calcium, 'Iron': iron, 'Magnesium': magnesium,
    'Potassium': potassium, 'Zinc': zinc, 'Selenium': 55,
    'Vitamin A': vitA, 'Vitamin C': vitC, 'Vitamin D': vitD,
    'Vitamin E': 15, 'Vitamin K': vitK,
    'Thiamin': thiamin, 'Riboflavin': riboflavin, 'Niacin': niacin,
    'Vitamin B-6': vitB6, 'Vitamin B-12': 2.4, 'Folate': 400,
    'Fatty acids, total omega-3': omega3, 'Lysine': lysine,
  };
}


// Derive macro gram targets from total kcal and macro percentages (P/C/F must sum to 100).
export function deriveMacrosFromKcal(kcal, pct) {
  return {
    protein: Math.round((kcal * pct.p / 100) / 4),
    carbs:   Math.round((kcal * pct.c / 100) / 4),
    fat:     Math.round((kcal * pct.f / 100) / 9),
  };
}
