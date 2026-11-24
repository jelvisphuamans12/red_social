import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useCall } from "../context/CallContext";
import toast from "react-hot-toast";

interface User {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface FriendRequest {
  id: number;
  requester: User;
}

export default function Friends() {
  const navigate = useNavigate();
  const { startCall, isBusy } = useCall();

  const [activeTab, setActiveTab] = useState<
    "friends" | "requests" | "discover"
  >("friends");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [discover, setDiscover] = useState<User[]>([]);

  const fetchData = async () => {
    try {
      const [fRes, rRes, dRes] = await Promise.all([
        api.get("/friends"),
        api.get("/friends/requests"),
        api.get("/friends/discover"),
      ]);

      setFriends(fRes.data || []);
      setRequests(rRes.data || []);
      setDiscover(dRes.data || []);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const sendRequest = async (addresseeId: number) => {
    try {
      await api.post("/friends/request", { addresseeId });
      toast.success("Solicitud enviada");
      fetchData();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Error al enviar",
      );
    }
  };

  const acceptRequest = async (friendshipId: number) => {
    try {
      await api.post("/friends/accept", { friendshipId });
      toast.success("¡Ahora son amigos!");
      fetchData();
    } catch {
      toast.error("Error al aceptar");
    }
  };

  const renderAvatar = (user: User) => {
    if (user.avatarUrl) {
      const src = user.avatarUrl.startsWith("http")
        ? user.avatarUrl
        : `http://localhost:4000${user.avatarUrl}`;

      return (
        <img
          src={src}
          alt={user.name}
          className="w-12 h-12 rounded-full object-cover shrink-0 border border-[#38444d]"
        />
      );
    }

    return (
      <div className="w-12 h-12 rounded-full bg-sky-600 flex items-center justify-center font-bold text-lg text-white shrink-0">
        {user.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const query = search.toLowerCase().trim();
  const filteredFriends = friends.filter((f) =>
    f.name.toLowerCase().includes(query),
  );
  const filteredRequests = requests.filter((r) =>
    r.requester.name.toLowerCase().includes(query),
  );
  const filteredDiscover = discover.filter((u) =>
    u.name.toLowerCase().includes(query),
  );

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-40 bg-[#15202b]/95 backdrop-blur-xs flex items-center justify-center p-4 text-white"
    >
      {/* VENTANA FLOTANTE CENTRADA */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#192734] rounded-3xl border border-[#38444d] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* CABECERA */}
        <div className="px-6 py-4 bg-[#253341] border-b border-[#38444d] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>👥</span>
              <span>Amigos</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Conecta, envía mensajes o inicia una llamada rápida
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            title="Cerrar"
            className="w-9 h-9 rounded-full bg-[#192734] hover:bg-red-600/80 text-gray-300 hover:text-white flex items-center justify-center font-bold transition shrink-0"
          >
            ✕
          </button>
        </div>

        {/* PESTAÑAS Y BUSCADOR */}
        <div className="p-4 border-b border-[#38444d] bg-[#192734] space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("friends")}
              className={`px-4 py-2 rounded-full text-sm font-bold transition ${
                activeTab === "friends"
                  ? "bg-sky-500 text-white shadow"
                  : "bg-[#253341] hover:bg-[#304253] text-gray-300"
              }`}
            >
              Mis Amigos ({friends.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className={`px-4 py-2 rounded-full text-sm font-bold transition flex items-center gap-1.5 ${
                activeTab === "requests"
                  ? "bg-sky-500 text-white shadow"
                  : "bg-[#253341] hover:bg-[#304253] text-gray-300"
              }`}
            >
              <span>Solicitudes</span>
              {requests.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-red-500 text-white">
                  {requests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className={`px-4 py-2 rounded-full text-sm font-bold transition ${
                activeTab === "discover"
                  ? "bg-sky-500 text-white shadow"
                  : "bg-[#253341] hover:bg-[#304253] text-gray-300"
              }`}
            >
              Descubrir
            </button>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar personas por nombre..."
            className="w-full bg-[#253341] border border-[#38444d] rounded-full px-4 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-sky-500"
          />
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-gray-400 py-12">
              Cargando personas...
            </p>
          ) : (
            <>
              {/* PESTAÑA: MIS AMIGOS */}
              {activeTab === "friends" &&
                (filteredFriends.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="flex items-center justify-between gap-3 p-3.5 bg-[#253341]/80 border border-[#38444d] hover:border-sky-500/50 rounded-2xl transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {renderAvatar(friend)}
                          <div className="min-w-0">
                            <p className="font-bold text-white text-sm truncate">
                              {friend.name}
                            </p>
                            <p className="text-xs text-emerald-400">● Amigo</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => navigate("/chat")}
                            title="Enviar mensaje"
                            className="w-9 h-9 rounded-full bg-[#192734] hover:bg-[#304253] text-gray-200 flex items-center justify-center text-sm transition"
                          >
                            💬
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => startCall(friend, "audio")}
                            title="Llamada de voz"
                            className="w-9 h-9 rounded-full bg-[#192734] hover:bg-[#304253] text-sky-400 flex items-center justify-center text-sm transition disabled:opacity-40"
                          >
                            📞
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => startCall(friend, "video")}
                            title="Videollamada"
                            className="w-9 h-9 rounded-full bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center text-sm transition disabled:opacity-40"
                          >
                            📹
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <span className="text-4xl block mb-2">👋</span>
                    <p className="font-semibold text-white">
                      Aún no tienes amigos en esta lista
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Ve a la pestaña "Descubrir" para conectar con nuevas
                      personas.
                    </p>
                  </div>
                ))}

              {/* PESTAÑA: SOLICITUDES */}
              {activeTab === "requests" &&
                (filteredRequests.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-3 p-3.5 bg-[#253341]/80 border border-[#38444d] rounded-2xl"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {renderAvatar(req.requester)}
                          <div className="min-w-0">
                            <p className="font-bold text-white text-sm truncate">
                              {req.requester.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              Quiere ser tu amigo
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => acceptRequest(req.id)}
                          className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shrink-0 transition"
                        >
                          Aceptar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <span className="text-4xl block mb-2">📩</span>
                    <p className="font-semibold text-white">
                      No tienes solicitudes pendientes
                    </p>
                  </div>
                ))}

              {/* PESTAÑA: DESCUBRIR */}
              {activeTab === "discover" &&
                (filteredDiscover.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredDiscover.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 p-3.5 bg-[#253341]/80 border border-[#38444d] hover:border-sky-500/50 rounded-2xl transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {renderAvatar(u)}
                          <div className="min-w-0">
                            <p className="font-bold text-white text-sm truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-gray-400">Sugerencia</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => sendRequest(u.id)}
                          className="bg-sky-500 hover:bg-sky-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition"
                        >
                          + Añadir
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <span className="text-4xl block mb-2">🌎</span>
                    <p className="font-semibold text-white">
                      No hay más personas por descubrir
                    </p>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
