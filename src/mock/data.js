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
    address: '123 Rizal St., Brgy. San Jose, Calinog, Iloilo',
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
    address: '45 Mabini Ave., Brgy. Poblacion, Calinog, Iloilo',
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
    address: '78 Luna St., Brgy. Agboy Norte, Calinog, Iloilo',
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
    address: '12 Bonifacio St., Brgy. Lico, Calinog, Iloilo',
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
