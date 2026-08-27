import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('MRWD interface error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="min-h-screen bg-gray-50 px-4 py-16 flex items-center justify-center">
        <section className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8" role="alert">
          <p className="text-sm font-bold text-red-700">Something went wrong</p>
          <h1 className="mt-2 font-display text-2xl font-black text-navy-900">This page could not be displayed.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Reload the application and try again. If you submitted a change just before this error, check the record after reloading before submitting it again. If the problem continues, contact the system administrator.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-primary rounded-lg" onClick={() => window.location.reload()}>
              Reload application
            </button>
            <button type="button" className="btn-secondary rounded-lg" onClick={() => { window.location.href = '/login' }}>
              Return to sign in
            </button>
          </div>
        </section>
      </main>
    )
  }
}
