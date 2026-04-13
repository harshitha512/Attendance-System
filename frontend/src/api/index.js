import axios from 'axios'

// FIX: relative URL so requests go through Vite proxy → localhost:5000
const API_BASE_URL = '/api';

// ✅ FIX 1: Create the axios instance (was missing — caused all `api.*` calls to crash)
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('authToken')
      localStorage.removeItem('adminInfo')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Helper function to get token from localStorage
export const getToken = () => {
  return localStorage.getItem('authToken');
};

// Fetch helper with auth token (used by App.jsx for /auth/me check)
export const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
};

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  // FIX: no-cache header prevents browser returning a cached 304 on page reload
  me: () => api.get('/auth/me', { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } }),
}

export const employeeAPI = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
  departments: () => api.get('/employees/departments'),
  registerFace: (id, formData) => api.post(`/employees/${id}/face`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  hasFace: (id) => api.get(`/employees/${id}/face`),
  deleteFace: (id) => api.delete(`/employees/${id}/face`),
}

export const attendanceAPI = {
  mark: (formData) => api.post('/attendance/mark', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  list: (params) => api.get('/attendance', { params }),
  todaySummary:    () => api.get('/attendance/summary/today'),
  getTodaySummary: () => api.get('/attendance/summary/today'),  // FIX: alias used by Attendance.jsx
  updateOT: (data) => api.put('/attendance/ot-update', data),
}

export const reportAPI = {
  get: (params) => api.get('/reports', { params }),
}

export default api