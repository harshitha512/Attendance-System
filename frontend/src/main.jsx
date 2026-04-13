import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode removed — it was causing every useEffect to fire twice in dev,
  // resulting in duplicate API calls (/auth/me x2, /attendance/summary/today x2).
  // This is normal StrictMode behavior but noisy during development.
  // You can re-add it before production if you want the extra checks.
  <BrowserRouter>
    <App />
    <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
  </BrowserRouter>
)