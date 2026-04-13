import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { attendanceAPI } from '../api'
import { CheckCircle, XCircle, Camera, Clock } from 'lucide-react'
import { fmtTime } from '../utils'
import toast from 'react-hot-toast'

// FIXES:
// 1. processingRef replaces `processing` as the guard inside process().
//    Using state for the guard meant `processing` had to be in useCallback's
//    dep array → every scan created a new function reference → the interval
//    useEffect tore down and restarted on every scan cycle. Auto-mode was
//    constantly resetting itself. Manual "Scan Now" could get stuck.
//
// 2. processingRef also solves the stale-closure bug: the old code read a
//    snapshot of `processing` that was already stale by the time the async
//    scan finished, allowing overlapping scans.
//
// 3. Added width/height to videoConstraints (640×480). Without this the
//    webcam defaults to full camera resolution (often 1280×720 or higher),
//    making each screenshot larger and slowing down the face service.

const VIDEO_CONSTRAINTS = { facingMode: 'user', width: 640, height: 480 }

export default function LiveAttendance() {
  const webcamRef    = useRef(null)
  const intervalRef  = useRef(null)
  // FIX 1 & 2: use a ref for the processing guard — not state
  const processingRef = useRef(false)

  const [active, setActive]       = useState(false)
  const [processing, setProcessing] = useState(false) // kept only for UI display
  const [result, setResult]       = useState(null)
  const [autoMode, setAutoMode]   = useState(false)
  const [camReady, setCamReady]   = useState(false)

  const process = useCallback(async () => {
    if (processingRef.current || !webcamRef.current || !camReady) return

    // getScreenshot() returns null if the video hasn't rendered its first
    // frame yet - even after onUserMedia fires. readyState 4 (HAVE_ENOUGH_DATA)
    // means the video is actually painting frames and screenshots will work.
    const video = webcamRef.current.video
    if (!video || video.readyState < 4) {
      toast.error('Camera warming up - try again in a moment')
      return
    }

    const imgSrc = webcamRef.current.getScreenshot()
    if (!imgSrc) {
      toast.error('Failed to capture - try again')
      return
    }

    processingRef.current = true
    setProcessing(true)

    try {
      const blob = await fetch(imgSrc).then(r => r.blob())
      const formData = new FormData()
      formData.append('image', blob, 'frame.jpg')

      const res = await attendanceAPI.mark(formData)
      const d = res.data

      setResult({
        success: true,
        action: d.action,
        name: d.employee?.name,
        code: d.employee?.code,
        time: d.attendance?.check_in || d.attendance?.check_out,
        isLate: d.attendance?.is_late,
      })

      toast.success(
        `${d.action === 'CHECK_IN' ? 'Checked IN' : 'Checked OUT'}: ${d.employee?.name}`
      )
    } catch (err) {
      const msg = err.response?.data?.message || 'Recognition failed'
      setResult({ success: false, message: msg })
    } finally {
      // FIX 2: reset ref first so the next scan isn't blocked by a stale true
      processingRef.current = false
      setProcessing(false)
    }
  // FIX 1: `processing` removed from deps — only camReady matters here
  }, [camReady])

  // Interval — stable: only recreated when autoMode, active, or process changes.
  // process() only changes when camReady changes, not on every scan cycle.
  useEffect(() => {
    if (autoMode && active) {
      intervalRef.current = setInterval(process, 4000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoMode, active, process])

  useEffect(() => {
    if (!active) {
      setAutoMode(false)
      setCamReady(false)
      processingRef.current = false
      setProcessing(false)
      clearInterval(intervalRef.current)
    }
  }, [active])

  return (

      <div className="p-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-100">Live Attendance</h1>
            <p className="text-sm text-slate-500 mt-1">Face recognition check-in / check-out</p>
          </div>

          <div className="card overflow-hidden">
            {/* Camera feed */}
            <div className="relative bg-navy-950 aspect-video">
              {active ? (
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.85}
                  videoConstraints={VIDEO_CONSTRAINTS}
                  onUserMedia={() => {
                    // Wait for the first frame to be painted before marking ready.
                    // Without this, getScreenshot() returns null on the first call.
                    const checkReady = () => {
                      const vid = webcamRef.current?.video
                      if (vid && vid.readyState >= 4) {
                        setCamReady(true)
                      } else {
                        setTimeout(checkReady, 100)
                      }
                    }
                    checkReady()
                  }}
                  onUserMediaError={(err) => {
                    console.error(err)
                    toast.error('Camera access denied')
                    setActive(false)
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-slate-600">
                    <Camera size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Camera is off</p>
                  </div>
                </div>
              )}

              {active && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="flex items-center justify-center h-full">
                    <div className="w-56 h-64 border-2 border-amber-400/60 rounded-3xl" />
                  </div>
                  {processing && (
                    <div className="absolute top-3 right-3 bg-amber-400 text-navy-950 text-xs font-semibold px-3 py-1 rounded-full animate-pulse">
                      Scanning…
                    </div>
                  )}
                  {!camReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-navy-950/60">
                      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="p-4 border-t border-navy-700 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => { setActive(a => !a); setResult(null) }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors
                    ${active ? 'bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-800/50'
                             : 'btn-primary'}`}
                >
                  <Camera size={16} />
                  {active ? 'Stop Camera' : 'Start Camera'}
                </button>

                {active && (
                  <button
                    onClick={process}
                    disabled={processing || !camReady}
                    className="flex-1 btn-ghost flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} />
                    {processing ? 'Scanning…' : 'Scan Now'}
                  </button>
                )}
              </div>

              {active && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => setAutoMode(m => !m)}
                    className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0
                      ${autoMode ? 'bg-amber-500' : 'bg-navy-700'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
                      ${autoMode ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <span className="text-sm text-slate-400">
                    Auto-scan every 4 seconds
                    {autoMode && <span className="text-amber-400 ml-2">● active</span>}
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`card border ${result.success
              ? 'border-emerald-800/50 bg-emerald-900/20'
              : 'border-red-800/50 bg-red-900/20'}`}>
              {result.success ? (
                <div className="flex gap-4 items-center p-1">
                  <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={24} className="text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-100">{result.name}</p>
                    <p className="text-sm text-slate-400 font-mono">{result.code}</p>
                    <div className="flex gap-3 mt-1.5 flex-wrap">
                      <span className={result.action === 'CHECK_IN' ? 'badge-present' : 'badge-active'}>
                        {result.action === 'CHECK_IN' ? 'Checked IN' : 'Checked OUT'}
                      </span>
                      <span className="text-sm text-slate-400 flex items-center gap-1">
                        <Clock size={12} /> {fmtTime(result.time)}
                      </span>
                      {result.isLate && <span className="badge-late">Late</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-4 items-center p-1">
                  <XCircle size={36} className="text-red-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-300">Recognition Failed</p>
                    <p className="text-sm text-slate-400">{result.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card p-3 bg-amber-900/10 border-amber-900/30">
            <p className="text-xs text-amber-600/80">
              <strong className="text-amber-500">Tips:</strong> Good lighting · Face straight · No mask · Avoid backlight
            </p>
          </div>
        </div>
      </div>

  )
}
