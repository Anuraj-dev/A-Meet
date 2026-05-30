import axios from 'axios';

// In dev the Vite proxy rewrites /api → localhost:5000, so we use a relative
// path. In production (Vercel) the React app is on a different origin than the
// EC2 API, so we use the full API URL from the env var.
const baseURL = import.meta.env.VITE_SERVER_URL
  ? `${import.meta.env.VITE_SERVER_URL}/api`
  : '/api';

const api = axios.create({ baseURL, withCredentials: true });

export default api;
