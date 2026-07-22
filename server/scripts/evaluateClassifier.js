import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { scoreComplaint } from '../src/lib/priorityScoring.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(__dirname, '../src/data/classifierTestCases.json'), 'utf-8'))
const config = JSON.parse(readFileSync(join(__dirname, '../src/config/scoringConfig.json'), 'utf-8'))

const results = cases.map(test => {
  const result = scoreComplaint({
    complaint_type: test.selected_type,
    description: test.description,
    has_photo: test.has_photo,
    base_severity_score: config.typeScores[test.selected_type] ?? config.defaultTypeScore,
  })
  return {
    ...test,
    predicted_category: result.predicted_category,
    category_confidence: result.category_confidence,
    predicted_priority: result.priority,
    priority_score: result.priority_score,
    sentiment: result.classification_sentiment,
    matched_terms: result.matched_keywords.map(item => item.term).join(' | '),
    category_correct: result.predicted_category === test.expected_category,
    priority_correct: result.priority === test.expected_priority,
    both_correct: result.predicted_category === test.expected_category && result.priority === test.expected_priority,
  }
})

const categoryCorrect = results.filter(row => row.category_correct).length
const priorityCorrect = results.filter(row => row.priority_correct).length
const bothCorrect = results.filter(row => row.both_correct).length
const pct = value => Number(((value / results.length) * 100).toFixed(2))

const report = {
  generated_at: new Date().toISOString(),
  classifier_version: config.classifierVersion,
  total_cases: results.length,
  category_accuracy: pct(categoryCorrect),
  priority_accuracy: pct(priorityCorrect),
  combined_accuracy: pct(bothCorrect),
  category_correct: categoryCorrect,
  priority_correct: priorityCorrect,
  combined_correct: bothCorrect,
  results,
}

writeFileSync(join(__dirname, '../../docs/classifier-evaluation-results.json'), JSON.stringify(report, null, 2) + '\n')

console.log(`Classifier: ${report.classifier_version}`)
console.log(`Cases: ${report.total_cases}`)
console.log(`Category accuracy: ${report.category_accuracy}% (${categoryCorrect}/${results.length})`)
console.log(`Priority accuracy: ${report.priority_accuracy}% (${priorityCorrect}/${results.length})`)
console.log(`Both correct: ${report.combined_accuracy}% (${bothCorrect}/${results.length})`)

for (const row of results.filter(item => !item.both_correct)) {
  console.log(`- ${row.id}: expected ${row.expected_category}/${row.expected_priority}; got ${row.predicted_category}/${row.predicted_priority} (${row.priority_score})`)
}
