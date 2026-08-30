import { readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { scoreComplaint } from '../src/lib/priorityScoring.js'
import { summarizeEvaluation } from '../src/lib/classifierEvaluation.js'
import { loadLabelledComplaints } from '../src/lib/labelledComplaintData.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(join(__dirname, '../src/config/scoringConfig.json'), 'utf-8'))
const inputPath = process.argv[2] ? resolve(process.argv[2]) : null
const outputPath = process.argv[3] ? resolve(process.argv[3]) : null

if (!inputPath) {
  console.error('Usage: node scripts/evaluateLabelledComplaints.js <labelled.csv|json> [report.json]')
  process.exit(1)
}

const categories = Object.keys(config.typeScores)
const labelled = loadLabelledComplaints(inputPath, categories)

function evaluate(rows) {
  const results = rows.map(row => {
    const result = scoreComplaint({
      complaint_type: row.selected_type,
      description: row.description,
      has_photo: row.has_photo,
      base_severity_score: config.typeScores[row.selected_type] ?? config.defaultTypeScore,
    })
    return {
      id: row.id,
      split: row.split,
      selected_type: row.selected_type,
      has_photo: row.has_photo,
      expected_category: row.expected_category,
      predicted_category: result.predicted_category,
      expected_priority: row.expected_priority,
      predicted_priority: result.priority,
      priority_score: result.priority_score,
      category_confidence: result.category_confidence,
      multi_issue: result.multi_issue,
      classification_ambiguous: result.classification_ambiguous,
    }
  })
  return { ...summarizeEvaluation(results), results }
}

const splitNames = [...new Set(labelled.map(row => row.split))]
const report = {
  generated_at: new Date().toISOString(),
  classifier_version: config.classifierVersion,
  privacy_note: 'Complaint descriptions are intentionally omitted from this report.',
  overall: evaluate(labelled),
  splits: Object.fromEntries(splitNames.map(split => [split, evaluate(labelled.filter(row => row.split === split))])),
}

if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)

console.log(`Classifier: ${report.classifier_version}`)
console.log(`Labelled complaints: ${report.overall.total_cases}`)
console.log(`Category accuracy / macro F1: ${report.overall.category_accuracy}% / ${report.overall.category_metrics.macro_f1}%`)
console.log(`Priority accuracy / macro F1: ${report.overall.priority_accuracy}% / ${report.overall.priority_metrics.macro_f1}%`)
for (const warning of report.overall.warnings) console.log(`Warning: ${warning}`)
if (outputPath) console.log(`Report: ${outputPath}`)

