import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { scorePriority } from '../../lib/priorityScoring'
import { COMPLAINT_TYPES } from '../../mock/data'
import { PriorityBadge } from '../../components/ui/Badges'

const schema = z.object({
  complaint_type: z.string().min(1, 'Select a complaint type'),
  description:    z.string().min(20, 'Please describe the issue in at least 20 characters'),
  address:        z.string().min(10, 'Enter the full address or location'),
})

export default function SubmitComplaintPage() {
  const user          = useAuthStore(s => s.user)
  const submitComplaint = useComplaintStore(s => s.submitComplaint)

  const [photo, setPhoto]         = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(null)
  const [priorityPreview, setPriorityPreview] = useState(null)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { complaint_type: '', description: '', address: '' },
  })

  // Live priority preview as user types
  const watchedType = watch('complaint_type')
  const watchedDesc = watch('description')

  const updatePreview = () => {
    if (watchedType && watchedDesc?.length >= 10) {
      const result = scorePriority({
        complaint_type: watchedType,
        description: watchedDesc,
        has_photo: !!photo,
      })
      setPriorityPreview(result)
    } else {
      setPriorityPreview(null)
    }
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const removePhoto = () => {
    setPhoto(null)
    setPhotoPreview(null)
  }

  const onSubmit = async (data) => {
    setSubmitting(true)
    try {
      const result = await submitComplaint({ ...data, photo }, user.id, user.full_name)
      setSubmitted(result)
      reset()
      setPhoto(null)
      setPhotoPreview(null)
      setPriorityPreview(null)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Complaint Submitted!</h2>
        <p className="text-gray-500 text-sm mb-6">
          Your complaint has been received and scored automatically.
        </p>
        <div className="card p-5 text-left mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 font-medium">Reference ID</span>
            <span className="text-xs font-mono text-gray-600">{submitted.id}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 font-medium">Type</span>
            <span className="text-xs text-gray-700">{submitted.complaint_type}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 font-medium">Priority</span>
            <PriorityBadge priority={submitted.priority} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Priority Score</span>
            <span className="text-xs font-semibold text-gray-700">{submitted.priority_score} / 100</span>
          </div>
        </div>
        <button onClick={() => setSubmitted(null)} className="btn-primary">
          Submit another complaint
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Submit a Complaint</h1>
        <p className="text-gray-500 text-sm mt-1">Fill in the details below. Your complaint will be scored and prioritized automatically.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} onChange={updatePreview} className="space-y-5">

        {/* Complaint Type */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Complaint Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Complaint type <span className="text-red-500">*</span></label>
              <select {...register('complaint_type')} className={`input-field ${errors.complaint_type ? 'input-error' : ''}`}>
                <option value="">Select complaint type</option>
                {COMPLAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.complaint_type && <p className="mt-1 text-xs text-red-600">{errors.complaint_type.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-red-500">*</span></label>
              <textarea
                rows={4}
                placeholder="Describe the issue in detail. Mention urgency, how long it's been happening, and how it affects you."
                {...register('description')}
                className={`input-field resize-none ${errors.description ? 'input-error' : ''}`}
              />
              {errors.description
                ? <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
                : <p className="mt-1 text-xs text-gray-400">{watchedDesc?.length || 0} characters</p>
              }
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Location</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Address / Location <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="e.g. 123 Rizal St., Brgy. San Jose, Calinog, Iloilo"
              {...register('address')}
              className={`input-field ${errors.address ? 'input-error' : ''}`}
            />
            {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>}
          </div>
        </div>

        {/* Photo */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Photo Attachment</h3>
          <p className="text-xs text-gray-400 mb-4">Optional — adding a photo increases priority score by +10</p>

          {photoPreview ? (
            <div className="relative inline-block">
              <img src={photoPreview} alt="Preview" className="w-40 h-40 object-cover rounded-lg border border-gray-200"/>
              <button type="button" onClick={removePhoto}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">
                ✕
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors">
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span className="text-sm text-gray-500">Click to upload a photo</span>
              <span className="text-xs text-gray-400 mt-0.5">PNG, JPG up to 5MB</span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange}/>
            </label>
          )}
        </div>

        {/* Priority preview */}
        {priorityPreview && (
          <div className={`card p-4 border-l-4 ${
            priorityPreview.priority === 'high'   ? 'border-l-red-500 bg-red-50' :
            priorityPreview.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                                                    'border-l-green-500 bg-green-50'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-gray-700">Estimated Priority</span>
              <PriorityBadge priority={priorityPreview.priority} />
              <span className="text-sm font-bold text-gray-600 ml-auto">Score: {priorityPreview.score}/100</span>
            </div>
            <div className="space-y-0.5">
              {priorityPreview.reasons.map((r, i) => (
                <p key={i} className="text-xs text-gray-500">• {r}</p>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp note */}
        <p className="text-xs text-gray-400">
          📅 Date and time will be recorded automatically when submitted: <span className="font-medium">{new Date().toLocaleString()}</span>
        </p>

        <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
          {submitting
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Submitting...</>
            : 'Submit Complaint'
          }
        </button>

      </form>
    </div>
  )
}
