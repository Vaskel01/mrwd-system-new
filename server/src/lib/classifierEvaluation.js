function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0
}

function labelDistribution(rows, field) {
  const counts = rows.reduce((totals, row) => {
    const label = row[field] || 'Unlabelled'
    totals[label] = (totals[label] || 0) + 1
    return totals
  }, {})
  return Object.fromEntries(Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => [label, { count, percentage: percentage(count, rows.length) }]))
}

function classificationMetrics(rows, expectedField, predictedField) {
  const labels = [...new Set(rows.flatMap(row => [row[expectedField], row[predictedField]]).filter(Boolean))].sort()
  const confusionMatrix = Object.fromEntries(labels.map(expected => [
    expected,
    Object.fromEntries(labels.map(predicted => [predicted, 0])),
  ]))
  for (const row of rows) {
    if (row[expectedField] && row[predictedField]) confusionMatrix[row[expectedField]][row[predictedField]] += 1
  }

  const perClass = {}
  for (const label of labels) {
    const truePositive = confusionMatrix[label][label]
    const falseNegative = Object.entries(confusionMatrix[label]).reduce((sum, [predicted, count]) =>
      sum + (predicted === label ? 0 : count), 0)
    const falsePositive = labels.reduce((sum, expected) =>
      sum + (expected === label ? 0 : confusionMatrix[expected][label]), 0)
    const support = truePositive + falseNegative
    const precision = percentage(truePositive, truePositive + falsePositive)
    const recall = percentage(truePositive, support)
    const f1 = precision + recall ? Number(((2 * precision * recall) / (precision + recall)).toFixed(2)) : 0
    perClass[label] = { precision, recall, f1, support }
  }

  const supported = labels.filter(label => perClass[label].support > 0)
  const totalSupport = supported.reduce((sum, label) => sum + perClass[label].support, 0)
  const macroF1 = supported.length
    ? Number((supported.reduce((sum, label) => sum + perClass[label].f1, 0) / supported.length).toFixed(2))
    : 0
  const weightedF1 = totalSupport
    ? Number((supported.reduce((sum, label) => sum + perClass[label].f1 * perClass[label].support, 0) / totalSupport).toFixed(2))
    : 0

  return { labels, per_class: perClass, macro_f1: macroF1, weighted_f1: weightedF1, confusion_matrix: confusionMatrix }
}

export function summarizeEvaluation(results = []) {
  const categoryCorrect = results.filter(row => row.predicted_category === row.expected_category).length
  const priorityCorrect = results.filter(row => row.predicted_priority === row.expected_priority).length
  const combinedCorrect = results.filter(row =>
    row.predicted_category === row.expected_category && row.predicted_priority === row.expected_priority).length
  const categoryDistribution = labelDistribution(results, 'expected_category')
  const supports = Object.values(categoryDistribution).map(item => item.count).filter(Boolean)
  const imbalanceRatio = supports.length > 1
    ? Number((Math.max(...supports) / Math.min(...supports)).toFixed(2))
    : 1
  const warnings = []
  for (const [category, details] of Object.entries(categoryDistribution)) {
    if (details.count < 5) warnings.push(`${category} has only ${details.count} labelled example${details.count === 1 ? '' : 's'}; its metric is unstable.`)
  }
  if (imbalanceRatio > 3) warnings.push(`Category support imbalance is ${imbalanceRatio}:1; prefer macro F1 over overall accuracy.`)

  return {
    total_cases: results.length,
    category_accuracy: percentage(categoryCorrect, results.length),
    priority_accuracy: percentage(priorityCorrect, results.length),
    combined_accuracy: percentage(combinedCorrect, results.length),
    category_correct: categoryCorrect,
    priority_correct: priorityCorrect,
    combined_correct: combinedCorrect,
    expected_category_distribution: categoryDistribution,
    expected_priority_distribution: labelDistribution(results, 'expected_priority'),
    category_metrics: classificationMetrics(results, 'expected_category', 'predicted_category'),
    priority_metrics: classificationMetrics(results, 'expected_priority', 'predicted_priority'),
    category_imbalance_ratio: imbalanceRatio,
    warnings,
  }
}

