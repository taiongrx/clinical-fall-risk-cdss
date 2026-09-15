import axios from 'axios';

const getBaseURL = () => {
  // 1. Build-time Vite environment variable (if specified during build)
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim() !== '') {
    return import.meta.env.VITE_API_URL.trim();
  }
  // 2. Runtime global injection (if injected via reverse proxy / index.html)
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.API_URL) {
    return window.__RUNTIME_CONFIG__.API_URL;
  }
  // 3. Dynamic origin fallback based on browser address
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Standard web reverse proxy port (80 or 443) -> route through /api
    if (!port || port === '80' || port === '443') {
      return `${protocol}//${hostname}/api`;
    }
    // Direct Docker host access (Frontend on port 3030 -> Backend on port 8000)
    return `${protocol}//${hostname}:8000/api`;
  }
  return 'http://localhost:8000/api';
};

const TOKEN_KEY = 'saiburi_fallrisk_jwt';
const USER_KEY = 'saiburi_fallrisk_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

export const getUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};
export const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
export const removeUser = () => localStorage.removeItem(USER_KEY);

export const clearAuth = () => {
  removeToken();
  removeUser();
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Automatically inject Bearer JWT
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If token expired or invalid, clear local auth
      const isLoginReq = error.config && error.config.url && error.config.url.includes('/auth/login');
      if (!isLoginReq) {
        clearAuth();
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

// Authentication Endpoints
export const login = async (username, password) => {
  const response = await api.post('/auth/login', { username, password });
  if (response.data?.access_token) {
    setToken(response.data.access_token);
    setUser(response.data.user);
  }
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  if (response.data) {
    setUser(response.data);
  }
  return response.data;
};

export const getLoginLogs = async (limit = 50) => {
  const response = await api.get('/auth/logs', { params: { limit } });
  return response.data;
};

export const logout = () => {
  clearAuth();
  window.dispatchEvent(new Event('auth:logout'));
};

export const predictFallRisk = async (hn, options = {}) => {
  const response = await api.post('/predict', { hn, ...options });
  return response.data;
};

export const getPatientProfile = async (hn) => {
  const response = await api.get(`/patient/${hn}/profile`);
  return response.data;
};

export const batchScreenElderly = async (payload = {}) => {
  const response = await api.post('/batch-screen-elderly', payload);
  return response.data;
};

export const getHighRiskWatchlist = async () => {
  const response = await api.get('/high-risk-patients');
  return response.data;
};

export const getLiveAlerts = async (limit = 15) => {
  const response = await api.get('/live-alerts', { params: { limit } });
  return response.data;
};

export const getLiveTriage = async (params = {}) => {
  const response = await api.get('/live-triage', { params });
  return response.data;
};

export const getAssessments = async (params = {}) => {
  const response = await api.get('/assessments', { params });
  return response.data;
};

export const recordOutcome = async (outcomeData) => {
  const response = await api.post('/outcomes', outcomeData);
  return response.data;
};

export const triggerRetraining = async (payload = {}) => {
  const response = await api.post('/retrain', payload);
  return response.data;
};

export const getModelVersions = async () => {
  const response = await api.get('/models');
  return response.data;
};

export const activateModel = async (version) => {
  const response = await api.post(`/models/${version}/activate`);
  return response.data;
};

export const getPlatformStats = async () => {
  const response = await api.get('/stats');
  return response.data;
};

export const getHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

export const getDaemonStatus = async () => {
  const response = await api.get('/daemon/status');
  return response.data;
};

export const getHosxpDateSummary = async () => {
  const response = await api.get('/hosxp/date-summary');
  return response.data;
};

// WHO-ATC Code Mapping & Drug Formulary API
export const searchAtcApi = async (query, genericName = '') => {
  const response = await api.get('/atc/search', {
    params: { query, generic_name: genericName }
  });
  return response.data;
};

export const acceptAtcMapping = async (mappingData) => {
  const response = await api.post('/atc/accept-mapping', mappingData);
  return response.data;
};

export const getAtcFormulary = async (params = {}) => {
  const response = await api.get('/atc/formulary', { params });
  return response.data;
};

export const updateDrugTmt = async (tmtData) => {
  const response = await api.post('/atc/update-tmt', tmtData);
  return response.data;
};

export const syncTmtFromHis = async () => {
  const response = await api.post('/atc/sync-tmt-from-his');
  return response.data;
};

export const autoResolveTmtToAtc = async (options = {}) => {
  const response = await api.post('/atc/auto-resolve-tmt', options);
  return response.data;
};

export const getAutoResolveProgress = async () => {
  const response = await api.get('/atc/auto-resolve-progress');
  return response.data;
};

export const getTmtSummary = async () => {
  const response = await api.get('/atc/tmt-summary');
  return response.data;
};


// Lift Analysis & Threshold Calibration API
export const getLiftAnalysis = async () => {
  const response = await api.get('/analytics/lift-analysis');
  return response.data;
};

export const simulateThreshold = async (threshold) => {
  const response = await api.post('/analytics/simulate-threshold', { threshold });
  return response.data;
};

export const setHospitalThreshold = async (threshold, reason = '') => {
  const response = await api.post('/analytics/set-hospital-threshold', { threshold, reason });
  return response.data;
};

export default api;

