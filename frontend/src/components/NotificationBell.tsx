import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../api/client";
import { useNavigate } from "react-router-dom";
import { SOCKET_URL } from "../lib/socketUrl";

interface Notification {
  id: number;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) return;

    const loadUnreadCount = async () => {
      try {
        const response = await api.get("/notifications/unread-count");
        setUnreadCount(response.data.count);
      } catch (error) {
        console.error("Error al obtener notificaciones:", error);
      }
    };

    loadUnreadCount();

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("new_notification", (notification: Notification) => {
      if (!notification.isRead) {
        setUnreadCount((current) => current + 1);
      }
    });

    return () => {
      socket.off("new_notification");
      socket.disconnect();
    };
  }, []);

  return (
    <button
      onClick={() => navigate("/notifications")}
      className="relative flex items-center gap-2 text-gray-700 hover:text-blue-600"
      title="Ver notificaciones"
    >
      <span className="text-2xl">🔔</span>

      {unreadCount > 0 && (
        <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}

      <span className="hidden sm:inline">Notificaciones</span>
    </button>
  );
}
