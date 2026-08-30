import { readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { scoreComplaint } from '../src/lib/priorityScoring.js'
import { summarizeEvaluation } from '../src/lib/classifierEvaluation.js'
import { loadLabelledComplaints } from '../src/lib/labelledComplaintData.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaults = JSON.parse(readFileSync(join(__dirname, '../src/config/scoringConfig.json'), 'utf-8'))
const inputPath = process.argv[2] ? resolve(process.argv[2]) : null
const outputPath = process.argv[3] ? resolve(process.argv[3]) : null

if (!inputPath) {
  console.error('Usage: node scripts/calibrateClassifier.js <labelled.csv|json> [report.json]')
  process.exit(1)
}

const labelled = loadLabelledComplaints(inputPath, Object.keys(defaults.typeScores))
const validationRows = labelled.filter(row => row.split === 'validation')
const testRows = labelled.filter(row => row.split === 'test')
if (!validationRows.length) throw new Error('Calibration requires a non-empty validation split.')

function evaluate(rows, overrides) {
  const results = rows.map(row => {
    const scored = scoreComplaint({
      complaint_type: row.selected_type,
      description: row.description,
      has_photo: row.has_photo,
      base_severity_score: defaults.typeScores[row.selected_type] ?? defaults.defaultTypeScore,
    }, overrides)
    return {
      expected_category: row.expected_category,
      predicted_category: scored.predicted_category,
      expected_priority: row.expected_priority,
      predicted_priority: scored.priority,
    }
  })
  return summarizeEvaluation(results)
}

function distanceFromDefaults(candidate) {
  return Math.abs(candidate.priorityThresholds.medium - defaults.priorityThresholds.medium) +
    Math.abs(candidate.priorityThresholds.high - defaults.priorityThresholds.high) +
    Math.abs(candidate.sentimentAdjustments.negative - defaults.sentimentAdjustments.negative) +
    Math.abs(candidate.sentimentAdjustments.urgent - defaults.sentimentAdjustments.urgent) +
    Math.abs(candidate.photoBonus - defaults.photoBonus) +
    Math.abs(candidate.negatedEvidenceMitigation - defaults.negatedEvidenceMitigation) +
    Math.abs(candidate.keywordAdjustmentScale - (defaults.keywordAdjustmentScale ?? 1)) * 10
}

const candidates = []
for (const medium of [25, 30, 35]) {
  for (const high of [55, 60, 65]) {
    if (high <= medium) continue
    for (const negative of [3, 5, 7]) {
      for (const urgent of [8, 10, 12]) {
        for (const photoBonus of [5, 10]) {
          for (const negatedEvidenceMitigation of [3, 5, 7]) {
            for (const keywordAdjustmentScale of [0.8, 1, 1.2]) {
              const config = {
                priorityThresholds: { medium, high },
                sentimentAdjustments: { negative, urgent },
                photoBonus,
                negatedEvidenceMitigation,
                keywordAdjustmentScale,
              }
              candidates.push({ config, validation: evaluate(validationRows, config), distance: distanceFromDefaults(config) })
            }
          }
        }
      }
    }
  }
}

candidates.sort((left, right) =>
  right.validation.priority_metrics.macro_f1 - left.validation.priority_metrics.macro_f1 ||
  right.validation.combined_accuracy - left.validation.combined_accuracy ||
  right.validation.priority_accuracy - left.validation.priority_accuracy ||
  left.distance - right.distance)

const best = candidates[0]
const report = {
  generated_at: new Date().toISOString(),
  classifier_version: defaults.classifierVersion,
  method: 'Grid search on validation priority macro F1; combined accuracy and closeness to defaults are tie-breakers.',
  guardrails: [
    'Development examples are not used for selection.',
    'The test split is evaluated once after selecting the best validation candidate.',
    'This report never modifies scoringConfig.json automatically.',
    'Per-term and category weights still require qualified MRWD review; this search calibrates only a global dataset-weight scale, score thresholds, and adjustments.',
  ],
  validation_cases: validationRows.length,
  test_cases: testRows.length,
  candidates_evaluated: candidates.length,
  best_config: best.config,
  best_validation_metrics: best.validation,
  held_out_test_metrics: testRows.length ? evaluate(testRows, best.config) : null,
  top_candidates: candidates.slice(0, 10).map(candidate => ({
    config: candidate.config,
    priority_macro_f1: candidate.validation.priority_metrics.macro_f1,
    priority_accuracy: candidate.validation.priority_accuracy,
    combined_accuracy: candidate.validation.combined_accuracy,
    distance_from_defaults: candidate.distance,
  })),
}

if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)

console.log(`Validation complaints: ${report.validation_cases}`)
console.log(`Candidates evaluated: ${report.candidates_evaluated}`)
console.log(`Best validation priority macro F1: ${report.best_validation_metrics.priority_metrics.macro_f1}%`)
console.log(`Best config: ${JSON.stringify(report.best_config)}`)
if (report.held_out_test_metrics) console.log(`Held-out test priority macro F1: ${report.held_out_test_metrics.priority_metrics.macro_f1}%`)
else console.log('No test split supplied; do not treat validation performance as final accuracy.')
if (outputPath) console.log(`Report: ${outputPath}`)
