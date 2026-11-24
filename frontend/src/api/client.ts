import axios from "axios";

const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
const normalizedBaseUrl = rawApiUrl.replace(/\/+$/, "");
const apiBaseUrl = normalizedBaseUrl.endsWith("/api")
  ? normalizedBaseUrl
  : `${normalizedBaseUrl}/api`;

export const api = axios.create({
  baseURL: apiBaseUrl,
});

// Interceptor para añadir el token automáticamente en cada petición
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
