const dashboardNutrients = [
  ["calories", "energyKcal"],
  ["protein", "proteinG"],
  ["carbs", "carbohydrateG"],
  ["fat", "fatG"],
];

export const summarizeFoodLogs = logs => ({
  totals: Object.fromEntries(dashboardNutrients.map(([target, nutrient]) => [
    target,
    logs.reduce((total, log) => total + (Number.isFinite(log.nutrients?.[nutrient]) ? log.nutrients[nutrient] : 0), 0),
  ])),
  incomplete: Object.fromEntries(dashboardNutrients.map(([target, nutrient]) => [
    target,
    logs.some(log => !Number.isFinite(log.nutrients?.[nutrient])),
  ])),
});
