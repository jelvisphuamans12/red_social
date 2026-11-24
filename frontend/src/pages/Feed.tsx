import { useState, useEffect, useCallback } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { useAuthStore } from "../store/authStore";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
import toast from "react-hot-toast";
import NotificationBell from "../components/NotificationBell";
import Stories from "../components/Stories";
import FriendsModal from "../components/FriendsModal";
import Chat from "./Chat";
import NotificationsPanel from "../components/NotificationsPanel";

type ReactionType = "LIKE" | "LOVE" | "HAHA" | "WOW" | "SAD" | "ANGRY";

const REACTIONS: {
  type: ReactionType;
  emoji: string;
  label: string;
}[] = [
  { type: "LIKE", emoji: "👍", label: "Me gusta" },
  { type: "LOVE", emoji: "❤️", label: "Me encanta" },
  { type: "HAHA", emoji: "😂", label: "Me divierte" },
  { type: "WOW", emoji: "😮", label: "Me asombra" },
  { type: "SAD", emoji: "😢", label: "Me entristece" },
  { type: "ANGRY", emoji: "😡", label: "Me enoja" },
];

type ReactionCounts = Record<ReactionType, number>;

interface Comment {
  id: number;
  content: string;
  postId?: number;
  authorId?: number;
  parentCommentId?: number | null;
  createdAt?: string;
  author: {
    id?: number;
    name: string;
    avatarUrl: string | null;
  };
  myReaction?: ReactionType | null;
  reactionCounts?: ReactionCounts;
  reactionsCount?: number;
  replies?: Comment[];
}

interface PostMedia {
  id: number;
  url: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  mediaType: string;
  position: number;
}

interface SharedPostData {
  id: number;
  content: string;
  imageUrl: string | null;
  media?: PostMedia[];
  privacy?: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
}

interface Post {
  id: number;
  content: string;
  imageUrl: string | null;
  media?: PostMedia[];
  privacy?: string;
  authorId?: number;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  likesCount: number;
  myReaction: ReactionType | null;
  reactionCounts: ReactionCounts;
  sharedPostId?: number | null;
  sharedPost?: SharedPostData | null;
  sharesCount?: number;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
  comments: Comment[];
}

interface ShareRecipient {
  id: number;
  name: string;
  avatarUrl: string | null;
  bio?: string | null;
}

const EMPTY_COUNTS: ReactionCounts = {
  LIKE: 0,
  LOVE: 0,
  HAHA: 0,
  WOW: 0,
  SAD: 0,
  ANGRY: 0,
};

const API_URL = "http://localhost:4000";
const IMAGE_URL = "/images";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

function getFileUrl(url: string) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

function getFileType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Feed() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "chat" | "notifications">(
    "feed",
  );
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [deletingPostIds, setDeletingPostIds] = useState<number[]>([]);
  const [openPostMenuId, setOpenPostMenuId] = useState<number | null>(null);
  const [activeReactionPost, setActiveReactionPost] = useState<number | null>(
    null,
  );

  // Estados de comentarios, respuestas, reacciones y menús.
  const [deletingCommentIds, setDeletingCommentIds] = useState<number[]>([]);
  const [openCommentMenuId, setOpenCommentMenuId] = useState<number | null>(
    null,
  );
  const [activeReactionCommentId, setActiveReactionCommentId] = useState<
    number | null
  >(null);
  const [replyingTo, setReplyingTo] = useState<{
    postId: number;
    commentId: number;
    authorName: string;
  } | null>(null);
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  // Mostrar respuestas de 4 en 4, por comentario.
  const [visibleRepliesCount, setVisibleRepliesCount] = useState<
    Record<number, number>
  >({});
  const REPLIES_PER_BATCH = 4;

  const [commentInput, setCommentInput] = useState<{
    [key: number]: string;
  }>({});

  // ==========================================
  // ESTADOS PARA COMPARTIR PUBLICACIÓN (MURO Y DM)
  // ==========================================
  const [shareModalPost, setShareModalPost] = useState<Post | null>(null);
  const [shareTab, setShareTab] = useState<"DM" | "FEED">("DM");
  const [shareCaption, setShareCaption] = useState("");
  const [sharePrivacy, setSharePrivacy] = useState("FRIENDS");
  const [shareUsers, setShareUsers] = useState<ShareRecipient[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>(
    [],
  );
  const [shareSearch, setShareSearch] = useState("");
  const [isLoadingShareUsers, setIsLoadingShareUsers] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Cerrar los menús cuando se pulsa fuera de ellos (ratón o pantalla táctil).
  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (!target.closest("[data-comment-menu]")) {
        setOpenCommentMenuId(null);
      }

      if (!target.closest("[data-post-menu]")) {
        setOpenPostMenuId(null);
      }

      if (!target.closest("[data-comment-reactions]")) {
        setActiveReactionCommentId(null);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, []);

  // Cargar publicaciones
  const fetchPosts = useCallback(async () => {
    try {
      const res = await api.get("/posts");

      const loadedPosts: Post[] = res.data.map((post: Post) => ({
        ...post,
        myReaction: post.myReaction ?? null,
        reactionCounts: {
          ...EMPTY_COUNTS,
          ...post.reactionCounts,
        },
        likesCount: post.likesCount ?? 0,
        sharesCount: post.sharesCount ?? 0,
        media: post.media ?? [],
        comments: post.comments ?? [],
      }));

      setPosts(loadedPosts);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar el feed");
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);
  // ==========================================
  // BLOQUE 1: REFRESCAR FOTO Y DATOS DEL USUARIO ACTUAL
  // ==========================================
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    const syncUserProfile = async () => {
      try {
        const res = await api.get("/users/me");
        const freshUser = res.data?.user || res.data;
        if (freshUser) {
          setCurrentUser((prev: any) => ({ ...prev, ...freshUser }));
          useAuthStore.setState((state: any) => ({
            user: state.user ? { ...state.user, ...freshUser } : freshUser,
          }));
        }
      } catch (err) {
        console.error("No se pudo sincronizar el avatar del usuario:", err);
      }
    };

    syncUserProfile();
  }, []);

  // Crear y liberar vistas previas
  useEffect(() => {
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));

    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  // Abrir modal de compartir y cargar lista de personas/amigos
  const openShareModal = async (post: Post) => {
    setShareModalPost(post);
    setShareTab("DM");
    setShareCaption("");
    setSharePrivacy("FRIENDS");
    setSelectedRecipientIds([]);
    setShareSearch("");

    if (shareUsers.length === 0) {
      setIsLoadingShareUsers(true);
      try {
        const res = await api.get("/messages/users");
        setShareUsers(res.data || []);
      } catch (error) {
        console.error("Error al cargar usuarios para compartir:", error);
        toast.error("No se pudo cargar la lista de personas");
      } finally {
        setIsLoadingShareUsers(false);
      }
    }
  };

  const closeShareModal = () => {
    if (isSharing) return;
    setShareModalPost(null);
    setShareCaption("");
    setSelectedRecipientIds([]);
    setShareSearch("");
  };

  const toggleRecipient = (recipientId: number) => {
    setSelectedRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((id) => id !== recipientId)
        : [...current, recipientId],
    );
  };

  // Compartir en el muro (Feed)
  const handleShareToFeed = async (e: FormEvent) => {
    e.preventDefault();
    if (!shareModalPost) return;

    setIsSharing(true);
    try {
      await api.post(`/posts/${shareModalPost.id}/share`, {
        content: shareCaption.trim(),
        privacy: sharePrivacy,
      });

      toast.success("¡Publicación compartida en tu muro!");
      setShareModalPost(null);
      setShareCaption("");
      await fetchPosts();
    } catch (error: any) {
      console.error("Error al compartir en el muro:", error);
      toast.error(
        error.response?.data?.error || "No se pudo compartir la publicación",
      );
    } finally {
      setIsSharing(false);
    }
  };

  // Enviar publicación por mensaje directo a uno o varios usuarios
  const handleSendPostByDm = async (e: FormEvent) => {
    e.preventDefault();
    if (!shareModalPost) return;

    if (selectedRecipientIds.length === 0) {
      toast.error("Selecciona al menos una persona para enviar");
      return;
    }

    setIsSharing(true);
    try {
      await api.post("/messages/share-post", {
        postId: shareModalPost.id,
        recipientIds: selectedRecipientIds,
        content: shareCaption.trim(),
      });

      toast.success(
        selectedRecipientIds.length === 1
          ? "Publicación enviada por mensaje"
          : `Publicación enviada a ${selectedRecipientIds.length} personas`,
      );
      setShareModalPost(null);
      setShareCaption("");
      setSelectedRecipientIds([]);
    } catch (error: any) {
      console.error("Error al enviar publicación por DM:", error);
      toast.error(
        error.response?.data?.error || "No se pudo enviar la publicación",
      );
    } finally {
      setIsSharing(false);
    }
  };

  // Seleccionar archivos
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    if (selectedFiles.length + files.length > MAX_FILES) {
      toast.error(`Solo puedes seleccionar hasta ${MAX_FILES} archivos`);
      e.target.value = "";
      return;
    }

    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`Tipo de archivo no permitido: ${file.name}`);
        e.target.value = "";
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} supera el límite de 50 MB`);
        e.target.value = "";
        return;
      }
    }

    setSelectedFiles((current) => [...current, ...files]);
    e.target.value = "";
  };

  // Quitar archivo seleccionado
  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
  };

  // Cerrar sesión
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Eliminar una publicación propia o, si es administrador, cualquier publicación.
  const handleDeletePost = async (post: Post) => {
    const confirmed = window.confirm(
      "¿Estás seguro de que deseas eliminar esta publicación? Esta acción no se puede deshacer.",
    );

    if (!confirmed) return;

    setDeletingPostIds((current) => [...current, post.id]);

    try {
      await api.delete(`/posts/${post.id}`);

      setPosts((current) => current.filter((item) => item.id !== post.id));
      toast.success("Publicación eliminada correctamente");
    } catch (error: any) {
      console.error("Error al eliminar publicación:", error);
      toast.error(
        error.response?.data?.error || "No se pudo eliminar la publicación",
      );
    } finally {
      setDeletingPostIds((current) => current.filter((id) => id !== post.id));
    }
  };

  // Crear publicación con múltiples archivos
  const handleCreatePost = async (e: FormEvent) => {
    e.preventDefault();

    if (!content.trim() && selectedFiles.length === 0) {
      toast.error("Escribe algo o selecciona un archivo");
      return;
    }

    if (selectedFiles.length > MAX_FILES) {
      toast.error(`Solo puedes publicar hasta ${MAX_FILES} archivos`);
      return;
    }

    setIsPosting(true);

    const formData = new FormData();
    formData.append("content", content);

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      await api.post("/posts", formData);

      setContent("");
      setSelectedFiles([]);

      const fileInput = document.getElementById(
        "post-files",
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      toast.success("¡Publicación creada!");
      await fetchPosts();
    } catch (error) {
      console.error("Error al crear publicación:", error);
      toast.error(
        "Error al publicar. Comprueba los archivos e inténtalo nuevamente.",
      );
    } finally {
      setIsPosting(false);
    }
  };

  // Reaccionar a publicaciones
  const handleReaction = async (postId: number, type: ReactionType) => {
    setActiveReactionPost(null);

    try {
      const res = await api.post(`/posts/${postId}/reaction`, {
        type,
      });

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                myReaction: res.data.myReaction,
                likesCount: res.data.likesCount,
                reactionCounts: {
                  ...EMPTY_COUNTS,
                  ...res.data.reactionCounts,
                },
              }
            : post,
        ),
      );
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar la reacción");
    }
  };

  const getMyReaction = (type: ReactionType | null) =>
    REACTIONS.find((reaction) => reaction.type === type);

  // Crear un comentario principal.
  const handleComment = async (postId: number, e: FormEvent) => {
    e.preventDefault();

    const text = commentInput[postId]?.trim();
    if (!text) return;

    try {
      await api.post(`/posts/${postId}/comments`, {
        content: text,
      });

      setCommentInput((current) => ({
        ...current,
        [postId]: "",
      }));

      toast.success("Comentario añadido");
      await fetchPosts();
    } catch (error) {
      console.error("Error al comentar:", error);
      toast.error("Error al comentar");
    }
  };

  // Responder a un comentario principal.
  const handleReply = async (
    postId: number,
    commentId: number,
    e: FormEvent,
  ) => {
    e.preventDefault();

    const text = replyInput[commentId]?.trim();
    if (!text) return;

    try {
      await api.post(`/posts/${postId}/comments`, {
        content: text,
        parentCommentId: commentId,
      });

      setReplyInput((current) => ({
        ...current,
        [commentId]: "",
      }));
      setReplyingTo(null);

      toast.success("Respuesta añadida");
      await fetchPosts();
    } catch (error: any) {
      console.error("Error al responder comentario:", error);
      toast.error(
        error.response?.data?.error || "No se pudo añadir la respuesta",
      );
    }
  };

  // Reaccionar a un comentario o a una respuesta.
  const handleCommentReaction = async (
    postId: number,
    commentId: number,
    type: ReactionType,
  ) => {
    setActiveReactionCommentId(null);

    try {
      const response = await api.post(
        `/posts/${postId}/comments/${commentId}/reaction`,
        { type },
      );

      setPosts((currentPosts) =>
        currentPosts.map((post) => {
          if (post.id !== postId) return post;

          return {
            ...post,
            comments: post.comments.map((comment) => {
              if (comment.id === commentId) {
                return {
                  ...comment,
                  myReaction: response.data.myReaction,
                  reactionsCount: response.data.reactionsCount,
                  reactionCounts: {
                    ...EMPTY_COUNTS,
                    ...response.data.reactionCounts,
                  },
                };
              }

              return {
                ...comment,
                replies: (comment.replies ?? []).map((reply) =>
                  reply.id === commentId
                    ? {
                        ...reply,
                        myReaction: response.data.myReaction,
                        reactionsCount: response.data.reactionsCount,
                        reactionCounts: {
                          ...EMPTY_COUNTS,
                          ...response.data.reactionCounts,
                        },
                      }
                    : reply,
                ),
              };
            }),
          };
        }),
      );
    } catch (error: any) {
      console.error("Error al reaccionar al comentario:", error);
      toast.error(
        error.response?.data?.error || "No se pudo guardar la reacción",
      );
    }
  };

  // Eliminar un comentario o una respuesta.
  const handleDeleteComment = async (post: Post, comment: Comment) => {
    setOpenCommentMenuId(null);

    const confirmed = window.confirm(
      "¿Estás seguro de que deseas eliminar este comentario? Sus respuestas también se eliminarán.",
    );

    if (!confirmed) return;

    setDeletingCommentIds((current) => [...current, comment.id]);
    setOpenCommentMenuId(null);

    try {
      await api.delete(`/posts/${post.id}/comments/${comment.id}`);

      setPosts((currentPosts) =>
        currentPosts.map((item) => {
          if (item.id !== post.id) return item;

          return {
            ...item,
            comments: item.comments
              .filter((rootComment) => rootComment.id !== comment.id)
              .map((rootComment) => ({
                ...rootComment,
                replies: (rootComment.replies ?? []).filter(
                  (reply) => reply.id !== comment.id,
                ),
              })),
          };
        }),
      );

      if (replyingTo?.commentId === comment.id) {
        setReplyingTo(null);
      }

      toast.success("Comentario eliminado correctamente");
    } catch (error: any) {
      console.error("Error al eliminar comentario:", error);
      toast.error(
        error.response?.data?.error || "No se pudo eliminar el comentario",
      );
    } finally {
      setDeletingCommentIds((current) =>
        current.filter((id) => id !== comment.id),
      );
    }
  };

  // Avatar con fotografía o iniciales
  const avatar = (name: string, url: string | null, size = "w-11 h-11") => {
    const initials = (name || "Usuario")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");

    const colors = [
      "bg-sky-600",
      "bg-purple-600",
      "bg-emerald-600",
      "bg-pink-600",
      "bg-orange-600",
      "bg-indigo-600",
    ];

    const colorIndex =
      (name || "Usuario")
        .split("")
        .reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length;

    const fallbackSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" rx="50" fill="#2563eb"/>
        <text x="50" y="55" text-anchor="middle"
          dominant-baseline="middle"
          font-family="Arial" font-size="38"
          font-weight="bold" fill="white">
          ${initials || "?"}
        </text>
      </svg>
    `;

    if (url) {
      return (
        <img
          src={getFileUrl(url)}
          alt={name}
          className={`${size} rounded-full object-cover shrink-0`}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(fallbackSvg)}`;
          }}
        />
      );
    }

    return (
      <div
        className={`${size} ${colors[colorIndex]} rounded-full shrink-0 flex items-center justify-center text-white font-bold`}
        title={name}
      >
        {initials || "?"}
      </div>
    );
  };

  // Iconos
  const icon = (name: string, alt: string, className = "w-5 h-5") => (
    <img
      src={`${IMAGE_URL}/${name}.svg`}
      alt={alt}
      className={`${className} object-contain`}
    />
  );

  // Mostrar archivos adjuntos de publicaciones o sub-publicaciones
  const renderMediaItems = (media?: PostMedia[], imageUrl?: string | null) => {
    if (media && media.length > 0) {
      return (
        <div className="grid grid-cols-1 gap-3 mb-3">
          {media.map((item) => {
            const fileType = getFileType(item.mimeType);
            const fileUrl = getFileUrl(item.url);

            if (fileType === "image") {
              return (
                <img
                  key={item.id}
                  src={fileUrl}
                  alt={item.originalName || "Imagen de publicación"}
                  className="w-full max-h-125 object-contain rounded-2xl border border-[#38444d] bg-[#15202b]"
                  loading="lazy"
                />
              );
            }

            if (fileType === "video") {
              return (
                <video
                  key={item.id}
                  src={fileUrl}
                  controls
                  preload="metadata"
                  className="w-full max-h-125 rounded-2xl border border-[#38444d] bg-black"
                >
                  Tu navegador no puede reproducir este video.
                </video>
              );
            }

            if (fileType === "audio") {
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-[#253341] border border-[#38444d] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">🎵</span>
                      <p className="text-sm font-semibold text-white truncate">
                        {item.originalName || "Audio"}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatFileSize(item.fileSize)}
                    </span>
                  </div>

                  <audio
                    src={fileUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                  >
                    Tu navegador no puede reproducir este audio.
                  </audio>
                </div>
              );
            }

            return (
              <a
                key={item.id}
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 rounded-xl bg-[#253341] border border-[#38444d] hover:bg-[#304253] transition"
              >
                <span className="text-3xl">📄</span>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {item.originalName}
                  </p>

                  <p className="text-xs text-gray-400">
                    {formatFileSize(item.fileSize)}
                  </p>
                </div>

                <span className="text-sky-400 text-sm font-semibold">
                  Abrir
                </span>
              </a>
            );
          })}
        </div>
      );
    }

    if (imageUrl) {
      return (
        <img
          src={getFileUrl(imageUrl)}
          alt="Publicación"
          className="w-full max-h-125 object-contain rounded-2xl border border-[#38444d] mb-3 bg-[#15202b]"
          loading="lazy"
        />
      );
    }

    return null;
  };

  // Renderizar un comentario principal o una respuesta con las opciones de Facebook.
  const renderComment = (comment: Comment, post: Post, isReply = false) => {
    const myReaction = getMyReaction(comment.myReaction ?? null);
    const reactionCounts = {
      ...EMPTY_COUNTS,
      ...(comment.reactionCounts ?? {}),
    };
    const reactionsCount =
      comment.reactionsCount ??
      Object.values(reactionCounts).reduce((total, count) => total + count, 0);
    const replies = comment.replies ?? [];
    const isDeleting = deletingCommentIds.includes(comment.id);
    const isAdmin = user?.role === "ADMIN" || user?.role === "ADMINISTRADOR";
    const canDeleteComment = comment.author.id === user?.id || isAdmin;

    return (
      <div
        key={comment.id}
        className={`${isReply ? "ml-9 sm:ml-11" : ""} space-y-2`}
      >
        <div className="flex items-start gap-2">
          {avatar(
            comment.author.name,
            comment.author.avatarUrl,
            isReply ? "w-7 h-7" : "w-8 h-8",
          )}

          <div className="min-w-0 flex-1">
            <div className="inline-block max-w-full bg-[#253341] rounded-2xl px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-xs text-white wrap-break-word">
                  {comment.author.name}
                </p>

                {canDeleteComment && (
                  <div
                    data-comment-menu
                    className="relative shrink-0 -mr-1 -mt-1"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCommentMenuId((current) =>
                          current === comment.id ? null : comment.id,
                        )
                      }
                      aria-label="Opciones del comentario"
                      aria-expanded={openCommentMenuId === comment.id}
                      className="w-7 h-7 rounded-full text-gray-400 hover:text-white hover:bg-[#38444d] flex items-center justify-center transition"
                    >
                      <span className="text-xl leading-none">⋯</span>
                    </button>

                    {openCommentMenuId === comment.id && (
                      <div className="absolute right-0 top-full mt-1 z-40 w-48 bg-[#192734] border border-[#38444d] rounded-xl shadow-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenCommentMenuId(null);
                            handleDeleteComment(post, comment);
                          }}
                          disabled={isDeleting}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-400 hover:bg-red-600 hover:text-white text-sm font-semibold transition disabled:opacity-50"
                        >
                          <span>🗑️</span>
                          {isDeleting ? "Eliminando..." : "Eliminar comentario"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-200 whitespace-pre-wrap wrap-break-word}">
                {comment.content}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 ml-2 text-xs">
              <div
                data-comment-reactions
                className="relative inline-flex items-center gap-1"
                onMouseEnter={() => setActiveReactionCommentId(comment.id)}
              >
                <button
                  type="button"
                  onClick={() =>
                    handleCommentReaction(
                      post.id,
                      comment.id,
                      comment.myReaction ?? "LIKE",
                    )
                  }
                  className={`font-bold hover:underline ${
                    myReaction ? "text-sky-400" : "text-gray-400"
                  }`}
                  aria-label={myReaction ? "Quitar mi reacción" : "Me gusta"}
                  title={
                    myReaction ? "Pulsa para quitar tu reacción" : "Me gusta"
                  }
                >
                  {myReaction
                    ? `${myReaction.emoji} ${myReaction.label}`
                    : "Me gusta"}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveReactionCommentId(comment.id)}
                  className="px-1 text-gray-400 hover:text-white rounded"
                  aria-label="Elegir otra reacción"
                  aria-expanded={activeReactionCommentId === comment.id}
                  title="Elegir reacción"
                >
                  ▾
                </button>

                {activeReactionCommentId === comment.id && (
                  <div className="absolute bottom-full left-0 z-40 bg-[#192734] border border-[#38444d] shadow-xl rounded-full px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                    {REACTIONS.map((reaction) => (
                      <button
                        key={reaction.type}
                        type="button"
                        title={reaction.label}
                        aria-label={reaction.label}
                        aria-pressed={comment.myReaction === reaction.type}
                        onClick={() =>
                          handleCommentReaction(
                            post.id,
                            comment.id,
                            reaction.type,
                          )
                        }
                        className={`text-xl sm:text-2xl hover:scale-125 transition-transform ${
                          comment.myReaction === reaction.type
                            ? "scale-125"
                            : ""
                        }`}
                      >
                        {reaction.emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!isReply && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo((current) =>
                      current?.commentId === comment.id
                        ? null
                        : {
                            postId: post.id,
                            commentId: comment.id,
                            authorName: comment.author.name,
                          },
                    );
                  }}
                  className="font-bold text-gray-400 hover:text-sky-400 hover:underline"
                >
                  Responder
                </button>
              )}

              {reactionsCount > 0 && (
                <span className="flex items-center gap-1 text-gray-400">
                  {REACTIONS.filter(
                    (reaction) => reactionCounts[reaction.type] > 0,
                  ).map((reaction) => (
                    <span key={reaction.type} title={reaction.label}>
                      {reaction.emoji}
                    </span>
                  ))}
                  <span>{reactionsCount}</span>
                </span>
              )}

              {comment.createdAt && (
                <span className="text-gray-500">
                  {new Date(comment.createdAt).toLocaleString("es-PE", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isReply && replies.length > 0 && (
          <div className="space-y-3 pt-1">
            {replies
              .slice(0, visibleRepliesCount[comment.id] ?? REPLIES_PER_BATCH)
              .map((reply) => renderComment(reply, post, true))}

            {(visibleRepliesCount[comment.id] ?? REPLIES_PER_BATCH) <
              replies.length && (
              <button
                type="button"
                onClick={() =>
                  setVisibleRepliesCount((current) => ({
                    ...current,
                    [comment.id]: Math.min(
                      replies.length,
                      (current[comment.id] ?? REPLIES_PER_BATCH) +
                        REPLIES_PER_BATCH,
                    ),
                  }))
                }
                className="ml-9 sm:ml-11 flex items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300 transition"
                aria-label="Mostrar cuatro respuestas más"
              >
                <span aria-hidden="true">⌄</span>
                Ver{" "}
                {Math.min(
                  REPLIES_PER_BATCH,
                  replies.length -
                    (visibleRepliesCount[comment.id] ?? REPLIES_PER_BATCH),
                )}{" "}
                respuestas más
              </button>
            )}

            {(visibleRepliesCount[comment.id] ?? REPLIES_PER_BATCH) >
              REPLIES_PER_BATCH && (
              <button
                type="button"
                onClick={() =>
                  setVisibleRepliesCount((current) => ({
                    ...current,
                    [comment.id]: REPLIES_PER_BATCH,
                  }))
                }
                className="ml-9 sm:ml-11 text-xs font-semibold text-gray-400 hover:text-sky-400 transition"
              >
                Mostrar menos respuestas
              </button>
            )}
          </div>
        )}

        {!isReply &&
          replyingTo?.postId === post.id &&
          replyingTo.commentId === comment.id && (
            <form
              onSubmit={(e) => handleReply(post.id, comment.id, e)}
              className="ml-9 sm:ml-11 flex items-center gap-2"
            >
              {avatar(
                currentUser?.name || user?.name || "Usuario",
                userAvatarUrl,
                "w-7 h-7",
              )}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  autoFocus
                  maxLength={5000}
                  value={replyInput[comment.id] ?? ""}
                  onChange={(e) =>
                    setReplyInput((current) => ({
                      ...current,
                      [comment.id]: e.target.value,
                    }))
                  }
                  placeholder={`Respondiendo a ${replyingTo.authorName}...`}
                  className="w-full bg-[#253341] rounded-full px-4 py-2 text-sm text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <button
                type="submit"
                disabled={!replyInput[comment.id]?.trim()}
                className="text-sky-400 font-bold text-sm hover:text-sky-300 disabled:opacity-40"
              >
                Enviar
              </button>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-gray-400 hover:text-white text-sm"
                aria-label="Cancelar respuesta"
              >
                ×
              </button>
            </form>
          )}
      </div>
    );
  };

  const filteredShareUsers = shareUsers.filter((u) =>
    u.name.toLowerCase().includes(shareSearch.trim().toLowerCase()),
  );

  // ==========================================
  // BLOQUE 2: OBTENER URL DE FOTO DEL USUARIO
  // ==========================================
  const userAvatarUrl =
    (currentUser as any)?.avatarUrl ||
    (currentUser as any)?.avatar ||
    (currentUser as any)?.photoUrl ||
    null;

  const userCoverUrl =
    (currentUser as any)?.coverUrl ||
    (currentUser as any)?.cover ||
    (currentUser as any)?.bannerUrl ||
    null;

  return (
    <div className="min-h-screen bg-[#15202b] text-white">
      {/* BARRA SUPERIOR */}
      <header className="fixed top-0 left-0 right-0 z-40 h-15 bg-[#15202b]/95 border-b border-[#38444d] backdrop-blur">
        <div className="max-w-350 mx-auto h-full px-4 lg:px-8 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0 flex items-center gap-2">
            <img
              src={`${IMAGE_URL}/logo.svg`}
              alt="RedSocial"
              className="w-10 h-10 object-contain"
            />

            <span className="text-xl font-bold text-sky-400">RedSocial</span>
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("feed")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full hover:bg-[#253341] font-semibold transition ${
                activeTab === "feed" ? "text-sky-400" : "text-white"
              }`}
            >
              {icon("home", "Inicio")}
              Inicio
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("notifications")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full hover:bg-[#253341] font-semibold transition ${
                activeTab === "notifications"
                  ? "text-sky-400 bg-[#253341]"
                  : "text-white"
              }`}
            >
              {icon("notification", "Notificaciones")}
              Notificaciones
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full hover:bg-[#253341] font-semibold transition ${
                activeTab === "chat" ? "text-sky-400" : "text-white"
              }`}
            >
              {icon("message", "Mensajes")}
              Mensajes
            </button>
          </nav>

          {/* BUSCADOR */}
          <div className="hidden lg:flex flex-1 max-w-90 relative">
            <img
              src={`${IMAGE_URL}/search.svg`}
              alt="Buscar"
              className="absolute left-4 top-3 w-4 h-4"
            />

            <input
              type="text"
              placeholder="Buscar en la red social"
              className="w-full rounded-full bg-[#253341] border border-transparent pl-11 pr-5 py-2.5 text-sm text-white placeholder-gray-400 focus:border-sky-500 outline-none"
            />
          </div>

          {/* USUARIO */}
          <div className="flex items-center gap-3">
            <NotificationBell />

            <Link to="/profile" title="Mi perfil">
              {avatar(
                currentUser?.name || user?.name || "Usuario",
                userAvatarUrl,
                "w-9 h-9",
              )}
            </Link>

            <button
              onClick={handleLogout}
              className="bg-[#253341] hover:bg-red-600 px-3 py-2 rounded-full text-sm font-semibold transition"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-350 mx-auto px-4 lg:px-8 pt-20.5 pb-10">
        <div
          className={`grid grid-cols-1 gap-6 ${
            activeTab === "chat" || activeTab === "notifications"
              ? "lg:grid-cols-[250px_minmax(0,1fr)]"
              : "lg:grid-cols-[250px_minmax(0,650px)_300px]"
          }`}
        >
          {/* PANEL IZQUIERDO */}
          <aside className="hidden lg:block">
            <div className="sticky top-20.5 space-y-4">
              {/* PERFIL */}
              <div className="bg-[#192734] rounded-2xl overflow-hidden border border-[#253341]">
                {/* FOTO DE PORTADA CLICKEABLE */}
                <div className="h-24 relative bg-linear-to-r from-sky-800 via-blue-700 to-indigo-800 flex items-center justify-center overflow-hidden">
                  {userCoverUrl ? (
                    <img
                      src={getFileUrl(userCoverUrl)}
                      alt="Foto de portada"
                      onClick={() =>
                        setViewingImage({
                          url: getFileUrl(userCoverUrl),
                          title: `Foto de portada de ${currentUser?.name || "Usuario"}`,
                        })
                      }
                      title="Haz clic para ver la foto de portada"
                      className="w-full h-full object-cover cursor-pointer hover:brightness-90 transition"
                    />
                  ) : (
                    <span className="text-white/80 font-bold text-lg">
                      RedSocial
                    </span>
                  )}
                </div>

                <div className="px-4 pb-4">
                  {/* AVATAR CLICKEABLE */}
                  <div
                    onClick={() => {
                      if (userAvatarUrl) {
                        setViewingImage({
                          url: getFileUrl(userAvatarUrl),
                          title: `Foto de perfil de ${currentUser?.name || "Usuario"}`,
                        });
                      }
                    }}
                    title={
                      userAvatarUrl
                        ? "Haz clic para ver la foto de perfil"
                        : undefined
                    }
                    className={`-mt-8 mb-2 relative z-10 w-fit rounded-full ${
                      userAvatarUrl
                        ? "cursor-pointer hover:brightness-90 transition"
                        : ""
                    }`}
                  >
                    {avatar(
                      currentUser?.name || "Usuario",
                      userAvatarUrl,
                      "w-16 h-16 border-4 border-[#192734]",
                    )}
                  </div>

                  <h2 className="font-bold text-lg">
                    {currentUser?.name || user?.name || "Usuario"}
                  </h2>

                  <p className="text-sm text-gray-400">
                    Mi perfil en RedSocial
                  </p>

                  <Link
                    to="/profile"
                    className="block text-center mt-4 border border-sky-500 text-sky-400 rounded-full py-2 font-bold text-sm hover:bg-sky-500/10"
                  >
                    Ver mi perfil
                  </Link>
                </div>
              </div>

              {/* MENÚ */}
              <div className="bg-[#192734] rounded-2xl p-4 border border-[#253341]">
                <h3 className="font-bold text-lg mb-3">Menú</h3>

                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("feed")}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#253341] text-left transition ${
                      activeTab === "feed"
                        ? "bg-[#253341] text-sky-400 font-semibold"
                        : ""
                    }`}
                  >
                    {icon("home", "Inicio")}
                    Inicio
                  </button>

                  <Link
                    to="/profile"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#253341]"
                  >
                    {avatar(
                      currentUser?.name || user?.name || "Usuario",
                      userAvatarUrl,
                      "w-6 h-6",
                    )}
                    Mi perfil
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsFriendsOpen(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#253341] text-left transition"
                  >
                    <span className="w-5 h-5 flex items-center justify-center text-xl">
                      👥
                    </span>
                    Amigos
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#253341] text-left transition ${
                      activeTab === "chat"
                        ? "bg-[#253341] text-sky-400 font-semibold"
                        : ""
                    }`}
                  >
                    {icon("message", "Mensajes")}
                    Mensajes
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("notifications")}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#253341] text-left transition ${
                      activeTab === "notifications"
                        ? "bg-[#253341] text-sky-400 font-semibold"
                        : ""
                    }`}
                  >
                    {icon("notification", "Notificaciones")}
                    Notificaciones
                  </button>

                  {user?.role === "ADMIN" && (
                    <Link
                      to="/admin"
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#253341] text-sky-400"
                    >
                      ⚙️ Administración
                    </Link>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-500 px-2">
                RedSocial Privada · Tu comunidad digital
              </div>
            </div>
          </aside>

          {/* TIMELINE CENTRAL */}
          <section className="min-w-0">
            {activeTab === "chat" ? (
              <Chat />
            ) : activeTab === "notifications" ? (
              <NotificationsPanel
                onGoToFeed={() => setActiveTab("feed")}
                onGoToChat={() => setActiveTab("chat")}
                onOpenFriends={() => setIsFriendsOpen(true)}
              />
            ) : (
              <>
                {/* HISTORIAS */}
                {user && (
                  <Stories
                    user={{
                      id: user.id,
                      name: currentUser?.name || user.name,
                      avatarUrl: userAvatarUrl,
                    }}
                  />
                )}

                {/* CREAR PUBLICACIÓN */}
                <div className="bg-[#192734] rounded-2xl border border-[#253341] overflow-hidden mb-5">
                  <div className="px-5 py-4 border-b border-[#38444d]">
                    <h1 className="text-xl font-bold">Inicio</h1>

                    <p className="text-xs text-gray-400 mt-1">
                      Comparte lo que está pasando
                    </p>
                  </div>

                  <form onSubmit={handleCreatePost} className="p-4">
                    <div className="flex gap-3">
                      {avatar(
                        currentUser?.name || user?.name || "Usuario",
                        userAvatarUrl,
                      )}

                      <textarea
                        className="flex-1 resize-none bg-transparent outline-none text-white placeholder-gray-400 text-lg pt-2 min-w-0"
                        rows={3}
                        placeholder={`¿Qué estás pensando, ${currentUser?.name || user?.name || "usuario"}?`}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                      />
                    </div>

                    {/* VISTAS PREVIAS DE ARCHIVOS */}
                    {selectedFiles.length > 0 && (
                      <div className="ml-14 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedFiles.map((file, index) => {
                          const fileType = getFileType(file.type);
                          const preview = previewUrls[index];

                          return (
                            <div
                              key={`${file.name}-${index}`}
                              className="relative bg-[#253341] border border-[#38444d] rounded-xl overflow-hidden"
                            >
                              {fileType === "image" && preview && (
                                <img
                                  src={preview}
                                  alt={file.name}
                                  className="w-full h-40 object-cover"
                                />
                              )}

                              {fileType === "video" && preview && (
                                <video
                                  src={preview}
                                  controls
                                  className="w-full h-40 object-contain bg-black"
                                />
                              )}

                              {fileType === "audio" && preview && (
                                <div className="h-40 flex flex-col items-center justify-center gap-3 p-3 bg-[#15202b]">
                                  <span className="text-4xl">🎵</span>
                                  <audio
                                    src={preview}
                                    controls
                                    className="w-full max-w-full"
                                  />
                                </div>
                              )}

                              {fileType === "document" && (
                                <div className="h-40 flex flex-col items-center justify-center gap-2 p-3">
                                  <span className="text-5xl">📄</span>
                                  <span className="text-sm text-center break-all">
                                    {file.name}
                                  </span>
                                </div>
                              )}

                              <div className="p-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs truncate">
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {formatFileSize(file.size)}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeSelectedFile(index)}
                                  className="shrink-0 bg-red-600 hover:bg-red-700 rounded-full px-3 py-1 text-xs font-bold"
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* BOTONES DEL FORMULARIO */}
                    <div className="flex flex-wrap justify-between items-center border-t border-[#38444d] mt-4 pt-3 pl-12 gap-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        <label className="cursor-pointer text-sky-400 hover:text-sky-300 text-sm font-semibold flex items-center gap-2">
                          📷 Fotos y videos
                          <input
                            id="post-files"
                            type="file"
                            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                            multiple
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>

                        <span className="text-xs text-gray-500">
                          {selectedFiles.length}/{MAX_FILES} archivos
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={
                          isPosting ||
                          (!content.trim() && selectedFiles.length === 0)
                        }
                        className="bg-sky-500 hover:bg-sky-600 disabled:opacity-40 px-6 py-2 rounded-full font-bold text-sm transition"
                      >
                        {isPosting ? "Publicando..." : "Publicar"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* PUBLICACIONES */}
                <div className="bg-[#192734] rounded-2xl border border-[#253341] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#38444d]">
                    <h2 className="font-bold text-lg">Publicaciones</h2>
                  </div>

                  {posts.map((post) => {
                    const currentReaction = getMyReaction(post.myReaction);
                    const commentsCount = post.comments.reduce(
                      (total, comment) =>
                        total + 1 + (comment.replies?.length ?? 0),
                      0,
                    );
                    const sharesCount = post.sharesCount ?? 0;

                    return (
                      <article
                        key={post.id}
                        className="p-5 border-b border-[#38444d] hover:bg-[#1b2b38] transition-colors"
                      >
                        {/* AUTOR Y MENÚ DE OPCIONES */}
                        <div className="flex items-center gap-3 mb-3">
                          {avatar(post.author.name, post.author.avatarUrl)}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold hover:text-sky-400 cursor-pointer">
                                {post.author.name}
                              </p>
                              {post.sharedPostId && (
                                <span className="text-xs text-gray-400">
                                  compartió una publicación
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-gray-400">
                              {new Date(post.createdAt).toLocaleString("es-PE")}
                              {post.isEdited && (
                                <span className="ml-2 text-gray-500">
                                  · Editado
                                </span>
                              )}
                            </p>
                          </div>

                          {(post.authorId === user?.id ||
                            user?.role === "ADMIN" ||
                            user?.role === "ADMINISTRADOR") && (
                            <div data-post-menu className="relative shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenPostMenuId((current) =>
                                    current === post.id ? null : post.id,
                                  )
                                }
                                aria-label="Opciones de publicación"
                                aria-expanded={openPostMenuId === post.id}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#38444d] transition"
                              >
                                <span className="text-2xl font-bold leading-none">
                                  ⋯
                                </span>
                              </button>

                              {openPostMenuId === post.id && (
                                <div className="absolute right-0 top-full mt-2 z-30 w-52 bg-[#253341] border border-[#38444d] rounded-xl shadow-xl overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPostMenuId(null);
                                      handleDeletePost(post);
                                    }}
                                    disabled={deletingPostIds.includes(post.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-400 hover:bg-red-600 hover:text-white transition disabled:opacity-50"
                                  >
                                    <span>🗑️</span>
                                    <span className="font-semibold text-sm">
                                      {deletingPostIds.includes(post.id)
                                        ? "Eliminando..."
                                        : "Eliminar publicación"}
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* TEXTO */}
                        {post.content && (
                          <p className="text-[15px] leading-6 whitespace-pre-wrap mb-3">
                            {post.content}
                          </p>
                        )}

                        {/* ARCHIVOS ADJUNTOS PROPIOS */}
                        {renderMediaItems(post.media, post.imageUrl)}

                        {/* TARJETA DE PUBLICACIÓN ORIGINAL SI ES UN COMPARTIDO */}
                        {post.sharedPostId && (
                          <div className="mb-3 rounded-2xl border border-[#38444d] bg-[#15202b]/80 p-4">
                            {post.sharedPost ? (
                              <>
                                <div className="flex items-center gap-2.5 mb-2.5">
                                  {avatar(
                                    post.sharedPost.author.name,
                                    post.sharedPost.author.avatarUrl,
                                    "w-8 h-8",
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-bold text-sm text-white truncate">
                                      {post.sharedPost.author.name}
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                      {new Date(
                                        post.sharedPost.createdAt,
                                      ).toLocaleString("es-PE")}
                                    </p>
                                  </div>
                                </div>

                                {post.sharedPost.content && (
                                  <p className="text-sm text-gray-200 whitespace-pre-wrap mb-2.5">
                                    {post.sharedPost.content}
                                  </p>
                                )}

                                {renderMediaItems(
                                  post.sharedPost.media,
                                  post.sharedPost.imageUrl,
                                )}
                              </>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                                <span>🔒</span>
                                <span>
                                  Esta publicación original ya no está
                                  disponible.
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* CONTADORES DE REACCIONES, COMENTARIOS Y COMPARTIDOS */}
                        {(post.likesCount > 0 ||
                          commentsCount > 0 ||
                          sharesCount > 0) && (
                          <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                            <div className="flex items-center gap-2">
                              {post.likesCount > 0 && (
                                <>
                                  <div className="flex -space-x-1">
                                    {REACTIONS.filter(
                                      (reaction) =>
                                        post.reactionCounts[reaction.type] > 0,
                                    ).map((reaction) => (
                                      <span
                                        key={reaction.type}
                                        title={reaction.label}
                                        className="bg-[#192734] rounded-full text-base"
                                      >
                                        {reaction.emoji}
                                      </span>
                                    ))}
                                  </div>
                                  <span>{post.likesCount} reacciones</span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              {commentsCount > 0 && (
                                <span>{commentsCount} comentarios</span>
                              )}
                              {sharesCount > 0 && (
                                <span>{sharesCount} compartidos</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* BOTONES: ME GUSTA, COMENTAR Y COMPARTIR */}
                        <div className="relative grid grid-cols-3 border-t border-[#38444d] pt-2 gap-2">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveReactionPost(
                                  activeReactionPost === post.id
                                    ? null
                                    : post.id,
                                )
                              }
                              className={`w-full flex justify-center items-center gap-2 py-2 rounded-lg hover:bg-[#253341] text-sm ${
                                currentReaction
                                  ? "text-sky-400 font-bold"
                                  : "text-gray-400"
                              }`}
                            >
                              {icon("like", "Me gusta")}
                              {currentReaction?.label || "Me gusta"}
                            </button>

                            {/* SELECTOR DE REACCIONES */}
                            {activeReactionPost === post.id && (
                              <div className="absolute bottom-full left-0 mb-2 z-20 bg-[#253341] border border-[#38444d] shadow-xl rounded-full px-3 py-2 flex gap-2">
                                {REACTIONS.map((reaction) => (
                                  <button
                                    key={reaction.type}
                                    type="button"
                                    title={reaction.label}
                                    onClick={() =>
                                      handleReaction(post.id, reaction.type)
                                    }
                                    className={`text-2xl hover:scale-125 transition-transform ${
                                      post.myReaction === reaction.type
                                        ? "scale-125"
                                        : ""
                                    }`}
                                  >
                                    {reaction.emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              document
                                .getElementById(`comment-${post.id}`)
                                ?.focus()
                            }
                            className="flex justify-center items-center gap-2 py-2 rounded-lg hover:bg-[#253341] text-gray-400 text-sm"
                          >
                            {icon("comments", "Comentarios")}
                            Comentar
                          </button>

                          <button
                            type="button"
                            onClick={() => openShareModal(post)}
                            className="flex justify-center items-center gap-2 py-2 rounded-lg hover:bg-[#253341] text-gray-400 hover:text-sky-400 text-sm transition"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-5 h-5"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                            Compartir
                          </button>
                        </div>

                        {/* DETALLE DE REACCIONES */}
                        {post.likesCount > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {REACTIONS.filter(
                              (reaction) =>
                                post.reactionCounts[reaction.type] > 0,
                            ).map((reaction) => (
                              <span
                                key={reaction.type}
                                className="text-xs bg-[#253341] rounded-full px-2 py-1 text-gray-300"
                              >
                                {reaction.emoji}{" "}
                                {post.reactionCounts[reaction.type]}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* COMENTARIOS Y RESPUESTAS */}
                        {post.comments.length > 0 && (
                          <div className="mt-4 space-y-4">
                            {post.comments.map((comment) =>
                              renderComment(comment, post),
                            )}
                          </div>
                        )}

                        {/* ESCRIBIR COMENTARIO */}
                        <form
                          onSubmit={(e) => handleComment(post.id, e)}
                          className="flex gap-2 mt-4"
                        >
                          {avatar(
                            user?.name || "Usuario",
                            userAvatarUrl,
                            "w-8 h-8",
                          )}

                          <input
                            id={`comment-${post.id}`}
                            type="text"
                            placeholder="Escribe un comentario..."
                            value={commentInput[post.id] || ""}
                            onChange={(e) =>
                              setCommentInput((current) => ({
                                ...current,
                                [post.id]: e.target.value,
                              }))
                            }
                            className="flex-1 min-w-0 bg-[#253341] rounded-full px-4 py-2 text-sm text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500"
                          />

                          <button
                            type="submit"
                            disabled={!commentInput[post.id]?.trim()}
                            className="text-sky-400 font-bold text-sm hover:text-sky-300 disabled:opacity-40"
                          >
                            Enviar
                          </button>
                        </form>
                      </article>
                    );
                  })}

                  {posts.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                      <div className="text-5xl mb-4">📝</div>

                      <p className="font-bold text-lg">
                        Todavía no hay publicaciones
                      </p>

                      <p className="text-sm mt-2">
                        ¡Sé el primero en compartir algo!
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* PANEL DERECHO */}
          {activeTab === "feed" && (
            <aside className="hidden xl:block">
              <div className="sticky top-20.5 space-y-5">
                {/* TENDENCIAS */}
                <div className="bg-[#192734] rounded-2xl border border-[#253341] overflow-hidden">
                  <div className="p-4">
                    <h2 className="font-bold text-lg">Tendencias</h2>

                    <p className="text-xs text-gray-400 mt-1">
                      Temas para descubrir
                    </p>
                  </div>

                  {[
                    ["#RedSocial", "Comunidad"],
                    ["#Tecnología", "Tecnología"],
                    ["#Programación", "Desarrollo"],
                    ["#Amigos", "Comunidad"],
                    ["#Noticias", "Actualidad"],
                  ].map(([tag, category]) => (
                    <div
                      key={tag}
                      className="px-4 py-3 border-t border-[#38444d] hover:bg-[#253341] cursor-pointer"
                    >
                      <p className="text-xs text-gray-400">{category}</p>

                      <p className="font-bold text-sky-400">{tag}</p>

                      <p className="text-xs text-gray-500">
                        Explorar conversación
                      </p>
                    </div>
                  ))}
                </div>

                {/* CUENTA */}
                <div className="bg-[#192734] rounded-2xl border border-[#253341] p-4">
                  <h2 className="font-bold text-lg mb-3">Tu cuenta</h2>

                  <div className="flex items-center gap-3 mb-4">
                    {avatar(
                      currentUser?.name || user?.name || "Usuario",
                      userAvatarUrl,
                    )}

                    <div className="min-w-0">
                      <p className="font-bold truncate">
                        {currentUser?.name || user?.name}
                      </p>

                      <p className="text-xs text-gray-400">
                        {user?.role === "ADMIN" ? "Administrador" : "Miembro"}
                      </p>
                    </div>
                  </div>

                  <Link
                    to="/profile"
                    className="block text-center border border-sky-500 text-sky-400 rounded-full py-2 font-bold text-sm hover:bg-sky-500/10"
                  >
                    Administrar perfil
                  </Link>
                </div>

                <footer className="px-2 text-xs text-gray-500 leading-6">
                  Privacidad · Condiciones · Ayuda
                  <br />© 2026 RedSocial Privada
                </footer>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* ======================================================
          MODAL DE COMPARTIR PUBLICACIÓN (ENVIAR A AMIGOS O MURO)
          ====================================================== */}
      {shareModalPost && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={closeShareModal}
        >
          <div
            className="w-full max-w-lg bg-[#192734] border border-[#38444d] rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABECERA MODAL */}
            <div className="px-5 py-4 border-b border-[#38444d] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Compartir publicación
              </h3>
              <button
                type="button"
                onClick={closeShareModal}
                className="w-8 h-8 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center text-xl"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* PESTAÑAS: ENVIAR A AMIGOS vs COMPARTIR EN MI MURO */}
            <div className="grid grid-cols-2 border-b border-[#38444d] bg-[#15202b]/50">
              <button
                type="button"
                onClick={() => setShareTab("DM")}
                className={`py-3 text-sm font-bold transition border-b-2 ${
                  shareTab === "DM"
                    ? "border-sky-500 text-sky-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                💬 Enviar por mensaje
              </button>

              <button
                type="button"
                onClick={() => setShareTab("FEED")}
                className={`py-3 text-sm font-bold transition border-b-2 ${
                  shareTab === "FEED"
                    ? "border-sky-500 text-sky-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                📢 Compartir en mi muro
              </button>
            </div>

            {/* VISTA PREVIA COMPACTA DEL POST A COMPARTIR */}
            <div className="px-5 pt-4">
              <div className="rounded-xl border border-[#38444d] bg-[#15202b] p-3 flex items-center gap-3">
                {avatar(
                  (shareModalPost.sharedPost ?? shareModalPost).author.name,
                  (shareModalPost.sharedPost ?? shareModalPost).author
                    .avatarUrl,
                  "w-9 h-9",
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">
                    {(shareModalPost.sharedPost ?? shareModalPost).author.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {(shareModalPost.sharedPost ?? shareModalPost).content ||
                      "Publicación multimedia"}
                  </p>
                </div>
              </div>
            </div>

            {/* TAB 1: ENVIAR POR MENSAJE DIRECTO A AMIGOS */}
            {shareTab === "DM" && (
              <form onSubmit={handleSendPostByDm} className="p-5 space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Buscar amigo o persona..."
                    value={shareSearch}
                    onChange={(e) => setShareSearch(e.target.value)}
                    className="w-full rounded-full bg-[#253341] px-4 py-2 text-sm text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* LISTA DE DESTINATARIOS */}
                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  {isLoadingShareUsers ? (
                    <p className="text-center text-sm text-gray-400 py-6">
                      Cargando personas...
                    </p>
                  ) : filteredShareUsers.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-6">
                      No se encontraron usuarios.
                    </p>
                  ) : (
                    filteredShareUsers.map((person) => {
                      const isSelected = selectedRecipientIds.includes(
                        person.id,
                      );
                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => toggleRecipient(person.id)}
                          className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl transition text-left ${
                            isSelected
                              ? "bg-sky-500/20 border border-sky-500/50"
                              : "hover:bg-[#253341] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {avatar(person.name, person.avatarUrl, "w-9 h-9")}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {person.name}
                              </p>
                              {person.bio && (
                                <p className="text-xs text-gray-400 truncate">
                                  {person.bio}
                                </p>
                              )}
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center border text-xs font-bold shrink-0 ${
                              isSelected
                                ? "bg-sky-500 border-sky-500 text-white"
                                : "border-gray-500 text-transparent"
                            }`}
                          >
                            ✓
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Escribe un mensaje opcional..."
                  value={shareCaption}
                  onChange={(e) => setShareCaption(e.target.value)}
                  maxLength={2000}
                  className="w-full rounded-xl bg-[#253341] px-4 py-2.5 text-sm text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500"
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeShareModal}
                    className="px-4 py-2 rounded-full bg-[#253341] hover:bg-[#304253] text-sm font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSharing || selectedRecipientIds.length === 0}
                    className="px-5 py-2 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-sm font-bold transition"
                  >
                    {isSharing
                      ? "Enviando..."
                      : selectedRecipientIds.length > 0
                        ? `Enviar (${selectedRecipientIds.length})`
                        : "Enviar"}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: COMPARTIR EN EL MURO */}
            {shareTab === "FEED" && (
              <form onSubmit={handleShareToFeed} className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {avatar(
                      currentUser?.name || user?.name || "Usuario",
                      userAvatarUrl,
                      "w-9 h-9",
                    )}
                    <span className="font-bold text-sm">
                      {currentUser?.name || user?.name || "Usuario"}
                    </span>
                  </div>

                  <select
                    value={sharePrivacy}
                    onChange={(e) => setSharePrivacy(e.target.value)}
                    className="bg-[#253341] border border-[#38444d] rounded-full px-3 py-1 text-xs text-gray-200 outline-none"
                  >
                    <option value="FRIENDS">👥 Amigos</option>
                    <option value="PUBLIC">🌎 Público</option>
                  </select>
                </div>

                <textarea
                  rows={3}
                  placeholder="Di algo sobre esta publicación (opcional)..."
                  value={shareCaption}
                  onChange={(e) => setShareCaption(e.target.value)}
                  maxLength={5000}
                  className="w-full resize-none rounded-xl bg-[#253341] p-3 text-sm text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500"
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeShareModal}
                    className="px-4 py-2 rounded-full bg-[#253341] hover:bg-[#304253] text-sm font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSharing}
                    className="px-5 py-2 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-sm font-bold transition"
                  >
                    {isSharing ? "Compartiendo..." : "Compartir ahora"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <FriendsModal
        isOpen={isFriendsOpen}
        onClose={() => setIsFriendsOpen(false)}
      />

      {/* VISOR DE IMAGEN A PANTALLA COMPLETA */}
      {viewingImage && (
        <div
          onClick={() => setViewingImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
        >
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
