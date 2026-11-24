import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api/client";
import toast from "react-hot-toast";

const API_URL = "http://localhost:4000";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

interface StoryUser {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface MusicTrack {
  trackId: number;
  title: string;
  artist: string;
  cover: string;
  previewUrl: string;
}

interface Story {
  id: number;
  caption: string | null;
  url: string;
  originalName: string;
  mimeType: string;
  mediaType: string;
  createdAt: string;
  expiresAt: string;
  authorId: number;
  author: StoryUser;
  hasViewed: boolean;
  musicUrl?: string | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  musicCover?: string | null;
  musicStartTime?: number | null;
  _count: { views: number };
}

interface StoryView {
  id: number;
  viewedAt: string;
  user: StoryUser;
}

interface StoriesProps {
  user: StoryUser;
}

function getFileUrl(url: string) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export default function Stories({ user }: StoriesProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados Modal Crear
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Estados de Música (Creación)
  const [showMusicSearch, setShowMusicSearch] = useState(false);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<MusicTrack[]>([]);
  const [searchingMusic, setSearchingMusic] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [musicStartTime, setMusicStartTime] = useState<number>(0);
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(
    null,
  );
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Estados para el visor (IG Style)
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const storyAudioRef = useRef<HTMLAudioElement | null>(null);

  const [views, setViews] = useState<StoryView[]>([]);
  const [showViews, setShowViews] = useState(false);

  // Agrupar historias por usuario
  const groupedStories = useMemo(() => {
    const groups = new Map<number, Story[]>();

    const ordered = [...stories].sort((a, b) => {
      if (a.authorId === user.id) return -1;
      if (b.authorId === user.id) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    ordered.forEach((story) => {
      const current = groups.get(story.authorId) || [];
      current.push(story);
      groups.set(story.authorId, current);
    });

    return Array.from(groups.values());
  }, [stories, user.id]);

  const currentGroup =
    activeGroupIndex !== null ? groupedStories[activeGroupIndex] : null;
  const activeStory = currentGroup ? currentGroup[activeStoryIndex] : null;

  const fetchStories = async () => {
    try {
      const res = await api.get("/stories");
      setStories(res.data);
    } catch (error) {
      toast.error("No se pudieron cargar las historias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // Buscar música en iTunes Search API
  useEffect(() => {
    if (!musicQuery.trim()) {
      setMusicResults([]);
      return;
    }

    const delay = setTimeout(async () => {
      setSearchingMusic(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(musicQuery)}&media=music&entity=song&limit=10`,
        );
        const data = await res.json();
        const tracks: MusicTrack[] = (data.results || [])
          .filter((item: any) => item.previewUrl && item.artworkUrl100)
          .map((item: any) => ({
            trackId: item.trackId,
            title: item.trackName,
            artist: item.artistName,
            cover: item.artworkUrl100,
            previewUrl: item.previewUrl,
          }));
        setMusicResults(tracks);
      } catch {
        toast.error("Error al buscar canciones");
      } finally {
        setSearchingMusic(false);
      }
    }, 450);

    return () => clearTimeout(delay);
  }, [musicQuery]);

  // Detener audio de previsualización
  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewingTrackId(null);
  };

  const toggleTrackPreview = (track: MusicTrack, startAt = 0) => {
    if (!previewAudioRef.current) return;

    if (previewingTrackId === track.trackId && startAt === 0) {
      stopPreviewAudio();
    } else {
      previewAudioRef.current.src = track.previewUrl;
      previewAudioRef.current.currentTime = startAt;
      previewAudioRef.current.play().catch(() => {});
      setPreviewingTrackId(track.trackId);
    }
  };

  // Actualizar segundo de inicio y reproducir muestra desde ese punto
  const handleStartTimeChange = (newStart: number) => {
    const clamped = Math.max(0, Math.min(29, Math.floor(newStart)));
    setMusicStartTime(clamped);

    if (selectedTrack && previewAudioRef.current) {
      if (previewAudioRef.current.src !== selectedTrack.previewUrl) {
        previewAudioRef.current.src = selectedTrack.previewUrl;
      }
      previewAudioRef.current.currentTime = clamped;
      previewAudioRef.current.play().catch(() => {});
      setPreviewingTrackId(selectedTrack.trackId);
    }
  };

  // Control de audio de la historia activa en el visor
  useEffect(() => {
    const audio = storyAudioRef.current;
    if (!audio) return;

    if (!activeStory?.musicUrl) {
      audio.pause();
      audio.src = "";
      return;
    }

    const startTime = activeStory.musicStartTime ?? 0;
    audio.src = activeStory.musicUrl;
    audio.muted = isMuted;

    const playFromStart = () => {
      audio.currentTime = startTime;
      if (!showViews) {
        audio.play().catch(() => {
          audio.muted = true;
          setIsMuted(true);
          audio.play().catch(() => {});
        });
      }
    };

    if (audio.readyState >= 1) {
      playFromStart();
    } else {
      audio.onloadedmetadata = playFromStart;
    }

    if (showViews) {
      audio.pause();
    }

    return () => {
      audio.onloadedmetadata = null;
      audio.pause();
    };
  }, [activeStory?.id, showViews]);

  // Sincronizar mute sin reiniciar la canción
  useEffect(() => {
    if (storyAudioRef.current) {
      storyAudioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Registrar visualización
  useEffect(() => {
    if (!activeStory) return;
    api
      .post(`/stories/${activeStory.id}/view`)
      .then(() => {
        setStories((current) =>
          current.map((story) =>
            story.id === activeStory.id
              ? {
                  ...story,
                  hasViewed: true,
                  _count: {
                    views: story._count.views + (story.hasViewed ? 0 : 1),
                  },
                }
              : story,
          ),
        );
      })
      .catch(console.error);
  }, [activeStory?.id]);

  // Auto-avance
  useEffect(() => {
    if (!activeStory || showViews) return;
    const duration = activeStory.mediaType === "VIDEO" ? 15000 : 10000;
    const timer = window.setTimeout(() => goNext(), duration);
    return () => window.clearTimeout(timer);
  }, [activeStoryIndex, activeGroupIndex, showViews]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Archivo no válido");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("El archivo supera los 50 MB");
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
    e.target.value = "";
  };

  const resetCreateModal = () => {
    stopPreviewAudio();
    setShowCreate(false);
    setShowMusicSearch(false);
    setSelectedFile(null);
    setCaption("");
    setSelectedTrack(null);
    setMusicStartTime(0);
    setMusicQuery("");
    setMusicResults([]);
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("caption", caption);

    if (selectedTrack) {
      formData.append("musicUrl", selectedTrack.previewUrl);
      formData.append("musicTitle", selectedTrack.title);
      formData.append("musicArtist", selectedTrack.artist);
      formData.append("musicCover", selectedTrack.cover);
      formData.append("musicStartTime", String(Math.floor(musicStartTime)));
    }

    try {
      await api.post("/stories", formData);
      toast.success("¡Historia publicada!");
      resetCreateModal();
      await fetchStories();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "No se pudo publicar");
    } finally {
      setUploading(false);
    }
  };

  const openStories = (groupIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setActiveStoryIndex(0);
    setShowViews(false);
  };

  const goNext = () => {
    if (activeGroupIndex === null || !currentGroup) return;

    if (activeStoryIndex < currentGroup.length - 1) {
      setActiveStoryIndex(activeStoryIndex + 1);
    } else if (activeGroupIndex < groupedStories.length - 1) {
      setActiveGroupIndex(activeGroupIndex + 1);
      setActiveStoryIndex(0);
    } else {
      setActiveGroupIndex(null);
    }
    setShowViews(false);
  };

  const goPrevious = () => {
    if (activeGroupIndex === null || !currentGroup) return;

    if (activeStoryIndex > 0) {
      setActiveStoryIndex(activeStoryIndex - 1);
    } else if (activeGroupIndex > 0) {
      const prevGroup = groupedStories[activeGroupIndex - 1];
      setActiveGroupIndex(activeGroupIndex - 1);
      setActiveStoryIndex(prevGroup.length - 1);
    }
    setShowViews(false);
  };

  const handleShowViews = async () => {
    if (!activeStory) return;
    try {
      const res = await api.get(`/stories/${activeStory.id}/views`);
      setViews(res.data);
      setShowViews(true);
    } catch (error) {
      toast.error("Error al cargar visualizaciones");
    }
  };

  const handleDeleteStory = async () => {
    if (!activeStory || !window.confirm("¿Eliminar esta historia?")) return;
    try {
      await api.delete(`/stories/${activeStory.id}`);
      toast.success("Historia eliminada");
      setActiveGroupIndex(null);
      setShowViews(false);
      await fetchStories();
    } catch (error) {
      toast.error("No se pudo eliminar");
    }
  };

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const durationMs = activeStory?.mediaType === "VIDEO" ? 15000 : 10000;

  return (
    <>
      {/* Reproductores de audio ocultos */}
      <audio ref={previewAudioRef} onEnded={() => setPreviewingTrackId(null)} />
      <audio ref={storyAudioRef} loop />

      {/* CARRUSEL */}
      <div className="bg-[#192734] rounded-2xl border border-[#253341] p-4 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg">Historias</h2>
            <p className="text-xs text-gray-400">Comparte momentos</p>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2">
          {/* BOTÓN CREAR */}
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 flex flex-col items-center gap-2 w-20"
          >
            <div className="relative">
              {user.avatarUrl ? (
                <img
                  src={getFileUrl(user.avatarUrl)}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-[#38444d]"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-sky-700 flex items-center justify-center text-xl font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-sky-500 border-2 border-[#192734] flex items-center justify-center font-bold">
                +
              </span>
            </div>
            <span className="text-xs text-gray-300">Crear</span>
          </button>

          {/* LISTA AGRUPADA */}
          {!loading &&
            groupedStories.map((group, index) => {
              const firstStory = group[0];
              const isMine = firstStory.authorId === user.id;
              const hasUnseen = group.some((s) => !s.hasViewed);

              return (
                <button
                  key={firstStory.authorId}
                  onClick={() => openStories(index)}
                  className="shrink-0 flex flex-col items-center gap-2 w-20"
                >
                  <div
                    className={`p-0.75 rounded-full ${hasUnseen ? "bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600" : "bg-gray-500"}`}
                  >
                    {firstStory.author.avatarUrl ? (
                      <img
                        src={getFileUrl(firstStory.author.avatarUrl)}
                        alt="Avatar"
                        className="w-14.5 h-14.5 rounded-full object-cover border-2 border-[#192734]"
                      />
                    ) : (
                      <div className="w-14.5 h-14.5 rounded-full bg-sky-700 border-2 border-[#192734] flex items-center justify-center font-bold">
                        {firstStory.author.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-300 truncate w-full text-center">
                    {isMine ? "Tu historia" : firstStory.author.name}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* MODAL CREAR CON MÚSICA Y SELECTOR DE SEGUNDO */}
      {showCreate && (
        <div className="fixed inset-0 z-80 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStory}
            className="bg-[#192734] border border-[#38444d] rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Crear historia</h2>
              <button
                type="button"
                onClick={resetCreateModal}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <label className="block border-2 border-dashed border-[#38444d] rounded-xl p-5 text-center cursor-pointer hover:border-sky-500">
              {previewUrl && selectedFile?.type.startsWith("image/") && (
                <img
                  src={previewUrl}
                  className="w-full max-h-56 object-contain rounded-lg mb-2"
                />
              )}
              {previewUrl && selectedFile?.type.startsWith("video/") && (
                <video
                  src={previewUrl}
                  controls
                  className="w-full max-h-56 rounded-lg mb-2"
                />
              )}
              {!selectedFile && (
                <>
                  <div className="text-4xl mb-2">📷</div>
                  <p className="font-semibold text-sm">
                    Seleccionar foto o video
                  </p>
                </>
              )}
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {/* SELECTOR DE MÚSICA */}
            <div className="mt-4">
              {selectedTrack ? (
                <div className="bg-[#253341] border border-sky-500/40 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          toggleTrackPreview(selectedTrack, musicStartTime)
                        }
                        className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0"
                      >
                        <img
                          src={selectedTrack.cover}
                          alt={selectedTrack.title}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/45 flex items-center justify-center text-xs text-white">
                          {previewingTrackId === selectedTrack.trackId
                            ? "⏸"
                            : "▶"}
                        </span>
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate text-white">
                          🎵 {selectedTrack.title}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {selectedTrack.artist}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        stopPreviewAudio();
                        setSelectedTrack(null);
                        setMusicStartTime(0);
                      }}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 font-semibold"
                    >
                      Quitar
                    </button>
                  </div>

                  {/* SLIDER SEGUNDO DE INICIO (0s - 29s) */}
                  <div className="pt-1 border-t border-[#38444d]">
                    <div className="flex justify-between text-xs text-gray-300 mb-1">
                      <span>Inicio de la canción</span>
                      <span className="font-mono text-sky-400 font-bold">
                        0:{musicStartTime.toString().padStart(2, "0")}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={29}
                      step={1}
                      value={musicStartTime}
                      onChange={(e) =>
                        handleStartTimeChange(Number(e.target.value))
                      }
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMusicSearch(!showMusicSearch)}
                  className="w-full flex items-center justify-center gap-2 bg-[#253341] hover:bg-[#2c3c4c] text-sky-400 font-semibold text-sm py-2.5 rounded-xl transition"
                >
                  <span>🎵</span>
                  <span>
                    {showMusicSearch
                      ? "Cerrar buscador de música"
                      : "Añadir música"}
                  </span>
                </button>
              )}

              {/* PANEL BUSCADOR DE CANCIONES */}
              {showMusicSearch && !selectedTrack && (
                <div className="mt-2 bg-[#15202b] border border-[#38444d] rounded-xl p-3">
                  <input
                    type="text"
                    value={musicQuery}
                    onChange={(e) => setMusicQuery(e.target.value)}
                    placeholder="Buscar canción o artista..."
                    className="w-full bg-[#253341] text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-sky-500"
                  />

                  <div className="mt-2 max-h-44 overflow-y-auto space-y-1.5">
                    {searchingMusic && (
                      <p className="text-xs text-gray-400 text-center py-3">
                        Buscando canciones...
                      </p>
                    )}
                    {!searchingMusic &&
                      musicQuery &&
                      musicResults.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-3">
                          Sin resultados
                        </p>
                      )}

                    {musicResults.map((track) => {
                      const isPlaying = previewingTrackId === track.trackId;
                      return (
                        <div
                          key={track.trackId}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-[#253341]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleTrackPreview(track)}
                              className="relative w-9 h-9 rounded-md overflow-hidden shrink-0"
                            >
                              <img
                                src={track.cover}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">
                                {isPlaying ? "⏸" : "▶"}
                              </span>
                            </button>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">
                                {track.title}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">
                                {track.artist}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              stopPreviewAudio();
                              setSelectedTrack(track);
                              setMusicStartTime(0);
                              setShowMusicSearch(false);
                            }}
                            className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                          >
                            Elegir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Descripción..."
              className="w-full mt-3 bg-[#253341] rounded-xl p-3 text-sm outline-none resize-none focus:ring-1 focus:ring-sky-500"
            />

            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="w-full mt-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 rounded-full py-3 font-bold"
            >
              {uploading ? "Publicando..." : "Compartir"}
            </button>
          </form>
        </div>
      )}

      {/* VISOR ESTILO INSTAGRAM */}
      {activeStory && currentGroup && (
        <div className="fixed inset-0 z-90 bg-black/95 flex items-center justify-center">
          <div className="relative w-full h-full max-w-105 md:h-[90vh] md:rounded-xl overflow-hidden bg-[#101820] flex flex-col">
            {/* BARRAS DE PROGRESO */}
            <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
              {currentGroup.map((story, index) => {
                const isPast = index < activeStoryIndex;
                const isActive = index === activeStoryIndex;

                return (
                  <div
                    key={story.id}
                    className="h-0.75 flex-1 rounded-full bg-white/30 overflow-hidden"
                  >
                    <div
                      className={`h-full bg-white ${isActive ? "animate-story-progress" : ""}`}
                      style={{
                        width: isPast ? "100%" : "0%",
                        // @ts-ignore
                        "--duration": isActive ? `${durationMs}ms` : "0ms",
                        animationDuration: isActive ? `${durationMs}ms` : "0ms",
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* CABECERA */}
            <div className="absolute top-7 left-4 right-4 z-20 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                {activeStory.author.avatarUrl ? (
                  <img
                    src={getFileUrl(activeStory.author.avatarUrl)}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-sky-700 flex items-center justify-center font-bold">
                    {activeStory.author.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-bold text-sm">{activeStory.author.name}</p>
                  <p className="text-xs text-gray-300">
                    {formatTime(activeStory.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeStory.musicUrl && (
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="bg-black/40 hover:bg-black/60 backdrop-blur-sm w-8 h-8 rounded-full flex items-center justify-center text-sm"
                    title={isMuted ? "Activar sonido" : "Silenciar"}
                  >
                    {isMuted ? "🔇" : "🔊"}
                  </button>
                )}
                <button
                  onClick={() => setActiveGroupIndex(null)}
                  className="text-white text-3xl font-light pb-2"
                >
                  ×
                </button>
              </div>
            </div>

            {/* MUSIC STICKER FLOTANTE */}
            {activeStory.musicUrl && activeStory.musicTitle && (
              <div className="absolute top-20 left-4 z-20 max-w-[75%] flex items-center gap-2.5 bg-black/50 backdrop-blur-md border border-white/15 rounded-2xl px-3 py-2 shadow-lg">
                {activeStory.musicCover ? (
                  <img
                    src={activeStory.musicCover}
                    alt={activeStory.musicTitle}
                    className={`w-9 h-9 rounded-full object-cover shrink-0 ${!isMuted && !showViews ? "animate-spin" : ""}`}
                    style={{ animationDuration: "6s" }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-sm shrink-0">
                    🎵
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {activeStory.musicTitle}
                  </p>
                  <p className="text-[11px] text-gray-300 truncate">
                    {activeStory.musicArtist}
                  </p>
                </div>
              </div>
            )}

            {/* CONTENIDO */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
              {activeStory.mediaType === "IMAGE" ? (
                <img
                  src={getFileUrl(activeStory.url)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={getFileUrl(activeStory.url)}
                  autoPlay
                  muted={Boolean(activeStory.musicUrl) || isMuted}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                  onEnded={goNext}
                />
              )}
              {activeStory.caption && (
                <div className="absolute bottom-20 left-4 right-4 text-center">
                  <p className="inline-block bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-sm">
                    {activeStory.caption}
                  </p>
                </div>
              )}
            </div>

            {/* ZONAS DE CLIC PARA NAVEGAR */}
            <button
              onClick={goPrevious}
              className="absolute left-0 top-28 bottom-16 w-1/3 z-10 cursor-pointer"
            />
            <button
              onClick={goNext}
              className="absolute right-0 top-28 bottom-16 w-1/3 z-10 cursor-pointer"
            />

            {/* Flechas visuales */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none opacity-50 hidden md:block">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none opacity-50 hidden md:block">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </div>

            {/* ACCIONES */}
            <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between">
              {activeStory.authorId === user.id ? (
                <>
                  <button
                    onClick={handleShowViews}
                    className="bg-white/20 hover:bg-white/30 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold"
                  >
                    👁️ {activeStory._count.views}
                  </button>
                  <button
                    onClick={handleDeleteStory}
                    className="bg-red-600/90 hover:bg-red-600 px-4 py-2 rounded-full text-sm font-bold"
                  >
                    Eliminar
                  </button>
                </>
              ) : (
                <div className="w-full text-center">
                  <p className="text-xs text-gray-400">
                    Historia de {activeStory.author.name}
                  </p>
                </div>
              )}
            </div>

            {/* VISTAS (Overlay) */}
            {showViews && (
              <div className="absolute inset-0 z-30 bg-[#192734] p-5 overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-lg">
                    Visualizaciones ({views.length})
                  </h3>
                  <button
                    onClick={() => setShowViews(false)}
                    className="text-2xl text-gray-400"
                  >
                    ×
                  </button>
                </div>
                {views.map((view) => (
                  <div
                    key={view.id}
                    className="flex items-center gap-3 py-3 border-b border-[#38444d]"
                  >
                    <div className="w-10 h-10 rounded-full bg-sky-700 flex items-center justify-center font-bold">
                      {view.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{view.user.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(view.viewedAt).toLocaleString("es-PE")}
                      </p>
                    </div>
                  </div>
                ))}
                {views.length === 0 && (
                  <p className="text-gray-400 text-sm">
                    Nadie ha visto esto aún.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
