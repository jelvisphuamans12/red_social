import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import toast from "react-hot-toast";

export interface NotificationItem {
  id: number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  actor?: {
    id: number;
    name: string;
    avatarUrl?: string | null;
  } | null;
  postId?: number | null;
}

interface NotificationsPanelProps {
  onGoToFeed?: () => void;
  onGoToChat?: () => void;
  onOpenFriends?: () => void;
}

const API_URL = "http://localhost:4000";

function getAvatarUrl(url?: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export default function NotificationsPanel({
  onGoToFeed,
  onGoToChat,
  onOpenFriends,
}: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.notifications || [];
      setNotifications(list);
    } catch (error) {
      console.error("Error al cargar notificaciones:", error);
      toast.error("No se pudieron cargar las notificaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // Mantiene el estado optimista si la ruta difiere en el backend
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.patch("/notifications/read-all");
      toast.success("Todas las notificaciones marcadas como leídas");
    } catch (error) {
      console.error("Error al marcar todas como leídas:", error);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.read) {
      await markAsRead(item.id);
    }

    const typeUpper = (item.type || "").toUpperCase();
    if (typeUpper.includes("MESSAGE") || typeUpper.includes("CHAT")) {
      onGoToChat?.();
    } else if (typeUpper.includes("FRIEND")) {
      onOpenFriends?.();
    } else {
      onGoToFeed?.();
    }
  };

  const visibleList =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="bg-[#192734] rounded-2xl border border-[#253341] overflow-hidden min-h-[calc(100vh-110px)] flex flex-col">
      <div className="px-5 py-4 border-b border-[#38444d] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            Notificaciones
            {unreadCount > 0 && (
              <span className="text-xs bg-sky-500 text-white px-2.5 py-0.5 rounded-full font-bold">
                {unreadCount} nuevas
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Actividad reciente de tus publicaciones, amistades y mensajes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-[#15202b] p-1 rounded-full border border-[#38444d] text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-full font-semibold transition ${
                filter === "all"
                  ? "bg-sky-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`px-3 py-1 rounded-full font-semibold transition ${
                filter === "unread"
                  ? "bg-sky-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              No leídas ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 px-3 py-1.5 rounded-full hover:bg-[#253341] transition"
            >
              Marcar todas como leídas
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 divide-y divide-[#38444d]">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            Cargando notificaciones...
          </div>
        ) : visibleList.length === 0 ? (
          <div className="py-16 text-center text-gray-400 px-4">
            <div className="text-4xl mb-3">🔔</div>
            <p className="font-bold text-white text-base">
              {filter === "unread"
                ? "No tienes notificaciones sin leer"
                : "Aún no tienes notificaciones"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Cuando alguien reaccione, comente o te envíe un mensaje, aparecerá
              aquí.
            </p>
          </div>
        ) : (
          visibleList.map((item) => {
            const actorName = item.actor?.name || "Usuario";
            const avatarSrc = getAvatarUrl(item.actor?.avatarUrl);
            const initials = actorName
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("");

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNotificationClick(item)}
                className={`w-full text-left px-5 py-4 flex items-start gap-3.5 transition hover:bg-[#253341]/70 ${
                  !item.read ? "bg-sky-500/5" : ""
                }`}
              >
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={actorName}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                    {initials || "🔔"}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-100 leading-snug">
                    <span className="font-bold text-white">{actorName} </span>
                    {item.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(item.createdAt).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {!item.read && (
                  <span
                    title="No leída"
                    className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0 mt-2"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
    