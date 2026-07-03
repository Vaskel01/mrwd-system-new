import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// ── SVG Wave Divider ──────────────────────────────────────────
function Wave({ fill = '#ffffff', flip = false }) {
  return (
    <div className={`w-full overflow-hidden leading-none ${flip ? 'rotate-180' : ''}`} style={{ marginBottom: '-2px' }}>
      <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-16 md:h-20">
        <path
          d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"
          fill={fill}
        />
      </svg>
    </div>
  )
}

// ── Step Card ─────────────────────────────────────────────────
function StepCard({ number, icon, title, description }) {
  return (
    <div className="flex flex-col items-center text-center px-6">
      <div className="relative mb-5">
        <div className="w-16 h-16 rounded-2xl bg-navy-800 flex items-center justify-center shadow-lg shadow-gold-500/30 text-3xl">
          {icon}
        </div>
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-400 text-navy-900 text-xs font-black flex items-center justify-center">
          {number}
        </span>
      </div>
      <h3 className="font-display font-bold text-gray-900 text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed max-w-[200px]">{description}</p>
    </div>
  )
}

// ── Feature Pill ──────────────────────────────────────────────
function FeaturePill({ icon, label }) {
  return (
    <div className="flex items-center gap-2.5 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  )
}

// ── Main Landing Page ─────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)

  const ROLE_HOME = {
    customer:    '/customer/submit',
    admin:       '/admin/dashboard',
    maintenance: '/maintenance/tasks',
  }

  const handleCTA = () => {
    if (user) navigate(ROLE_HOME[user.role] || '/login')
    else navigate('/login')
  }

  return (
    <div className="min-h-screen font-sans bg-white">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-white/10" style={{ background: 'linear-gradient(135deg, rgba(15,34,64,.97), rgba(27,51,102,.97))' }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
              </svg>
            </div>
            <div>
              <span className="font-display font-bold text-white text-sm leading-none block">Metro Roxas Water District</span>
              <span className="text-navy-300 text-xs">Complaint Management</span>
            </div>
          </div>
          <button
            onClick={handleCTA}
            className="bg-navy-800 hover:bg-navy-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {user ? 'Go to Dashboard' : 'Sign In'}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="page-band pt-24 sm:pt-32 pb-4 px-5 relative overflow-hidden">

        {/* Background glow blobs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-gold-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-64 h-64 bg-gold-300/10 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">

          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20  px-4 py-1.5 mb-8 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-navy-300 text-xs font-medium tracking-wide">Metro Roxas Water District — Online Services</span>
          </div>

          {/* Headline */}
          <h1 className="font-display font-extrabold text-white text-5xl md:text-6xl leading-tight mb-6">
            Report Water
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-100">
              Problems Easily.
            </span>
          </h1>

          <p className="text-navy-300 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
            Submit your water complaints online in just a few steps.
            No need to go to the office — track your concern from home.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-14">
            <button
              onClick={handleCTA}
              className="bg-navy-800 hover:bg-navy-700 active:bg-navy-900 text-white font-display font-bold text-lg px-8 py-4 rounded-xl transition-all shadow-lg shadow-gold-500/30 hover:shadow-gold-400/40 hover:scale-105 w-full sm:w-auto"
            >
              Submit a Complaint
            </button>
            <button
              onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold text-base px-8 py-4 rounded-xl transition-colors border border-white/20 w-full sm:w-auto"
            >
              How It Works ↓
            </button>
          </div>

          {/* Floating stat cards */}
          <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-8">
            {[
              { number: '3',       label: 'Easy Steps' },
              { number: '24/7',    label: 'Available' },
              { number: '100%',    label: 'Free to Use' },
            ].map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl py-3 px-2">
                <div className="font-display font-extrabold text-white text-2xl">{s.number}</div>
                <div className="text-navy-300 text-xs font-medium">{s.label}</div>
              </div>
            ))}
          </div>

        </div>

        {/* Animated water droplets decoration */}
        <div className="absolute bottom-24 left-8 text-white/10 text-7xl select-none animate-float" style={{ animationDelay: '0s' }}>💧</div>
        <div className="absolute bottom-32 right-12 text-white/10 text-5xl select-none animate-float" style={{ animationDelay: '2s' }}>💧</div>

      </section>

      {/* Wave divider */}
      <Wave fill="#ffffff" />

      {/* ── How It Works ── */}
      <section id="how-it-works" className="bg-white py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-gold-600 text-sm font-bold uppercase tracking-widest">Simple Process</span>
            <h2 className="font-display font-extrabold text-gray-900 text-4xl mt-2">
              How It Works
            </h2>
            <p className="text-gray-500 mt-3 text-lg max-w-lg mx-auto">
              Three easy steps and your complaint is on its way to being resolved.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-8 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-0.5 bg-gradient-to-r from-gold-200 via-gold-400 to-gold-200" />

            <StepCard number="1" icon="🔐" title="Sign In"
              description="Log in with your account. Don't have one? Contact Metro Roxas Water District office." />
            <StepCard number="2" icon="📝" title="Report the Problem"
              description="Fill in a short form. Describe the issue, add your location, and attach a photo if you have one." />
            <StepCard number="3" icon="✅" title="We Handle It"
              description="Your complaint is automatically scored by urgency and assigned to our maintenance team." />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-white py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-gold-600 text-sm font-bold uppercase tracking-widest">What You Get</span>
            <h2 className="font-display font-extrabold text-gray-900 text-4xl mt-2">
              Everything You Need
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <FeaturePill icon="⚡" label="Auto Priority Scoring" />
            <FeaturePill icon="📸" label="Photo Attachments" />
            <FeaturePill icon="📍" label="Location Tracking" />
            <FeaturePill icon="🔔" label="Status Updates" />
            <FeaturePill icon="📊" label="Admin Dashboard" />
            <FeaturePill icon="💧" label="Billing Statements" />
            <FeaturePill icon="📢" label="Announcements" />
            <FeaturePill icon="🔒" label="Secure Login" />
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="px-5 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="page-band rounded-3xl px-8 py-10 sm:py-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-navy-950/60 to-navy-950 pointer-events-none" />
            <div className="absolute -top-10 -right-10 w-60 h-60 bg-gold-400/15 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <h2 className="font-display font-extrabold text-white text-4xl mb-4">
                Have a water problem?
              </h2>
              <p className="text-navy-300 text-lg mb-8 max-w-lg mx-auto">
                Don't wait in line. Report it online and we'll take care of it as fast as possible.
              </p>
              <button
                onClick={handleCTA}
                className="inline-flex items-center gap-2 bg-white text-navy-900 font-display font-extrabold text-lg px-10 py-4 rounded-xl hover:bg-navy-50 transition-colors shadow-xl hover:scale-105 active:scale-100 transition-transform"
              >
                Report Now
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="page-band border-t border-white/10 py-10 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-navy-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
                </svg>
              </div>
              <div>
                <p className="font-display font-bold text-white text-sm">Metro Roxas Water District</p>
                <p className="text-navy-300 text-xs">Complaint Management System</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <p className="text-navy-300 text-sm">📞 Hotline: <span className="text-white font-medium">(033) 123-4567</span></p>
              <p className="text-navy-400 text-xs">Mon – Fri · 8:00 AM – 5:00 PM</p>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleCTA}
                className="bg-navy-800 hover:bg-navy-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
                {user ? 'Go to Dashboard' : 'Sign In'}
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 mt-8 pt-6 text-center">
            <p className="text-navy-400 text-xs">
              © 2025 Metro Roxas Water District · All rights reserved
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}
