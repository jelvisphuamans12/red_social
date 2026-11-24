import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api/client';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Notification {
  id: number;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  userId?: number;
  relatedId?: number | null;
  relatedType?: string | null;
}

type FriendAction = 'accept' | 'reject';

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<number[]>([]);

  const navigate = useNavigate();

  // Cargar notificaciones desde la base de datos
  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications');

      const incoming: Notification[] = Array.isArray(response.data)
        ? response.data
        : [];

      setNotifications(current => {
        const combined = new Map<number, Notification>();

        incoming.forEach(item => {
          combined.set(item.id, item);
        });

        // Conservar notificaciones recibidas por Socket.IO
        // que todavía no estén en la respuesta del servidor.
        current.forEach(item => {
          if (!combined.has(item.id)) {
            combined.set(item.id, item);
          }
        });

        return Array.from(combined.values()).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        );
      });
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
      toast.error('No se pudieron cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  // Conectar con Socket.IO
  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      toast.error('Debes iniciar sesión');
      navigate('/login');
      return;
    }

    const socket = io('http://localhost:4000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Conectado al servidor de notificaciones');
    });

    socket.on('connect_error', error => {
      console.error('Error de conexión Socket.IO:', error.message);
    });

    socket.on('new_notification', (notification: Notification) => {
      setNotifications(current => {
        const existing = current.find(
          item => item.id === notification.id
        );

        if (existing) {
          return current;
        }

        return [notification, ...current];
      });

      toast.success('¡Tienes una nueva notificación!');
    });

    loadNotifications();

    return () => {
      socket.off('new_notification');
      socket.disconnect();
    };
  }, [navigate, loadNotifications]);

  // Marcar una notificación como leída
  const markAsRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);

      setNotifications(current =>
        current.map(item =>
          item.id === id
            ? { ...item, isRead: true }
            : item
        )
      );
    } catch (error) {
      console.error('Error al marcar como leída:', error);
      toast.error('No se pudo actualizar la notificación');
    }
  };

  // Marcar todas como leídas
  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');

      setNotifications(current =>
        current.map(item => ({
          ...item,
          isRead: true,
        }))
      );

      toast.success('Todas las notificaciones están leídas');
    } catch (error) {
      console.error('Error al marcar todas como leídas:', error);
      toast.error('No se pudieron actualizar las notificaciones');
    }
  };

  // Aceptar o rechazar una solicitud de amistad
  const handleFriendRequest = async (
    notification: Notification,
    action: FriendAction
  ) => {
    if (
      notification.relatedId == null ||
      notification.relatedType !== 'FRIENDSHIP'
    ) {
      toast.error('Esta solicitud no tiene una referencia válida');
      return;
    }

    if (processingIds.includes(notification.id)) {
      return;
    }

    setProcessingIds(current => [
      ...current,
      notification.id,
    ]);

    try {
      const endpoint =
        action === 'accept'
          ? '/friends/accept'
          : '/friends/reject';

      const response = await api.post(endpoint, {
        friendshipId: notification.relatedId,
      });

      setNotifications(current =>
        current.map(item =>
          item.id === notification.id
            ? { ...item, isRead: true }
            : item
        )
      );

      toast.success(
        response.data?.message ||
        (action === 'accept'
          ? 'Solicitud aceptada'
          : 'Solicitud rechazada')
      );
    } catch (error: unknown) {
      console.error('Error al procesar solicitud:', error);

      const serverMessage = (
        error as {
          response?: {
            data?: {
              message?: string;
            };
          };
        }
      )?.response?.data?.message;

      toast.error(
        serverMessage || 'No se pudo procesar la solicitud'
      );
    } finally {
      setProcessingIds(current =>
        current.filter(id => id !== notification.id)
      );
    }
  };

  const unreadCount = notifications.filter(
    item => !item.isRead
  ).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'LIKE':
        return '❤️';
      case 'COMMENT':
        return '💬';
      case 'FRIEND_REQUEST':
        return '👥';
      case 'FRIEND_ACCEPTED':
        return '🤝';
      case 'MESSAGE':
        return '✉️';
      default:
        return '🔔';
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleString('es-PE', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

  return (
    <div className="min-h-screen bg-[#15202b] text-white p-4">
      <div className="max-w-3xl mx-auto">

        {/* BARRA SUPERIOR */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#192734] border border-[#38444d] text-sky-400 hover:bg-[#253341] text-sm font-semibold transition"
          >
            ← Volver al inicio
          </button>
        </div>

        <div className="bg-[#192734] border border-[#38444d] rounded-2xl shadow-2xl overflow-hidden">

          {/* ENCABEZADO */}
          <div className="bg-[#253341] border-b border-[#38444d] text-white p-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                🔔 Notificaciones
              </h1>

              <p className="text-gray-400 text-sm mt-1">
                Mantente al día con tu actividad
              </p>
            </div>

            <div className="bg-sky-500/20 border border-sky-500/40 text-sky-400 rounded-full px-4 py-1.5 text-sm font-bold shrink-0">
              {unreadCount} nuevas
            </div>
          </div>

          {/* ACCIONES GENERALES */}
          <div className="p-4 border-b border-[#38444d] bg-[#192734] flex justify-between items-center">
            <h2 className="font-semibold text-white">
              Todas las notificaciones
            </h2>

            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="text-sm text-sky-400 hover:text-sky-300 font-semibold transition disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Marcar todas como leídas
            </button>
          </div>

          {/* CONTENIDO */}
          {loading ? (
            <p className="p-10 text-center text-gray-400">
              Cargando notificaciones...
            </p>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-5xl">🔔</span>

              <h3 className="mt-4 font-semibold text-white">
                No tienes notificaciones
              </h3>

              <p className="text-gray-400 text-sm mt-2">
                Aquí aparecerán tus novedades.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#38444d]">
              {notifications.map(notification => {
                const isFriendRequest =
                  notification.type === 'FRIEND_REQUEST' &&
                  notification.relatedType === 'FRIENDSHIP' &&
                  notification.relatedId != null;

                const isProcessing = processingIds.includes(
                  notification.id
                );

                return (
                  <div
                    key={notification.id}
                    className={`p-5 flex gap-4 items-start transition ${
                      notification.isRead
                        ? 'bg-[#192734] hover:bg-[#253341]/50'
                        : 'bg-sky-500/10 hover:bg-sky-500/15'
                    }`}
                  >
                    {/* ICONO */}
                    <div className="w-11 h-11 rounded-full bg-[#253341] border border-[#38444d] flex items-center justify-center text-xl shrink-0">
                      {getIcon(notification.type)}
                    </div>

                    {/* INFORMACIÓN */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-100 text-sm leading-relaxed">
                        {notification.content}
                      </p>

                      <p className="text-xs text-gray-400 mt-1.5">
                        {formatDate(notification.createdAt)}
                      </p>

                      {/* BOTONES DE SOLICITUD DE AMISTAD */}
                      {isFriendRequest && (
                        <div className="flex flex-wrap gap-3 mt-4">
                          <button
                            type="button"
                            onClick={() =>
                              handleFriendRequest(
                                notification,
                                'accept'
                              )
                            }
                            disabled={isProcessing}
                            className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold px-5 py-2 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing
                              ? 'Procesando...'
                              : 'Aceptar'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleFriendRequest(
                                notification,
                                'reject'
                              )
                            }
                            disabled={isProcessing}
                            className="bg-[#253341] hover:bg-[#304253] border border-[#38444d] text-gray-200 text-sm font-semibold px-5 py-2 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}

                      {/* MARCAR COMO LEÍDA */}
                      {!notification.isRead && (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs text-sky-400 hover:text-sky-300 font-semibold mt-3 hover:underline"
                        >
                          Marcar como leída
                        </button>
                      )}
                    </div>

                    {/* INDICADOR DE NO LEÍDA */}
                    {!notification.isRead && (
                      <span className="w-3 h-3 bg-sky-400 rounded-full mt-2 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}