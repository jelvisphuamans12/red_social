import { useState, useEffect } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";

const API_URL = "http://localhost:4000";

export default function Profile() {
  const { user, login } = useAuthStore();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [cover, setCover] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Estado para abrir la imagen en pantalla completa (estilo Facebook)
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Cerrar el visor de imagen con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewingImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Obtener datos del perfil (incluye avatarUrl y coverUrl)
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/users/me");

        setName(res.data.name || "");
        setBio(res.data.bio || "");
        setAvatar(res.data.avatarUrl || "");
        setCover(res.data.coverUrl || "");
      } catch (error) {
        console.error(error);
        toast.error("No se pudo cargar el perfil");
      }
    };

    fetchProfile();
  }, []);

  // Iniciales del usuario
  const initials = (name || user?.name || "Usuario")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  // Color automático según el nombre
  const colors = [
    "bg-sky-600",
    "bg-purple-600",
    "bg-emerald-600",
    "bg-pink-600",
    "bg-orange-600",
    "bg-indigo-600",
  ];

  const colorIndex =
    (name || user?.name || "Usuario")
      .split("")
      .reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length;

  // Guardar cambios de nombre y biografía
  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();

    setLoading(true);

    try {
      const res = await api.put("/users/me", {
        name,
        bio,
      });

      const token = localStorage.getItem("token");

      if (user && token) {
        login(
          {
            ...user,
            name: res.data.name,
          },
          token,
        );
      }

      toast.success("Perfil actualizado");
    } catch (error) {
      console.error(error);
      toast.error("Error al actualizar el perfil");
    } finally {
      setLoading(false);
    }
  };

  // Subir fotografía de perfil (Avatar)
  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona un archivo de imagen válido");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar los 5 MB");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    setUploading(true);

    try {
      const res = await api.post("/users/avatar", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setAvatar(res.data.avatarUrl);

      const token = localStorage.getItem("token");
      if (user && token) {
        login(
          {
            ...user,
            avatarUrl: res.data.avatarUrl,
          },
          token,
        );
      }

      toast.success("Fotografía actualizada");
    } catch (error) {
      console.error(error);
      toast.error("Error al subir la fotografía");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Subir fotografía de portada (Cover)
  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona un archivo de imagen válido");
      e.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("La portada no debe superar los 8 MB");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("cover", file);

    setUploadingCover(true);

    try {
      const res = await api.post("/users/cover", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setCover(res.data.coverUrl);

      const token = localStorage.getItem("token");
      if (user && token) {
        login(
          {
            ...user,
            coverUrl: res.data.coverUrl,
          } as any,
          token,
        );
      }

      toast.success("Foto de portada actualizada");
    } catch (error) {
      console.error(error);
      toast.error("Error al subir la foto de portada");
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  };

  const fullCoverUrl = cover
    ? cover.startsWith("http")
      ? cover
      : `${API_URL}${cover}`
    : "";

  const fullAvatarUrl = avatar
    ? avatar.startsWith("http")
      ? avatar
      : `${API_URL}${avatar}`
    : "";

  return (
    <div className="min-h-screen bg-[#15202b] text-white">
      {/* ENCABEZADO */}
      <header className="h-16.25 border-b border-[#38444d] bg-[#15202b]">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-sky-400">RedSocial</span>
          </Link>

          <Link
            to="/"
            className="text-sky-400 hover:text-sky-300 font-semibold text-sm"
          >
            ← Volver al inicio
          </Link>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-[#192734] border border-[#253341] rounded-2xl overflow-hidden">
          {/* PORTADA (CLICKEABLE PARA VER EN GRANDE) */}
          <div className="h-44 sm:h-56 bg-linear-to-r from-sky-900 via-blue-800 to-indigo-900 relative overflow-hidden group">
            {fullCoverUrl ? (
              <img
                src={fullCoverUrl}
                alt="Foto de portada"
                onClick={() =>
                  setViewingImage({
                    url: fullCoverUrl,
                    title: `Foto de portada de ${name || user?.name || "Usuario"}`,
                  })
                }
                title="Haz clic para ver la foto de portada"
                className="w-full h-full object-cover cursor-pointer hover:brightness-90 transition"
                onError={() => setCover("")}
              />
            ) : (
              <>
                <div className="absolute inset-0 opacity-20 bg-linear-to-br from-white to-transparent" />
                <div className="absolute bottom-4 left-5">
                  <p className="text-white/80 text-sm">Tu espacio personal</p>
                </div>
              </>
            )}

            {/* BOTÓN PARA CAMBIAR PORTADA */}
            <label
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-3 right-3 z-10 cursor-pointer bg-[#192734]/90 hover:bg-[#253341] text-white border border-[#38444d] px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg transition"
            >
              <span>🖼️</span>
              <span>
                {uploadingCover ? "Subiendo portada..." : "Cambiar portada"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingCover}
                onChange={handleCoverUpload}
              />
            </label>
          </div>

          {/* PERFIL */}
          <div className="px-5 sm:px-8 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              {/* AVATAR (TAMBIÉN CLICKEABLE PARA VER EN GRANDE) */}
              <div className="-mt-16 relative w-fit z-10">
                {fullAvatarUrl ? (
                  <img
                    src={fullAvatarUrl}
                    alt="Fotografía de perfil"
                    onClick={() =>
                      setViewingImage({
                        url: fullAvatarUrl,
                        title: `Foto de perfil de ${name || user?.name || "Usuario"}`,
                      })
                    }
                    title="Haz clic para ver la foto de perfil"
                    className="w-32 h-32 rounded-full object-cover border-4 border-[#192734] bg-[#253341] cursor-pointer hover:brightness-90 transition"
                    onError={() => setAvatar("")}
                  />
                ) : (
                  <div
                    className={`w-32 h-32 rounded-full ${colors[colorIndex]} border-4 border-[#192734] flex items-center justify-center text-white text-4xl font-bold`}
                  >
                    {initials || "?"}
                  </div>
                )}
              </div>

              <label className="cursor-pointer bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm px-5 py-3 rounded-full transition text-center">
                {uploading ? "Subiendo..." : "📷 Cambiar fotografía"}

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleAvatarUpload}
                />
              </label>
            </div>

            {/* NOMBRE Y DESCRIPCIÓN */}
            <div className="mt-4 mb-7">
              <h1 className="text-2xl font-bold">
                {name || user?.name || "Usuario"}
              </h1>

              <p className="text-sm text-gray-400 mt-1">
                Mi perfil en RedSocial
              </p>
            </div>

            <div className="border-t border-[#38444d] pt-6">
              <h2 className="text-xl font-bold mb-5">Editar perfil</h2>

              <form onSubmit={handleUpdate} className="space-y-5">
                {/* NOMBRE */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Nombre completo
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Escribe tu nombre"
                    required
                    className="w-full bg-[#253341] border border-[#38444d] rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-sky-500 transition"
                  />
                </div>

                {/* BIOGRAFÍA */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Biografía
                  </label>

                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    maxLength={250}
                    placeholder="Cuéntanos algo sobre ti..."
                    className="w-full bg-[#253341] border border-[#38444d] rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-sky-500 transition resize-none"
                  />

                  <p className="text-xs text-gray-500 text-right mt-1">
                    {bio.length}/250 caracteres
                  </p>
                </div>

                {/* BOTONES */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading || !name.trim()}
                    className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold px-7 py-3 rounded-full transition"
                  >
                    {loading ? "Guardando..." : "Guardar cambios"}
                  </button>

                  <Link
                    to="/"
                    className="bg-[#253341] hover:bg-[#38444d] text-white font-semibold px-7 py-3 rounded-full transition"
                  >
                    Cancelar
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* INFORMACIÓN */}
        <div className="mt-5 bg-[#192734] border border-[#253341] rounded-2xl p-5">
          <h3 className="font-bold mb-2">Información de tu cuenta</h3>

          <p className="text-sm text-gray-400">
            Tu perfil permite que otros miembros de RedSocial conozcan más sobre
            ti. Si no tienes una fotografía, mostraremos automáticamente tus
            iniciales.
          </p>
        </div>
      </main>

      {/* VISOR DE IMAGEN A PANTALLA COMPLETA (ESTILO FACEBOOK) */}
      {viewingImage && (
        <div
          onClick={() => setViewingImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 animate-fadeIn"
        >
          {/* BARRA SUPERIOR DEL VISOR */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl flex items-center justify-between mb-3 px-2"
          >
            <p className="text-sm sm:text-base font-semibold text-gray-200 truncate">
              {viewingImage.title}
            </p>
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              aria-label="Cerrar visor"
              className="w-10 h-10 rounded-full bg-[#253341] hover:bg-[#38444d] text-white flex items-center justify-center text-lg font-bold transition"
            >
              ✕
            </button>
          </div>

          {/* IMAGEN COMPLETA SIN RECORTAR */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-5xl max-h-[85vh] flex items-center justify-center"
          >
            <img
              src={viewingImage.url}
              alt={viewingImage.title}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-[#38444d]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
