import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { io } from "socket.io-client";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useCall } from "../context/CallContext";
import { SOCKET_URL } from "../lib/socketUrl";
import toast from "react-hot-toast";

interface ChatUser {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface MiniMessage {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  createdAt: string;
}

interface OpenWindow {
  user: ChatUser;
  minimized: boolean;
  unread: number;
}

function getAvatar(url: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${SOCKET_URL}${url}`;
}

export default function FloatingChat() {
  const { pathname } = useLocation();
  const { user, token } = useAuthStore();
  const { startCall, isBusy } = useCall();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [messagesByUser, setMessagesByUser] = useState<
    Record<number, MiniMessage[]>
  >({});
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [sendingId, setSendingId] = useState<number | null>(null);

  const usersRef = useRef<ChatUser[]>([]);
  usersRef.current = users;

  // No mostrar la burbuja flotante si ya estamos en la pantalla completa de /chat
  const isHiddenRoute =
    pathname === "/chat" || pathname === "/login" || pathname === "/register";

  // Cargar contactos
  useEffect(() => {
    if (!token || !user) return;
    api
      .get("/messages/users")
      .then((res) => setUsers(res.data || []))
      .catch(() => {});
  }, [token, user]);

  // Escuchar mensajes entrantes en tiempo real para abrir/actualizar ventanitas
  useEffect(() => {
    if (!token || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("new_message", (msg: MiniMessage) => {
      const otherUserId =
        msg.senderId === user.id ? msg.receiverId : msg.senderId;

      setMessagesByUser((prev) => {
        const list = prev[otherUserId] || [];
        if (list.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [otherUserId]: [...list, msg] };
      });

      // Si el mensaje es entrante y no estamos en /chat, abrir o marcar en la ventanita flotante
      if (msg.senderId !== user.id && window.location.pathname !== "/chat") {
        const sender = usersRef.current.find((u) => u.id === msg.senderId);
        if (sender) {
          setOpenWindows((prev) => {
            const exists = prev.find((w) => w.user.id === sender.id);
            if (exists) {
              return prev.map((w) =>
                w.user.id === sender.id
                  ? { ...w, unread: w.minimized ? w.unread + 1 : 0 }
                  : w,
              );
            }
            // Máximo 2 ventanitas abiertas como Facebook
            return [
              ...prev.slice(-1),
              { user: sender, minimized: false, unread: 0 },
            ];
          });
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  if (!token || !user || isHiddenRoute) return null;

  const openChatWindow = async (target: ChatUser) => {
    setIsDrawerOpen(false);

    setOpenWindows((prev) => {
      const exists = prev.find((w) => w.user.id === target.id);
      if (exists) {
        return prev.map((w) =>
          w.user.id === target.id ? { ...w, minimized: false, unread: 0 } : w,
        );
      }
      return [...prev.slice(-1), { user: target, minimized: false, unread: 0 }];
    });

    if (!messagesByUser[target.id]) {
      try {
        const res = await api.get(`/messages/${target.id}`);
        setMessagesByUser((prev) => ({ ...prev, [target.id]: res.data || [] }));
      } catch {
        toast.error("No se pudo cargar el chat");
      }
    }
  };

  const closeWindow = (userId: number) => {
    setOpenWindows((prev) => prev.filter((w) => w.user.id !== userId));
  };

  const toggleMinimize = (userId: number) => {
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.user.id === userId
          ? {
              ...w,
              minimized: !w.minimized,
              unread: !w.minimized ? w.unread : 0,
            }
          : w,
      ),
    );
  };

  const handleSendMiniMessage = async (targetId: number, e: FormEvent) => {
    e.preventDefault();
    const text = (inputs[targetId] || "").trim();
    if (!text || sendingId === targetId) return;

    setSendingId(targetId);
    setInputs((prev) => ({ ...prev, [targetId]: "" }));

    try {
      const formData = new FormData();
      formData.append("content", text);
      const res = await api.post(`/messages/${targetId}`, formData);
      const saved: MiniMessage = res.data;

      setMessagesByUser((prev) => {
        const list = prev[targetId] || [];
        if (list.some((m) => m.id === saved.id)) return prev;
        return { ...prev, [targetId]: [...list, saved] };
      });
    } catch {
      toast.error("No se pudo enviar");
    } finally {
      setSendingId(null);
    }
  };

  const totalUnread = openWindows.reduce((acc, w) => acc + w.unread, 0);

  return (
    <div className="fixed bottom-0 right-4 z-40 flex items-end gap-3 pointer-events-none">
      {/* VENTANAS DE CHAT ABIERTAS (ESTILO FACEBOOK MESSENGER) */}
      {openWindows.map(({ user: peer, minimized, unread }) => {
        const chatMsgs = messagesByUser[peer.id] || [];

        return (
          <div
            key={peer.id}
            className="pointer-events-auto w-80 bg-[#192734] border border-b-0 border-[#38444d] rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Cabecera de la mini-ventana */}
            <div
              onClick={() => toggleMinimize(peer.id)}
              className="px-3 py-2.5 bg-[#253341] border-b border-[#38444d] flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                {peer.avatarUrl ? (
                  <img
                    src={getAvatar(peer.avatarUrl)!}
                    alt={peer.name}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {peer.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-bold text-white truncate">
                  {peer.name}
                </span>
                {unread > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-sky-500 text-white">
                    {unread}
                  </span>
                )}
              </div>

              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => startCall(peer, "audio")}
                  title="Llamar"
                  className="w-7 h-7 rounded-full hover:bg-[#38444d] text-sky-400 text-xs flex items-center justify-center"
                >
                  📞
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => startCall(peer, "video")}
                  title="Videollamada"
                  className="w-7 h-7 rounded-full hover:bg-[#38444d] text-sky-400 text-xs flex items-center justify-center"
                >
                  📹
                </button>
                <button
                  type="button"
                  onClick={() => toggleMinimize(peer.id)}
                  title="Minimizar"
                  className="w-7 h-7 rounded-full hover:bg-[#38444d] text-gray-300 text-xs flex items-center justify-center"
                >
                  —
                </button>
                <button
                  type="button"
                  onClick={() => closeWindow(peer.id)}
                  title="Cerrar"
                  className="w-7 h-7 rounded-full hover:bg-red-600/80 text-gray-300 hover:text-white text-xs flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Cuerpo de mensajes (se oculta si está minimizada) */}
            {!minimized && (
              <>
                <div className="h-72 overflow-y-auto p-3 space-y-2 bg-[#15202b]">
                  {chatMsgs.length === 0 ? (
                    <p className="text-center text-xs text-gray-500 mt-16">
                      Envía un mensaje a {peer.name}
                    </p>
                  ) : (
                    chatMsgs.slice(-30).map((m) => {
                      const isMine = m.senderId === user.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-xs whitespace-pre-wrap break-words ${
                              isMine
                                ? "bg-sky-600 text-white rounded-br-none"
                                : "bg-[#253341] text-gray-100 rounded-bl-none border border-[#38444d]"
                            }`}
                          >
                            {m.content || "📎 Archivo adjunto"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input rápido */}
                <form
                  onSubmit={(e) => handleSendMiniMessage(peer.id, e)}
                  className="p-2 bg-[#192734] border-t border-[#38444d] flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={inputs[peer.id] || ""}
                    onChange={(e) =>
                      setInputs((prev) => ({
                        ...prev,
                        [peer.id]: e.target.value,
                      }))
                    }
                    placeholder="Aa"
                    className="flex-1 min-w-0 bg-[#253341] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={!(inputs[peer.id] || "").trim()}
                    className="px-3 py-1.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold disabled:opacity-40"
                  >
                    ➤
                  </button>
                </form>
              </>
            )}
          </div>
        );
      })}

      {/* LISTA DESPLEGABLE / BURBUJA DE CONTACTOS */}
      <div className="pointer-events-auto relative">
        {isDrawerOpen && (
          <div className="mb-2 w-72 bg-[#192734] border border-[#38444d] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-[#253341] border-b border-[#38444d] flex items-center justify-between">
              <span className="font-bold text-sm text-white">
                💬 Chats rápidos
              </span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openChatWindow(u)}
                  className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-[#253341] text-left transition border-b border-[#38444d]/40"
                >
                  {u.avatarUrl ? (
                    <img
                      src={getAvatar(u.avatarUrl)!}
                      alt={u.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-white truncate">
                    {u.name}
                  </span>
                </button>
              ))}
              {users.length === 0 && (
                <p className="p-4 text-xs text-center text-gray-400">
                  Sin contactos disponibles
                </p>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsDrawerOpen((o) => !o)}
          className="mb-4 px-4 py-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-xl flex items-center gap-2 transition"
        >
          <span>💬</span>
          <span>Mensajes</span>
          {totalUnread > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-red-600 text-white">
              {totalUnread}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
