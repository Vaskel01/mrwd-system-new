// ─────────────────────────────────────────────
// MOCK USERS — replace with real API auth later
// ─────────────────────────────────────────────
export const MOCK_USERS = [
  { id: 'u1', email: 'customer@demo.com',     password: 'demo1234', role: 'customer',     full_name: 'Juan dela Cruz' },
  { id: 'u2', email: 'admin@demo.com',        password: 'demo1234', role: 'admin',        full_name: 'Maria Santos' },
  { id: 'u3', email: 'maintenance@demo.com',  password: 'demo1234', role: 'maintenance',  full_name: 'Pedro Reyes' },
]

// ─────────────────────────────────────────────
// MOCK COMPLAINTS
// ─────────────────────────────────────────────
export const MOCK_COMPLAINTS = [
  {
    id: 'c1',
    customer_id: 'u1',
    customer_name: 'Juan dela Cruz',
    complaint_type: 'Water Interruption',
    description: 'No water supply since yesterday morning. Very urgent, we have elderly at home.',
    address: '123 Rizal St., Brgy. San Jose, Roxas City, Capiz',
    photo_url: null,
    status: 'pending',
    priority: 'high',
    priority_score: 85,
    assigned_to: null,
    assigned_name: null,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c2',
    customer_id: 'u1',
    customer_name: 'Juan dela Cruz',
    complaint_type: 'Water Leak',
    description: 'Dangerous pipe leak on the street near our house. Water is wasting.',
    address: '45 Mabini Ave., Brgy. Poblacion, Roxas City, Capiz',
    photo_url: null,
    status: 'in_progress',
    priority: 'high',
    priority_score: 78,
    assigned_to: 'u3',
    assigned_name: 'Pedro Reyes',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c3',
    customer_id: 'u1',
    customer_name: 'Juan dela Cruz',
    complaint_type: 'Billing Concern',
    description: 'My bill this month seems higher than usual. Please check my meter reading.',
    address: '78 Luna St., Brgy. Agboy Norte, Roxas City, Capiz',
    photo_url: null,
    status: 'completed',
    priority: 'low',
    priority_score: 20,
    assigned_to: 'u3',
    assigned_name: 'Pedro Reyes',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c4',
    customer_id: 'u1',
    customer_name: 'Ana Reyes',
    complaint_type: 'Low Water Pressure',
    description: 'Water pressure is very low every morning. Hard to take a bath.',
    address: '12 Bonifacio St., Brgy. Lico, Roxas City, Capiz',
    photo_url: null,
    status: 'pending',
    priority: 'medium',
    priority_score: 45,
    assigned_to: null,
    assigned_name: null,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

export const MAINTENANCE_STAFF = MOCK_USERS.filter(u => u.role === 'maintenance')

// ─────────────────────────────────────────────
// MOCK ANNOUNCEMENTS
// ─────────────────────────────────────────────
export const MOCK_ANNOUNCEMENTS = [
  {
    id: 'a1',
    title: 'Scheduled Water Interruption – June 15',
    content: 'Please be informed that there will be a scheduled water interruption on June 15, 2025 from 8:00 AM to 5:00 PM in Barangays San Jose, Poblacion, and Agboy Norte due to pipe replacement works. Please store enough water before the said date. We apologize for the inconvenience.',
    category: 'interruption',
    created_by: 'Maria Santos',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'a2',
    title: 'Office Hours Reminder',
    content: 'The Water District office is open Monday to Friday, 8:00 AM – 5:00 PM. For urgent concerns outside office hours, please call our 24/7 hotline at (033) 123-4567.',
    category: 'general',
    created_by: 'Maria Santos',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'a3',
    title: 'Water Rate Adjustment Effective July 2025',
    content: 'In compliance with the approved resolution, water rates will be adjusted starting July 1, 2025. The new minimum charge for residential consumers is ₱180.00 for the first 10 cubic meters. Please visit our office or website for the full rate schedule.',
    category: 'billing',
    created_by: 'Maria Santos',
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

export const ANNOUNCEMENT_CATEGORIES = [
  { value: 'general',      label: 'General',       color: 'bg-blue-100 text-blue-700' },
  { value: 'interruption', label: 'Interruption',  color: 'bg-red-100 text-red-700' },
  { value: 'billing',      label: 'Billing',       color: 'bg-yellow-100 text-yellow-800' },
  { value: 'maintenance',  label: 'Maintenance',   color: 'bg-purple-100 text-purple-700' },
  { value: 'advisory',     label: 'Advisory',      color: 'bg-green-100 text-green-700' },
]

// ─────────────────────────────────────────────
// MOCK BILLING STATEMENTS
// ─────────────────────────────────────────────
export const MOCK_BILLING = [
  {
    id: 'b1',
    customer_id: 'u1',
    billing_period: 'May 2025',
    previous_reading: 120,
    current_reading:  138,
    consumption:      18,
    amount_due:       320.50,
    due_date:         '2025-06-15',
    status:           'unpaid',
    issued_at:        new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'b2',
    customer_id: 'u1',
    billing_period: 'April 2025',
    previous_reading: 103,
    current_reading:  120,
    consumption:      17,
    amount_due:       298.00,
    due_date:         '2025-05-15',
    status:           'paid',
    issued_at:        new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'b3',
    customer_id: 'u1',
    billing_period: 'March 2025',
    previous_reading: 88,
    current_reading:  103,
    consumption:      15,
    amount_due:       265.00,
    due_date:         '2025-04-15',
    status:           'paid',
    issued_at:        new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'b4',
    customer_id: 'u1',
    billing_period: 'February 2025',
    previous_reading: 71,
    current_reading:  88,
    consumption:      17,
    amount_due:       298.00,
    due_date:         '2025-03-15',
    status:           'paid',
    issued_at:        new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

export const COMPLAINT_TYPES = [
  'Water Interruption',
  'Water Leak',
  'Low Water Pressure',
  'Dirty / Discolored Water',
  'Billing Concern',
  'Meter Problem',
  'New Connection Request',
  'Other',
]
