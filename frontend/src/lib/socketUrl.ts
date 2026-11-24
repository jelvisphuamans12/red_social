const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) || "";
const normalizedApiUrl = rawApiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");

const rawSocketUrl =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) || "";
const normalizedSocketUrl = rawSocketUrl.replace(/\/$/, "");

export const SOCKET_URL =
  normalizedSocketUrl ||
  normalizedApiUrl ||
  (import.meta.env.DEV
    ? "http://localhost:4000"
    : "https://red-social-4zu8.onrender.com");
