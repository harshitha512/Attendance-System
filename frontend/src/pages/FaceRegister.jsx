import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { employeeAPI } from '../api'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Camera, Trash2, User, RefreshCw } from 'lucide-react'

export default function FaceRegister() {
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('emp')

  const webcamRef = useRef(null)

  const [employees, setEmployees]   = useState([])
  // BUG FIX #1: keep selectedEmp as string throughout — select values are always strings
  const [selectedEmp, setSelectedEmp] = useState('')
  const [capturing, setCapturing]   = useState(false)
  const [captured, setCaptured]     = useState(null)
  const [faceInfo, setFaceInfo]     = useState(null)
  const [loading, setLoading]       = useState(false)
  // BUG FIX #2: reset camReady when camera stops
  const [camReady, setCamReady]     = useState(false)

  // Load employees
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const res = await employeeAPI.list({ limit: 200, status: 'active' })
        const list = res.data?.data || []
        setEmployees(list)

        // BUG FIX #6: only preselect if the employee actually exists in the list
        if (preselectedId) {
          const exists = list.some(e => e.id === preselectedId)
          if (exists) {
            setSelectedEmp(preselectedId)
          } else {
            toast.error('Employee from URL not found')
          }
        }
      } catch (err) {
        console.error(err)
        toast.error('Failed to load employees')
      }
    }
    loadEmployees()
  }, [preselectedId])

  // Check face info whenever selected employee changes
  useEffect(() => {
    if (!selectedEmp) {
      setFaceInfo(null)
      return
    }
    const checkFace = async () => {
      try {
        const r = await employeeAPI.hasFace(selectedEmp)
        setFaceInfo(r.data)
      } catch (err) {
        console.error(err)
        toast.error('Failed to fetch face info')
      }
    }
    checkFace()
  }, [selectedEmp])

  // Auto-start camera when employee is selected
  useEffect(() => {
    if (selectedEmp) {
      setCapturing(true)
      setCaptured(null)
    }
  }, [selectedEmp])

  // BUG FIX #2: reset camReady when camera is stopped/unmounted
  const stopCamera = () => {
    setCapturing(false)
    setCamReady(false)
  }

  // BUG FIX #3: retry screenshot once if first attempt returns null (race condition)
  const capture = useCallback(() => {
    if (!camReady) {
      toast.error('Camera not ready')
      return
    }

    const tryCapture = (attemptsLeft) => {
      const img = webcamRef.current?.getScreenshot()
      if (img) {
        setCaptured(img)
        stopCamera()
        return
      }
      if (attemptsLeft > 0) {
        setTimeout(() => tryCapture(attemptsLeft - 1), 200)
      } else {
        toast.error('Failed to capture image — please try again')
      }
    }

    tryCapture(2)
  }, [camReady])

  // Register face
  const handleRegister = async () => {
    if (!selectedEmp || !captured) {
      toast.error('Select employee and capture photo')
      return
    }
    setLoading(true)
    try {
      const blob = await fetch(captured).then(r => r.blob())
      const formData = new FormData()
      formData.append('image', blob, 'face.jpg')

      await employeeAPI.registerFace(selectedEmp, formData)
      toast.success('Face registered successfully!')

      setCaptured(null)
      // BUG FIX #4: stop camera after successful registration
      stopCamera()

      const r = await employeeAPI.hasFace(selectedEmp)
      setFaceInfo(r.data)
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  // Delete face
  const handleDeleteFace = async () => {
    if (!window.confirm('Remove face registration for this employee?')) return
    try {
      await employeeAPI.deleteFace(selectedEmp)
      toast.success('Face removed')
      // BUG FIX #5: refetch instead of hardcoding partial object
      const r = await employeeAPI.hasFace(selectedEmp)
      setFaceInfo(r.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove face')
    }
  }

  const selectedEmpData = employees.find(e => e.id === selectedEmp)

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Face Registration</h1>
        <p className="text-sm text-gray-500">Register employee face for attendance recognition</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* LEFT */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <User size={18} /> Select Employee
            </h2>

            <select
              className="input"
              value={selectedEmp}
              onChange={e => {
                // BUG FIX #1: store as string — no Number() conversion needed
                setSelectedEmp(e.target.value)
                setCaptured(null)
                setFaceInfo(null)
                setCamReady(false)
              }}
            >
              <option value="">— Choose employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_code})
                </option>
              ))}
            </select>

            {selectedEmpData && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                <p className="font-semibold text-blue-800">{selectedEmpData.full_name}</p>
                <p className="text-blue-600">
                  {selectedEmpData.department} · {selectedEmpData.designation}
                </p>
              </div>
            )}

            {faceInfo && (
              <div className={`mt-3 p-3 rounded-lg flex justify-between items-center ${faceInfo.has_face ? 'bg-green-50' : 'bg-gray-50'}`}>
                <span className="text-sm">
                  {faceInfo.has_face ? '✓ Face already registered' : 'No face registered'}
                </span>
                {faceInfo.has_face && (
                  <button onClick={handleDeleteFace} className="btn-danger btn-sm">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {captured && (
            <div className="card">
              <img src={captured} alt="Captured" className="w-full rounded-lg" />
              <div className="flex gap-3 mt-4">
                <button onClick={() => { setCaptured(null); setCapturing(true); setCamReady(false) }}
                  className="btn-secondary flex-1 flex items-center gap-1.5 justify-center">
                  <RefreshCw size={16} /> Retake
                </button>
                <button
                  onClick={handleRegister}
                  disabled={loading || !selectedEmp}
                  className="btn-primary flex-1"
                >
                  {loading ? 'Registering…' : 'Register Face'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="card">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Camera size={18} /> Webcam
          </h2>

          <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
            {capturing ? (
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                onUserMedia={() => setCamReady(true)}
                onUserMediaError={(err) => {
                  console.error(err)
                  toast.error('Camera access denied')
                  // BUG FIX #2: reset camReady on error too
                  stopCamera()
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                {captured ? 'Photo captured' : 'Camera not started'}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            {!capturing ? (
              <button
                onClick={() => { setCapturing(true); setCamReady(false) }}
                className="btn-primary flex-1"
                disabled={!selectedEmp}
              >
                Start Camera
              </button>
            ) : (
              <>
                <button onClick={stopCamera} className="btn-secondary">
                  Stop
                </button>
                <button
                  onClick={capture}
                  disabled={!camReady}
                  className="btn-primary flex-1"
                >
                  {camReady ? 'Capture' : 'Starting…'}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}