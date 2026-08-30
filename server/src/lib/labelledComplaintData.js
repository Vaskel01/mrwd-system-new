import { readFileSync } from 'fs'
import { extname } from 'path'

const VALID_SPLITS = new Set(['development', 'validation', 'test'])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])

export function parseLabelledCsv(source) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const text = String(source || '').replace(/^\uFEFF/, '')
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''))
      if (row.some(value => value.length)) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  row.push(cell.replace(/\r$/, ''))
  if (row.some(value => value.length)) rows.push(row)
  if (!rows.length) return []
  const headers = rows.shift().map(header => header.trim())
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function parseBoolean(value, rowNumber) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', ''].includes(normalized)) return false
  throw new Error(`Row ${rowNumber}: has_photo must be true or false.`)
}

export function validateLabelledComplaints(rows, validCategories) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The labelled dataset must contain at least one complaint.')
  const allowedCategories = new Set(validCategories)
  const seenIds = new Set()
  return rows.map((raw, index) => {
    const rowNumber = index + 2
    const row = {
      id: String(raw.id || '').trim(),
      split: String(raw.split || '').trim().toLowerCase(),
      selected_type: String(raw.selected_type || '').trim(),
      description: String(raw.description || '').trim(),
      has_photo: parseBoolean(raw.has_photo, rowNumber),
      expected_category: String(raw.expected_category || '').trim(),
      expected_priority: String(raw.expected_priority || '').trim().toLowerCase(),
    }
    if (!row.id) throw new Error(`Row ${rowNumber}: id is required.`)
    if (seenIds.has(row.id)) throw new Error(`Row ${rowNumber}: duplicate id "${row.id}".`)
    seenIds.add(row.id)
    if (!VALID_SPLITS.has(row.split)) throw new Error(`Row ${rowNumber}: split must be development, validation, or test.`)
    if (!allowedCategories.has(row.selected_type)) throw new Error(`Row ${rowNumber}: unknown selected_type "${row.selected_type}".`)
    if (!row.description) throw new Error(`Row ${rowNumber}: description is required.`)
    if (!allowedCategories.has(row.expected_category)) throw new Error(`Row ${rowNumber}: unknown expected_category "${row.expected_category}".`)
    if (!VALID_PRIORITIES.has(row.expected_priority)) throw new Error(`Row ${rowNumber}: expected_priority must be low, medium, or high.`)
    return row
  })
}

export function loadLabelledComplaints(filePath, validCategories) {
  const source = readFileSync(filePath, 'utf-8')
  const extension = extname(filePath).toLowerCase()
  const parsed = extension === '.json' ? JSON.parse(source) : extension === '.csv' ? parseLabelledCsv(source) : null
  if (!parsed) throw new Error('Labelled data must be a .csv or .json file.')
  return validateLabelledComplaints(parsed, validCategories)
}

