import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { api } from "../api/client";
import { SOCKET_URL } from "../lib/socketUrl";

export interface AppNotification {
  id: number;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  reload: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

const MAX_NOTIFICATIONS = 50;

function sortByDateDesc(list: AppNotification[]) {
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const response = await api.get("/notifications");

      setNotifications((current) => {
        const merged = new Map<number, AppNotification>();

        (response.data as AppNotification[]).forEach((item) => {
          merged.set(item.id, item);
        });

        current.forEach((item) => {
          if (!merged.has(item.id)) {
            merged.set(item.id, item);
          }
        });

        return sortByDateDesc(Array.from(merged.values())).slice(
          0,
          MAX_NOTIFICATIONS,
        );
      });
    } catch (error) {
      console.error("Error al cargar notificaciones:", error);
      toast.error("No se pudieron cargar las notificaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return;
    }

    reload();

    const socket: Socket = io(SOCKET_URL, {
      auth: { token },
    });

    socket.on("connect", () => {
      reload();
    });

    socket.on("connect_error", (error) => {
      console.error("Error de conexión Socket.IO:", error.message);
    });

    socket.on("new_notification", (notification: AppNotification) => {
      setNotifications((current) => {
        if (current.some((item) => item.id === notification.id)) {
          return current;
        }

        return [notification, ...current].slice(0, MAX_NOTIFICATIONS);
      });

      toast("🔔 " + notification.content, {
        duration: 4000,
      });
    });

    return () => {
      socket.off("new_notification");
      socket.off("connect");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [reload]);

  const markAsRead = useCallback(async (id: number) => {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      ),
    );

    try {
      await api.patch(`/notifications/${id}/read`);
    } catch (error) {
      console.error(error);

      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, isRead: false } : item,
        ),
      );

      toast.error("No se pudo actualizar la notificación");
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    let previous: AppNotification[] = [];

    setNotifications((current) => {
      previous = current;
      return current.map((item) => ({
        ...item,
        isRead: true,
      }));
    });

    try {
      await api.patch("/notifications/read-all");
      toast.success("Todas las notificaciones están leídas");
    } catch (error) {
      console.error(error);
      setNotifications(previous);
      toast.error("No se pudieron actualizar las notificaciones");
    }
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      markAsRead,
      markAllAsRead,
      reload,
    }),
    [notifications, unreadCount, loading, markAsRead, markAllAsRead, reload],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error(
      "useNotifications debe usarse dentro de <NotificationsProvider>",
    );
  }

  return context;
}
