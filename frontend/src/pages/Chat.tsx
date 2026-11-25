import { useAuthStore } from "../store/authStore";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { FormEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import toast from "react-hot-toast";
import { useCall } from "../context/CallContext";
import { SOCKET_URL } from "../lib/socketUrl";

interface ChatUser {
  id: number;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  unreadCount?: number;
}

interface MessageMedia {
  id: number;
  url: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  mediaType: string;
  position: number;
}

interface MessageReaction {
  id: number;
  emoji: string;
  userId: number;
  user: {
    id: number;
    name: string;
  };
}

interface ReplyPreview {
  id: number;
  content: string;
  senderId: number;
  deletedForAll?: boolean;
  isViewOnce?: boolean;
  sender: {
    id: number;
    name: string;
  };
  media?: {
    id: number;
    mediaType: string;
    originalName: string;
  }[];
}

interface SharedPostPreview {
  id: number;
  content: string;
  imageUrl: string | null;
  privacy: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
  media?: {
    id: number;
    url: string;
    originalName: string;
    mimeType: string;
    mediaType: string;
  }[];
}

interface Message {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  createdAt: string;
  isRead?: boolean;
  readAt?: string | null;
  isViewOnce?: boolean;
  viewedAt?: string | null;
  deletedForAll?: boolean;
  replyToId?: number | null;
  replyTo?: ReplyPreview | null;
  reactions?: MessageReaction[];
  media?: MessageMedia[];
  sharedPostId?: number | null;
  sharedPost?: SharedPostPreview | null;
}

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"];

const CHAT_EMOJIS = [
  "😀",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤩",
  "🥳",
  "😅",
  "😭",
  "😡",
  "🤔",
  "🙄",
  "😴",
  "🤗",
  "🤐",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "🤝",
  "✌️",
  "💪",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🔥",
  "⭐",
  "✨",
  "🎉",
  "💯",
  "💬",
  "🎵",
  "🚀",
];

interface ChatSticker {
  id: string;
  label: string;
  pack: string;
  src: string;
  custom?: boolean;
}

const CUSTOM_STICKERS_STORAGE_KEY = "redsocial_custom_stickers_v1";

const makeStickerSvg = (bg: string, face: string, badge: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140">
      <rect width="140" height="140" rx="34" fill="${bg}"/>
      <circle cx="70" cy="74" r="44" fill="#ffffff" fill-opacity="0.96"/>
      <text x="70" y="88" text-anchor="middle" font-size="52" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${face}</text>
      <circle cx="108" cy="30" r="20" fill="#0f172a"/>
      <text x="108" y="37" text-anchor="middle" font-size="20" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${badge}</text>
    </svg>`,
  )}`;

const BUILTIN_STICKERS: ChatSticker[] = [
  // Pack Reacciones
  {
    id: "hola",
    label: "Hola saludo",
    pack: "Reacciones",
    src: makeStickerSvg("#0284c7", "👋", "✨"),
  },
  {
    id: "risa",
    label: "Jajaja risa",
    pack: "Reacciones",
    src: makeStickerSvg("#eab308", "😂", "🔥"),
  },
  {
    id: "amor",
    label: "Me encanta amor",
    pack: "Reacciones",
    src: makeStickerSvg("#e11d48", "🥰", "❤️"),
  },
  {
    id: "cool",
    label: "Genial cool",
    pack: "Reacciones",
    src: makeStickerSvg("#0d9488", "😎", "👍"),
  },
  {
    id: "sorpresa",
    label: "Qué sorpresa",
    pack: "Reacciones",
    src: makeStickerSvg("#ea580c", "😮", "⚡"),
  },
  {
    id: "triste",
    label: "Triste llorar",
    pack: "Reacciones",
    src: makeStickerSvg("#475569", "😢", "💙"),
  },
  {
    id: "enojo",
    label: "Enojado furia",
    pack: "Reacciones",
    src: makeStickerSvg("#dc2626", "😡", "💥"),
  },
  {
    id: "pensando",
    label: "Pensando duda",
    pack: "Reacciones",
    src: makeStickerSvg("#6366f1", "🤔", "❓"),
  },

  // Pack Fiesta & Ánimo
  {
    id: "fiesta",
    label: "Fiesta celebrar",
    pack: "Fiesta",
    src: makeStickerSvg("#7c3aed", "🥳", "🎉"),
  },
  {
    id: "gracias",
    label: "Gracias por favor",
    pack: "Fiesta",
    src: makeStickerSvg("#16a34a", "🙏", "💯"),
  },
  {
    id: "aplausos",
    label: "Aplausos bravo",
    pack: "Fiesta",
    src: makeStickerSvg("#d97706", "👏", "🌟"),
  },
  {
    id: "fuerte",
    label: "Vamos ánimo fuerza",
    pack: "Fiesta",
    src: makeStickerSvg("#2563eb", "💪", "🚀"),
  },
  {
    id: "dormir",
    label: "Sueño cansado",
    pack: "Fiesta",
    src: makeStickerSvg("#334155", "😴", "💤"),
  },
  {
    id: "abrazo",
    label: "Abrazo cariño",
    pack: "Fiesta",
    src: makeStickerSvg("#db2777", "🤗", "💕"),
  },
  {
    id: "musica",
    label: "Música ritmo",
    pack: "Fiesta",
    src: makeStickerSvg("#9333ea", "🤩", "🎵"),
  },
  {
    id: "exito",
    label: "Éxito logro",
    pack: "Fiesta",
    src: makeStickerSvg("#059669", "🙌", "🏆"),
  },
];

const loadCustomStickers = (): ChatSticker[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_STICKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.src === "string",
    );
  } catch {
    return [];
  }
};

const STICKER_PREFIX = "[sticker:";

const parseStickerContent = (
  text?: string | null,
): { label: string; src: string } | null => {
  if (!text || !text.startsWith(STICKER_PREFIX) || !text.endsWith("]")) {
    return null;
  }
  const inner = text.slice(STICKER_PREFIX.length, -1);
  const sepIndex = inner.indexOf("|");
  if (sepIndex === -1) return null;
  const label = inner.slice(0, sepIndex);
  const src = inner.slice(sepIndex + 1);
  const isAllowedSrc =
    src.startsWith("data:image/svg+xml") ||
    src.startsWith("data:image/png") ||
    src.startsWith("data:image/jpeg") ||
    src.startsWith("data:image/webp") ||
    src.startsWith("data:image/gif") ||
    src.startsWith("https://") ||
    src.startsWith("http://") ||
    src.startsWith("/");
  if (!isAllowedSrc) return null;
  return { label, src };
};
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

export default function Chat() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { startCall, isBusy } = useCall();

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deletingMessageIds, setDeletingMessageIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Fases 2, 3 y 4: Ver una vez (①), Responder, Menú contextual y Eliminar
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [viewingOnceData, setViewingOnceData] = useState<{
    id: number;
    content: string;
    media: MessageMedia[];
    senderName: string;
  } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "sticker">("emoji");
  const [stickerSearch, setStickerSearch] = useState("");
  const [stickerPack, setStickerPack] = useState<string>("Todos");
  const [customStickers, setCustomStickers] = useState<ChatSticker[]>(() =>
    loadCustomStickers(),
  );
  const [newStickerName, setNewStickerName] = useState("");
  const stickerUploadInputRef = useRef<HTMLInputElement>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [deleteModalMessage, setDeleteModalMessage] = useState<Message | null>(
    null,
  );

  // Fase 5: Presencia en tiempo real ("En línea" / "Última vez") e indicador "escribiendo..."
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [lastSeenByUser, setLastSeenByUser] = useState<Record<number, string>>(
    {},
  );
  const [typingUserIds, setTypingUserIds] = useState<Set<number>>(new Set());

  const selectedUserIdRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutsRef = useRef<
    Record<number, ReturnType<typeof setTimeout>>
  >({});

  selectedUserIdRef.current = selectedUser?.id ?? null;
  const token = localStorage.getItem("token");

  const getFileUrl = (url: string) => {
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("data:")
    ) {
      return url;
    }
    return `${SOCKET_URL}${url.startsWith("/") ? url : `/${url}`}`;
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatLastSeen = (iso?: string) => {
    if (!iso) return "Desconectado";
    const date = new Date(iso);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return isToday
      ? `últ. vez hoy a las ${time}`
      : `últ. vez ${date.toLocaleDateString()} ${time}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (media: MessageMedia) =>
    media.mediaType === "IMAGE" || media.mimeType.startsWith("image/");

  const isVideo = (media: MessageMedia) =>
    media.mediaType === "VIDEO" || media.mimeType.startsWith("video/");

  const scrollToMessage = (messageId: number) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-sky-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-sky-400"), 1400);
    }
  };

  // Socket.IO
  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    let errorShown = false;
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      errorShown = false;
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("connect_error", () => {
      setConnected(false);
      if (!errorShown) {
        toast.error("No se pudo conectar al chat en tiempo real");
        errorShown = true;
      }
    });

    socket.on(
      "presence:sync",
      (data: { onlineUserIds: number[]; lastSeen: Record<string, string> }) => {
        setOnlineUserIds(new Set(data.onlineUserIds));
        const parsedLastSeen: Record<number, string> = {};
        Object.entries(data.lastSeen || {}).forEach(([id, iso]) => {
          parsedLastSeen[Number(id)] = iso;
        });
        setLastSeenByUser(parsedLastSeen);
      },
    );

    socket.on(
      "presence:update",
      (data: {
        userId: number;
        isOnline: boolean;
        lastSeen: string | null;
      }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (data.isOnline) next.add(data.userId);
          else next.delete(data.userId);
          return next;
        });

        if (!data.isOnline && data.lastSeen) {
          setLastSeenByUser((prev) => ({
            ...prev,
            [data.userId]: data.lastSeen!,
          }));
        }
      },
    );

    socket.on("chat:typing", (data: { fromUserId: number }) => {
      setTypingUserIds((prev) => new Set(prev).add(data.fromUserId));

      if (remoteTypingTimeoutsRef.current[data.fromUserId]) {
        clearTimeout(remoteTypingTimeoutsRef.current[data.fromUserId]);
      }
      remoteTypingTimeoutsRef.current[data.fromUserId] = setTimeout(() => {
        setTypingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(data.fromUserId);
          return next;
        });
      }, 3000);
    });

    socket.on("chat:stop_typing", (data: { fromUserId: number }) => {
      if (remoteTypingTimeoutsRef.current[data.fromUserId]) {
        clearTimeout(remoteTypingTimeoutsRef.current[data.fromUserId]);
      }
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(data.fromUserId);
        return next;
      });
    });

    socket.on("new_message", (message: Message) => {
      const selectedId = selectedUserIdRef.current;

      setTypingUserIds((prev) => {
        if (!prev.has(message.senderId)) return prev;
        const next = new Set(prev);
        next.delete(message.senderId);
        return next;
      });

      if (message.senderId !== user?.id && selectedId !== message.senderId) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === message.senderId
              ? { ...u, unreadCount: (u.unreadCount || 0) + 1 }
              : u,
          ),
        );
      }

      if (
        selectedId === null ||
        (message.senderId !== selectedId && message.receiverId !== selectedId)
      ) {
        return;
      }

      if (message.senderId === selectedId && !message.isViewOnce) {
        api.patch(`/messages/${selectedId}/read`).catch(() => {});
      }

      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
    });

    socket.on(
      "messages_read",
      (data: { readerId: number; messageIds: number[]; readAt: string }) => {
        if (selectedUserIdRef.current !== data.readerId) return;
        const readSet = new Set(data.messageIds);

        setMessages((current) =>
          current.map((m) =>
            readSet.has(m.id) ? { ...m, isRead: true, readAt: data.readAt } : m,
          ),
        );
      },
    );

    socket.on(
      "message_viewed_once",
      (data: { messageId: number; viewedAt: string }) => {
        setMessages((current) =>
          current.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  viewedAt: data.viewedAt,
                  isRead: true,
                  content: "",
                  media: [],
                }
              : m,
          ),
        );
      },
    );

    socket.on(
      "message_reacted",
      (data: { messageId: number; reactions: MessageReaction[] }) => {
        setMessages((current) =>
          current.map((m) =>
            m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
          ),
        );
      },
    );

    socket.on(
      "message_deleted",
      (data: { messageId: number; scope?: "everyone" | "me" }) => {
        if (data.scope === "everyone") {
          setMessages((current) =>
            current.map((m) =>
              m.id === data.messageId
                ? {
                    ...m,
                    deletedForAll: true,
                    content: "",
                    media: [],
                    reactions: [],
                    sharedPostId: null,
                    sharedPost: null,
                  }
                : m,
            ),
          );
        } else {
          setMessages((current) =>
            current.filter((m) => m.id !== data.messageId),
          );
        }
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id]);

  // Cargar usuarios
  useEffect(() => {
    api
      .get("/messages/users")
      .then((res) => setUsers(res.data))
      .catch(() => toast.error("Error al cargar los usuarios"));
  }, []);

  // Cargar conversación
  useEffect(() => {
    if (!selectedUser) {
      setMessages([]);
      setReplyingTo(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setReplyingTo(null);

    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUser.id ? { ...u, unreadCount: 0 } : u,
      ),
    );

    api
      .get(`/messages/${selectedUser.id}`)
      .then((res) => {
        if (!cancelled) {
          setMessages((current) => {
            const combined = [...res.data];
            current.forEach((m) => {
              if (!combined.some((item) => item.id === m.id)) combined.push(m);
            });
            return combined.sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            );
          });
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          if (err?.response?.status === 403) {
            setSelectedUser(null);
            toast.error(
              err.response?.data?.error ||
                "Solo puedes chatear con amigos que hayan aceptado tu solicitud",
            );
          } else {
            toast.error("Error al cargar la conversación");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const incomingFiles = Array.from(e.target.files || []);
    if (selectedFiles.length + incomingFiles.length > MAX_FILES) {
      toast.error("Puedes adjuntar máximo 10 archivos");
      e.target.value = "";
      return;
    }

    const validFiles: File[] = [];
    for (const file of incomingFiles) {
      const isAudio =
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|aac|webm|flac)$/i.test(file.name);

      if (!ALLOWED_TYPES.has(file.type) && !isAudio) {
        toast.error(`Tipo de archivo no permitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} supera el límite de 50 MB`);
        continue;
      }
      validFiles.push(file);
    }

    setSelectedFiles((current) => [...current, ...validFiles]);
    e.target.value = "";
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
  };

  const stopAudioRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
  };

  const toggleAudioRecording = async () => {
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }

    if (selectedFiles.length >= MAX_FILES) {
      toast.error("Puedes adjuntar máximo 10 archivos");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Tu navegador no soporta grabación de audio");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = recorder.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4") || mimeType.includes("m4a")
            ? "m4a"
            : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const audioFile = new File(
            [blob],
            `nota-de-voz-${Date.now()}.${ext}`,
            { type: mimeType },
          );
          setSelectedFiles((current) => [...current, audioFile]);
          toast.success("Audio grabado, listo para enviar");
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  };

  const handleContentInputChange = (value: string) => {
    setContent(value);
    if (!selectedUser || !socketRef.current) return;

    if (value.trim().length > 0) {
      socketRef.current.emit("chat:typing", { toUserId: selectedUser.id });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit("chat:stop_typing", {
          toUserId: selectedUser.id,
        });
      }, 2000);
    } else {
      socketRef.current.emit("chat:stop_typing", {
        toUserId: selectedUser.id,
      });
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !selectedUser ||
      sending ||
      (!content.trim() && selectedFiles.length === 0)
    )
      return;

    const receiverId = selectedUser.id;
    const messageContent = content.trim();
    const filesToSend = [...selectedFiles];
    const replyTarget = replyingTo;
    const viewOnceFlag = isViewOnce;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit("chat:stop_typing", { toUserId: receiverId });

    const formData = new FormData();
    formData.append("content", messageContent);
    formData.append("isViewOnce", String(viewOnceFlag));
    if (replyTarget) {
      formData.append("replyToId", String(replyTarget.id));
    }
    filesToSend.forEach((file) => formData.append("files", file));

    setSending(true);
    setContent("");
    setSelectedFiles([]);
    setReplyingTo(null);
    setIsViewOnce(false);

    try {
      const response = await api.post(`/messages/${receiverId}`, formData);
      const newMessage: Message = response.data;
      if (selectedUserIdRef.current === receiverId) {
        setMessages((current) =>
          current.some((item) => item.id === newMessage.id)
            ? current
            : [...current, newMessage],
        );
      }
    } catch (err: any) {
      setContent((current) => current || messageContent);
      setSelectedFiles((current) =>
        current.length === 0 ? filesToSend : current,
      );
      setReplyingTo((current) => current || replyTarget);
      setIsViewOnce(viewOnceFlag);
      toast.error(
        err?.response?.data?.error ||
          (err?.response?.status === 403
            ? "Solo puedes chatear con amigos que hayan aceptado tu solicitud"
            : "No se pudo enviar el mensaje"),
      );
    } finally {
      setSending(false);
    }
  };

  const handleOpenViewOnce = async (message: Message) => {
    if (!selectedUser) return;
    try {
      const res = await api.post(`/messages/${message.id}/open-once`);
      setViewingOnceData({
        ...res.data,
        senderName: selectedUser.name,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                viewedAt: res.data.viewedAt || new Date().toISOString(),
                isRead: true,
              }
            : m,
        ),
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Este mensaje ya expiró");
    }
  };

  const handleReactToMessage = async (messageId: number, emoji: string) => {
    setMenuMessage(null);
    try {
      const res = await api.post(`/messages/${messageId}/react`, { emoji });
      setMessages((current) =>
        current.map((m) =>
          m.id === messageId ? { ...m, reactions: res.data.reactions } : m,
        ),
      );
    } catch {
      toast.error("No se pudo registrar la reacción");
    }
  };

  const executeDeleteMessage = async (
    message: Message,
    scope: "me" | "everyone",
  ) => {
    setDeleteModalMessage(null);
    setDeletingMessageIds((current) => [...current, message.id]);

    try {
      await api.delete(`/messages/${message.id}?scope=${scope}`);

      if (scope === "everyone") {
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  deletedForAll: true,
                  content: "",
                  media: [],
                  reactions: [],
                  sharedPostId: null,
                  sharedPost: null,
                }
              : item,
          ),
        );
        toast.success("Mensaje eliminado para todos");
      } else {
        setMessages((current) =>
          current.filter((item) => item.id !== message.id),
        );
        toast.success("Mensaje eliminado para ti");
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || "No se pudo eliminar el mensaje",
      );
    } finally {
      setDeletingMessageIds((current) =>
        current.filter((id) => id !== message.id),
      );
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      handleContentInputChange(`${content}${emoji}`);
      return;
    }
    const start = input.selectionStart ?? content.length;
    const end = input.selectionEnd ?? content.length;
    const nextValue = content.slice(0, start) + emoji + content.slice(end);
    handleContentInputChange(nextValue);
    setTimeout(() => {
      input.focus();
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleUploadCustomSticker = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Solo puedes subir imágenes como sticker");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("El sticker debe pesar máximo 1.5 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const cleanName =
        newStickerName.trim() ||
        file.name.replace(/\.[^/.]+$/, "").slice(0, 24) ||
        "Mi sticker";
      const created: ChatSticker = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: cleanName,
        pack: "Mis stickers",
        src: reader.result,
        custom: true,
      };
      const updated = [created, ...customStickers];
      setCustomStickers(updated);
      setNewStickerName("");
      setStickerPack("Mis stickers");
      try {
        localStorage.setItem(
          CUSTOM_STICKERS_STORAGE_KEY,
          JSON.stringify(updated),
        );
        toast.success("Sticker guardado en tu librería");
      } catch {
        toast.error(
          "No se pudo guardar en el navegador (espacio lleno). Prueba una imagen más ligera.",
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteCustomSticker = (stickerId: string) => {
    const updated = customStickers.filter((s) => s.id !== stickerId);
    setCustomStickers(updated);
    try {
      localStorage.setItem(
        CUSTOM_STICKERS_STORAGE_KEY,
        JSON.stringify(updated),
      );
      toast.success("Sticker eliminado");
    } catch {
      toast.error("Error al actualizar tus stickers");
    }
  };

  const handleSendSticker = async (sticker: ChatSticker) => {
    if (!selectedUser || sending) return;
    const receiverId = selectedUser.id;
    const replyTarget = replyingTo;

    setPickerOpen(false);
    setSending(true);
    setReplyingTo(null);

    try {
      const payload: Record<string, string | number> = {
        content: `${STICKER_PREFIX}${sticker.label}|${sticker.src}]`,
        isViewOnce: "false",
      };
      if (replyTarget) {
        payload.replyToId = replyTarget.id;
      }
      const response = await api.post(`/messages/${receiverId}`, payload);
      const newMessage: Message = response.data;
      if (selectedUserIdRef.current === receiverId) {
        setMessages((current) =>
          current.some((item) => item.id === newMessage.id)
            ? current
            : [...current, newMessage],
        );
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "No se pudo enviar el sticker");
    } finally {
      setSending(false);
    }
  };

  const getMessageSummary = (msg: Message | ReplyPreview) => {
    if (msg.deletedForAll) return "🚫 Este mensaje fue eliminado";
    if (msg.isViewOnce) return "① Mensaje para ver una vez";
    const parsedSticker = parseStickerContent(msg.content);
    if (parsedSticker) return `🎨 Sticker: ${parsedSticker.label}`;
    if (msg.content) return msg.content;
    if (msg.media && msg.media.length > 0) {
      const type = msg.media[0].mediaType;
      if (type === "IMAGE") return "📷 Foto";
      if (type === "VIDEO") return "🎥 Video";
      return `📄 ${msg.media[0].originalName}`;
    }
    return "📌 Publicación compartida";
  };

  const renderReplyQuote = (message: Message, isMine: boolean) => {
    if (!message.replyTo) return null;
    const reply = message.replyTo;
    const replyAuthorName =
      reply.senderId === user?.id
        ? "Tú"
        : reply.sender?.name || selectedUser?.name;

    return (
      <div
        onClick={() => scrollToMessage(reply.id)}
        className={`mb-2 px-3 py-2 rounded-xl border-l-4 cursor-pointer transition text-xs ${
          isMine
            ? "bg-sky-800/60 border-sky-300 hover:bg-sky-800/80"
            : "bg-[#192734] border-sky-500 hover:bg-[#1e2f3f]"
        }`}
      >
        <p
          className={`font-bold mb-0.5 ${isMine ? "text-sky-200" : "text-sky-400"}`}
        >
          {replyAuthorName}
        </p>
        <p className="truncate opacity-85">{getMessageSummary(reply)}</p>
      </div>
    );
  };

  const renderMedia = (media: MessageMedia[]) => {
    if (!media || media.length === 0) return null;
    return (
      <div className="mt-2 space-y-2">
        {media.map((file) => (
          <div key={file.id}>
            {isImage(file) ? (
              <a
                href={getFileUrl(file.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={getFileUrl(file.url)}
                  alt={file.originalName}
                  className="max-w-full max-h-80 rounded-xl object-contain border border-[#38444d]"
                  loading="lazy"
                />
              </a>
            ) : isVideo(file) ? (
              <video
                controls
                preload="metadata"
                className="max-w-full max-h-80 rounded-xl border border-[#38444d] bg-black"
              >
                <source src={getFileUrl(file.url)} type={file.mimeType} />
              </video>
            ) : (
              <a
                href={getFileUrl(file.url)}
                target="_blank"
                rel="noopener noreferrer"
                download={file.originalName}
                className="flex items-center gap-3 p-3 rounded-xl bg-[#15202b]/70 border border-[#38444d] hover:bg-[#15202b] transition"
              >
                <span className="text-2xl">📄</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold break-all text-white">
                    {file.originalName}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {formatFileSize(file.fileSize)}
                  </span>
                </span>
                <span className="ml-auto">⬇️</span>
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderSharedPost = (message: Message, isMine: boolean) => {
    if (!message.sharedPostId) return null;
    const post = message.sharedPost;

    if (!post) {
      return (
        <div className="mt-1 mb-1 p-3 rounded-xl border border-[#38444d] bg-[#15202b]/60 text-xs text-gray-400">
          🔒 Esta publicación ya no está disponible.
        </div>
      );
    }

    const firstMedia =
      post.media && post.media.length > 0 ? post.media[0] : null;
    const previewImage =
      firstMedia &&
      (firstMedia.mediaType === "IMAGE" ||
        firstMedia.mimeType.startsWith("image/"))
        ? getFileUrl(firstMedia.url)
        : post.imageUrl
          ? getFileUrl(post.imageUrl)
          : null;

    const previewVideo =
      firstMedia &&
      (firstMedia.mediaType === "VIDEO" ||
        firstMedia.mimeType.startsWith("video/"))
        ? getFileUrl(firstMedia.url)
        : null;

    return (
      <div
        onClick={() => navigate("/")}
        title="Ver publicación en el inicio"
        className={`mt-1 mb-1.5 rounded-xl border overflow-hidden cursor-pointer transition ${
          isMine
            ? "bg-sky-700/60 border-sky-400/40 hover:bg-sky-700/80"
            : "bg-[#15202b] border-[#38444d] hover:bg-[#1c2938]"
        }`}
      >
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          {post.author.avatarUrl ? (
            <img
              src={getFileUrl(post.author.avatarUrl)}
              alt={post.author.name}
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {post.author.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xs font-bold truncate text-white">
            {post.author.name}
          </span>
        </div>

        {previewImage && (
          <img
            src={previewImage}
            alt="Publicación compartida"
            className="w-full max-h-56 object-cover"
          />
        )}

        {!previewImage && previewVideo && (
          <video
            src={previewVideo}
            className="w-full max-h-56 object-cover bg-black"
            muted
          />
        )}

        {post.content && (
          <p className="px-3 py-2 text-xs line-clamp-3 whitespace-pre-wrap text-gray-100">
            {post.content}
          </p>
        )}

        <div className="px-3 py-1.5 text-[11px] font-semibold border-t border-[#38444d]/60 text-sky-300">
          Ver publicación →
        </div>
      </div>
    );
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="bg-[#192734] border border-[#38444d] rounded-2xl shadow-xl overflow-hidden flex h-[calc(100vh-92px)] text-white">
      {/* LISTA DE USUARIOS */}
      <aside className="w-60 sm:w-68 shrink-0 border-r border-[#38444d] flex flex-col bg-[#192734]">
        <div className="p-3.5 border-b border-[#38444d]">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-white">💬 Mensajes</h1>
            <span
              title={connected ? "Conectado en tiempo real" : "Reconectando..."}
              className="text-xs"
            >
              {connected ? "🟢" : "🟠"}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Conversaciones privadas
          </p>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar persona..."
            className="mt-2.5 w-full bg-[#253341] border border-[#38444d] rounded-full px-3.5 py-1.5 text-sm text-white placeholder-gray-400 outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredUsers.map((chatUser) => (
            <button
              key={chatUser.id}
              type="button"
              onClick={() => setSelectedUser(chatUser)}
              className={`w-full flex items-center gap-3 p-3.5 text-left border-b border-[#38444d]/60 hover:bg-[#253341]/70 transition ${
                selectedUser?.id === chatUser.id
                  ? "bg-[#253341] border-l-4 border-l-sky-500"
                  : ""
              }`}
            >
              <div className="relative shrink-0">
                {chatUser.avatarUrl ? (
                  <img
                    src={getFileUrl(chatUser.avatarUrl)}
                    alt={chatUser.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold">
                    {chatUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {onlineUserIds.has(chatUser.id) && (
                  <span
                    title="En línea"
                    className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-[#192734]"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-white truncate">
                  {chatUser.name}
                </p>
                <p className="text-xs truncate">
                  {typingUserIds.has(chatUser.id) ? (
                    <span className="text-emerald-400 font-semibold">
                      escribiendo...
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      {chatUser.bio || "Usuario de la red social"}
                    </span>
                  )}
                </p>
              </div>

              {chatUser.unreadCount && chatUser.unreadCount > 0 ? (
                <span className="ml-auto px-2 py-0.5 rounded-full bg-sky-500 text-white text-xs font-bold shrink-0">
                  {chatUser.unreadCount}
                </span>
              ) : null}
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <p className="p-6 text-center text-gray-400 text-sm">
              No se encontraron usuarios.
            </p>
          )}
        </div>
      </aside>

      {/* CONVERSACIÓN */}
      <section className="flex-1 flex flex-col min-w-0 bg-[#15202b]">
        {selectedUser ? (
          <>
            {/* ENCABEZADO */}
            <div className="p-4 border-b border-[#38444d] bg-[#192734] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {selectedUser.avatarUrl ? (
                  <img
                    src={getFileUrl(selectedUser.avatarUrl)}
                    alt={selectedUser.name}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold shrink-0">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <h2 className="font-bold text-white truncate">
                    {selectedUser.name}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {typingUserIds.has(selectedUser.id) ? (
                      <span className="text-emerald-400 font-semibold">
                        escribiendo...
                      </span>
                    ) : onlineUserIds.has(selectedUser.id) ? (
                      <span className="text-emerald-400">🟢 En línea</span>
                    ) : (
                      formatLastSeen(lastSeenByUser[selectedUser.id])
                    )}
                  </p>
                </div>
              </div>

              {/* BOTONES DE LLAMADA */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    startCall(
                      {
                        id: selectedUser.id,
                        name: selectedUser.name,
                        avatarUrl: selectedUser.avatarUrl,
                      },
                      "audio",
                    )
                  }
                  title="Llamada de voz"
                  className="w-10 h-10 rounded-full bg-[#253341] hover:bg-[#304253] text-sky-400 flex items-center justify-center text-lg transition disabled:opacity-40"
                >
                  📞
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    startCall(
                      {
                        id: selectedUser.id,
                        name: selectedUser.name,
                        avatarUrl: selectedUser.avatarUrl,
                      },
                      "video",
                    )
                  }
                  title="Videollamada"
                  className="w-10 h-10 rounded-full bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center text-lg transition disabled:opacity-40"
                >
                  📹
                </button>
              </div>
            </div>

            {/* MENSAJES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && (
                <p className="text-center text-gray-400">
                  Cargando mensajes...
                </p>
              )}

              {!loading && messages.length === 0 && (
                <p className="text-center text-gray-500 mt-10">
                  Todavía no hay mensajes. ¡Saluda a {selectedUser.name}!
                </p>
              )}

              {messages.map((message) => {
                const isMine = message.senderId === user?.id;
                const isDeleting = deletingMessageIds.includes(message.id);
                const hasReactions =
                  !message.deletedForAll &&
                  message.reactions &&
                  message.reactions.length > 0;

                return (
                  <div
                    id={`msg-${message.id}`}
                    key={message.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuMessage(message);
                    }}
                    className={`flex flex-col rounded-2xl transition ${
                      isMine ? "items-end" : "items-start"
                    } ${hasReactions ? "mb-2" : ""}`}
                  >
                    <div
                      className={`group flex items-center gap-2 max-w-full ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {/* Botón de 3 puntos a la izquierda en mensajes propios */}
                      {isMine && !isDeleting && (
                        <button
                          type="button"
                          onClick={() => setMenuMessage(message)}
                          title="Opciones del mensaje"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center transition shrink-0"
                        >
                          ⋮
                        </button>
                      )}

                      {/* BURBUJA DEL MENSAJE (ESTILO STICKER SIN BURBUJA SI ES STICKER SOLO) */}
                      <div
                        className={
                          !message.deletedForAll &&
                          !message.isViewOnce &&
                          !message.replyTo &&
                          !message.sharedPostId &&
                          (!message.media || message.media.length === 0) &&
                          Boolean(parseStickerContent(message.content))
                            ? "max-w-[78%] py-1"
                            : `max-w-[78%] min-w-28 px-4 py-2.5 rounded-2xl shadow-sm ${
                                isMine
                                  ? "bg-sky-600 text-white rounded-br-none"
                                  : "bg-[#253341] text-gray-100 rounded-bl-none border border-[#38444d]"
                              }`
                        }
                      >
                        {message.deletedForAll ? (
                          <p className="italic text-xs opacity-75 flex items-center gap-1.5">
                            <span>🚫</span>
                            <span>
                              {isMine
                                ? "Eliminaste este mensaje"
                                : "Este mensaje fue eliminado"}
                            </span>
                          </p>
                        ) : message.isViewOnce ? (
                          /* BURBUJA DE "VER UNA VEZ" (①) */
                          <>
                            {renderReplyQuote(message, isMine)}
                            {message.viewedAt ? (
                              <div className="flex items-center gap-2 text-xs italic opacity-80 py-0.5">
                                <span className="w-5 h-5 rounded-full border border-dashed border-current flex items-center justify-center text-[10px] font-bold">
                                  1
                                </span>
                                <span>Abierto</span>
                              </div>
                            ) : isMine ? (
                              <div className="flex items-center gap-2 text-xs font-medium py-0.5">
                                <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[11px] font-bold">
                                  1
                                </span>
                                <span>Mensaje para ver una vez</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenViewOnce(message)}
                                className="flex items-center gap-2.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 py-0.5 transition"
                              >
                                <span className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-xs font-bold">
                                  1
                                </span>
                                <span>Toca para ver (1 vez)</span>
                              </button>
                            )}
                          </>
                        ) : (
                          /* BURBUJA NORMAL */
                          <>
                            {renderReplyQuote(message, isMine)}
                            {renderSharedPost(message, isMine)}

                            {message.content &&
                              (() => {
                                const sticker = parseStickerContent(
                                  message.content,
                                );
                                if (sticker) {
                                  return (
                                    <img
                                      src={sticker.src}
                                      alt={sticker.label}
                                      title={sticker.label}
                                      className="w-36 h-36 sm:w-40 sm:h-40 object-contain select-none drop-shadow-md"
                                    />
                                  );
                                }
                                return (
                                  <p className="whitespace-pre-wrap wrap-break-word text-sm">
                                    {message.content}
                                  </p>
                                );
                              })()}

                            {renderMedia(message.media || [])}
                          </>
                        )}

                        {/* PIE DE BURBUJA: HORA Y CHECKS DE LECTURA */}
                        <div className="flex items-center justify-end gap-1.5 mt-1.5">
                          <p
                            className={`text-[10px] ${
                              isMine ? "text-sky-100" : "text-gray-400"
                            }`}
                          >
                            {formatDate(message.createdAt)}
                          </p>

                          {isMine && !message.deletedForAll && (
                            <span
                              title={message.isRead ? "Leído" : "Enviado"}
                              className={`text-[11px] font-bold leading-none ${
                                message.isRead
                                  ? "text-cyan-200"
                                  : "text-sky-200/60"
                              }`}
                            >
                              {message.isRead ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botón de 3 puntos a la derecha en mensajes recibidos */}
                      {!isMine && !isDeleting && (
                        <button
                          type="button"
                          onClick={() => setMenuMessage(message)}
                          title="Opciones del mensaje"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center transition shrink-0"
                        >
                          ⋮
                        </button>
                      )}
                    </div>

                    {/* PÍLDORAS DE REACCIONES DEBAJO DE LA BURBUJA */}
                    {hasReactions && (
                      <div
                        className={`flex flex-wrap gap-1 -mt-1.5 px-2 z-10 ${
                          isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        {Object.entries(
                          message.reactions!.reduce<
                            Record<string, MessageReaction[]>
                          >((acc, r) => {
                            acc[r.emoji] = acc[r.emoji] || [];
                            acc[r.emoji].push(r);
                            return acc;
                          }, {}),
                        ).map(([emoji, list]) => {
                          const iReacted = list.some(
                            (r) => r.userId === user?.id,
                          );
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() =>
                                handleReactToMessage(message.id, emoji)
                              }
                              title={list.map((r) => r.user.name).join(", ")}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border shadow-sm transition ${
                                iReacted
                                  ? "bg-sky-600/40 border-sky-400 text-white"
                                  : "bg-[#192734] border-[#38444d] text-gray-200 hover:bg-[#253341]"
                              }`}
                            >
                              <span>{emoji}</span>
                              {list.length > 1 && (
                                <span className="text-[10px] font-bold">
                                  {list.length}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>

            {/* BARRA DE RESPUESTA ACTIVA (REPLY) */}
            {replyingTo && (
              <div className="px-4 py-2.5 bg-[#192734] border-t border-[#38444d] flex items-center justify-between gap-3">
                <div className="min-w-0 border-l-4 border-sky-500 pl-3">
                  <p className="text-xs font-bold text-sky-400">
                    Respondiendo a{" "}
                    {replyingTo.senderId === user?.id
                      ? "ti mismo"
                      : selectedUser.name}
                  </p>
                  <p className="text-xs text-gray-300 truncate">
                    {getMessageSummary(replyingTo)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="w-7 h-7 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {/* VISTA PREVIA DE ARCHIVOS */}
            {selectedFiles.length > 0 && (
              <div className="px-4 pt-3 border-t border-[#38444d] bg-[#192734]">
                <p className="text-xs font-semibold text-gray-400 mb-2">
                  Archivos adjuntos ({selectedFiles.length}/10)
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="relative shrink-0 w-24"
                    >
                      {file.type.startsWith("image/") ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-24 h-20 object-cover rounded-lg border border-[#38444d]"
                        />
                      ) : file.type.startsWith("audio/") ||
                        /\.(mp3|wav|ogg|m4a|aac|webm|flac)$/i.test(
                          file.name,
                        ) ? (
                        <div className="w-28 h-20 rounded-lg bg-[#253341] border border-[#38444d] flex flex-col items-center justify-center p-1.5 gap-1">
                          <span className="text-base leading-none">🎵</span>
                          <audio
                            src={URL.createObjectURL(file)}
                            controls
                            preload="metadata"
                            className="w-full h-6"
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-20 rounded-lg bg-[#253341] border border-[#38444d] flex flex-col items-center justify-center p-2">
                          <span className="text-2xl">
                            {file.type.startsWith("video/") ? "🎬" : "📄"}
                          </span>
                          <span className="text-[10px] text-center truncate w-full text-gray-300">
                            {file.name}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => removeSelectedFile(index)}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SELECTOR DE EMOJIS Y STICKERS */}
            {pickerOpen && (
              <div className="px-4 pt-3 pb-2 border-t border-[#38444d] bg-[#192734]">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickerTab("emoji")}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        pickerTab === "emoji"
                          ? "bg-sky-500 text-white"
                          : "bg-[#253341] text-gray-300 hover:bg-[#304253]"
                      }`}
                    >
                      😊 Emojis
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab("sticker")}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        pickerTab === "sticker"
                          ? "bg-sky-500 text-white"
                          : "bg-[#253341] text-gray-300 hover:bg-[#304253]"
                      }`}
                    >
                      🎨 Stickers
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="w-7 h-7 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                {pickerTab === "emoji" ? (
                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-40 overflow-y-auto pr-1">
                    {CHAT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleInsertEmoji(emoji)}
                        className="h-9 rounded-lg hover:bg-[#253341] text-xl flex items-center justify-center transition"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Buscador + Subir sticker */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={stickerSearch}
                        onChange={(e) => setStickerSearch(e.target.value)}
                        placeholder="Buscar sticker..."
                        className="flex-1 min-w-36 bg-[#253341] border border-[#38444d] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:border-sky-500"
                      />
                      <input
                        type="text"
                        value={newStickerName}
                        onChange={(e) => setNewStickerName(e.target.value)}
                        placeholder="Nombre nuevo sticker (opcional)"
                        maxLength={24}
                        className="w-44 bg-[#253341] border border-[#38444d] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:border-sky-500"
                      />
                      <input
                        ref={stickerUploadInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadCustomSticker}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => stickerUploadInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shrink-0"
                      >
                        + Guardar sticker
                      </button>
                    </div>

                    {/* Packs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {["Todos", "Mis stickers", "Reacciones", "Fiesta"].map(
                        (packName) => (
                          <button
                            key={packName}
                            type="button"
                            onClick={() => setStickerPack(packName)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                              stickerPack === packName
                                ? "bg-sky-500/25 border border-sky-400 text-sky-300"
                                : "bg-[#253341] border border-transparent text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {packName}
                          </button>
                        ),
                      )}
                    </div>

                    {/* Cuadrícula de stickers */}
                    {(() => {
                      const allStickers = [
                        ...customStickers,
                        ...BUILTIN_STICKERS,
                      ];
                      const q = stickerSearch.trim().toLowerCase();
                      const visibleStickers = allStickers.filter((st) => {
                        const matchPack =
                          stickerPack === "Todos" || st.pack === stickerPack;
                        const matchQuery =
                          !q ||
                          st.label.toLowerCase().includes(q) ||
                          st.pack.toLowerCase().includes(q);
                        return matchPack && matchQuery;
                      });

                      if (visibleStickers.length === 0) {
                        return (
                          <p className="py-6 text-center text-xs text-gray-400">
                            No hay stickers que coincidan. ¡Puedes subir uno con
                            "+ Guardar sticker"!
                          </p>
                        );
                      }

                      return (
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto pr-1">
                          {visibleStickers.map((sticker) => (
                            <div
                              key={sticker.id}
                              className="relative group p-1.5 rounded-xl bg-[#253341]/70 hover:bg-[#253341] border border-[#38444d] flex flex-col items-center gap-1 transition"
                            >
                              {sticker.custom && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCustomSticker(sticker.id);
                                  }}
                                  title="Eliminar este sticker guardado"
                                  className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
                                >
                                  ✕
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSendSticker(sticker)}
                                title={`Enviar ${sticker.label}`}
                                className="w-full flex flex-col items-center gap-1"
                              >
                                <img
                                  src={sticker.src}
                                  alt={sticker.label}
                                  className="w-12 h-12 object-contain"
                                />
                                <span className="text-[10px] text-gray-300 truncate w-full text-center">
                                  {sticker.label}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* SELECTOR DE EMOJIS Y STICKERS */}
            {pickerOpen && (
              <div className="px-4 pt-3 pb-2 border-t border-[#38444d] bg-[#192734]">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickerTab("emoji")}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        pickerTab === "emoji"
                          ? "bg-sky-500 text-white"
                          : "bg-[#253341] text-gray-300 hover:bg-[#304253]"
                      }`}
                    >
                      😊 Emojis
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab("sticker")}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        pickerTab === "sticker"
                          ? "bg-sky-500 text-white"
                          : "bg-[#253341] text-gray-300 hover:bg-[#304253]"
                      }`}
                    >
                      🎨 Stickers
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="w-7 h-7 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                {pickerTab === "emoji" ? (
                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-40 overflow-y-auto pr-1">
                    {CHAT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleInsertEmoji(emoji)}
                        className="h-9 rounded-lg hover:bg-[#253341] text-xl flex items-center justify-center transition"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={stickerSearch}
                        onChange={(e) => setStickerSearch(e.target.value)}
                        placeholder="Buscar sticker..."
                        className="flex-1 min-w-36 bg-[#253341] border border-[#38444d] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:border-sky-500"
                      />
                      <input
                        type="text"
                        value={newStickerName}
                        onChange={(e) => setNewStickerName(e.target.value)}
                        placeholder="Nombre nuevo sticker (opcional)"
                        maxLength={24}
                        className="w-44 bg-[#253341] border border-[#38444d] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:border-sky-500"
                      />
                      <input
                        ref={stickerUploadInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadCustomSticker}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => stickerUploadInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shrink-0"
                      >
                        + Guardar sticker
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {["Todos", "Mis stickers", "Reacciones", "Fiesta"].map(
                        (packName) => (
                          <button
                            key={packName}
                            type="button"
                            onClick={() => setStickerPack(packName)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                              stickerPack === packName
                                ? "bg-sky-500/25 border border-sky-400 text-sky-300"
                                : "bg-[#253341] border border-transparent text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {packName}
                          </button>
                        ),
                      )}
                    </div>

                    {(() => {
                      const allStickers: ChatSticker[] = [
                        ...customStickers,
                        ...BUILTIN_STICKERS,
                      ];
                      const q = stickerSearch.trim().toLowerCase();
                      const visibleStickers = allStickers.filter((st) => {
                        const matchPack =
                          stickerPack === "Todos" || st.pack === stickerPack;
                        const matchQuery =
                          !q ||
                          st.label.toLowerCase().includes(q) ||
                          st.pack.toLowerCase().includes(q);
                        return matchPack && matchQuery;
                      });

                      if (visibleStickers.length === 0) {
                        return (
                          <p className="py-6 text-center text-xs text-gray-400">
                            No hay stickers que coincidan. ¡Puedes subir uno con
                            "+ Guardar sticker"!
                          </p>
                        );
                      }

                      return (
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto pr-1">
                          {visibleStickers.map((sticker) => (
                            <div
                              key={sticker.id}
                              className="relative group p-1.5 rounded-xl bg-[#253341]/70 hover:bg-[#253341] border border-[#38444d] flex flex-col items-center gap-1 transition"
                            >
                              {sticker.custom && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCustomSticker(sticker.id);
                                  }}
                                  title="Eliminar este sticker guardado"
                                  className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
                                >
                                  ✕
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSendSticker(sticker)}
                                title={`Enviar ${sticker.label}`}
                                className="w-full flex flex-col items-center gap-1"
                              >
                                <img
                                  src={sticker.src}
                                  alt={sticker.label}
                                  className="w-12 h-12 object-contain"
                                />
                                <span className="text-[10px] text-gray-300 truncate w-full text-center">
                                  {sticker.label}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* SELECTOR DE EMOJIS Y STICKERS */}
            {pickerOpen && (
              <div className="px-4 pt-3 pb-2 border-t border-[#38444d] bg-[#192734]">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickerTab("emoji")}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        pickerTab === "emoji"
                          ? "bg-sky-500 text-white"
                          : "bg-[#253341] text-gray-300 hover:bg-[#304253]"
                      }`}
                    >
                      😊 Emojis
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab("sticker")}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        pickerTab === "sticker"
                          ? "bg-sky-500 text-white"
                          : "bg-[#253341] text-gray-300 hover:bg-[#304253]"
                      }`}
                    >
                      🎨 Stickers
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="w-7 h-7 rounded-full hover:bg-[#253341] text-gray-400 hover:text-white flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                {pickerTab === "emoji" ? (
                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-40 overflow-y-auto pr-1">
                    {CHAT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleInsertEmoji(emoji)}
                        className="h-9 rounded-lg hover:bg-[#253341] text-xl flex items-center justify-center transition"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={stickerSearch}
                        onChange={(e) => setStickerSearch(e.target.value)}
                        placeholder="Buscar sticker..."
                        className="flex-1 min-w-36 bg-[#253341] border border-[#38444d] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:border-sky-500"
                      />
                      <input
                        type="text"
                        value={newStickerName}
                        onChange={(e) => setNewStickerName(e.target.value)}
                        placeholder="Nombre nuevo sticker (opcional)"
                        maxLength={24}
                        className="w-44 bg-[#253341] border border-[#38444d] rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-400 outline-none focus:border-sky-500"
                      />
                      <input
                        ref={stickerUploadInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadCustomSticker}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => stickerUploadInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shrink-0"
                      >
                        + Guardar sticker
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {["Todos", "Mis stickers", "Reacciones", "Fiesta"].map(
                        (packName) => (
                          <button
                            key={packName}
                            type="button"
                            onClick={() => setStickerPack(packName)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                              stickerPack === packName
                                ? "bg-sky-500/25 border border-sky-400 text-sky-300"
                                : "bg-[#253341] border border-transparent text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {packName}
                          </button>
                        ),
                      )}
                    </div>

                    {(() => {
                      const allStickers: ChatSticker[] = [
                        ...customStickers,
                        ...BUILTIN_STICKERS,
                      ];
                      const q = stickerSearch.trim().toLowerCase();
                      const visibleStickers = allStickers.filter((st) => {
                        const matchPack =
                          stickerPack === "Todos" || st.pack === stickerPack;
                        const matchQuery =
                          !q ||
                          st.label.toLowerCase().includes(q) ||
                          st.pack.toLowerCase().includes(q);
                        return matchPack && matchQuery;
                      });

                      if (visibleStickers.length === 0) {
                        return (
                          <p className="py-6 text-center text-xs text-gray-400">
                            No hay stickers que coincidan. ¡Puedes subir uno con
                            "+ Guardar sticker"!
                          </p>
                        );
                      }

                      return (
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 max-h-44 overflow-y-auto pr-1">
                          {visibleStickers.map((sticker) => (
                            <div
                              key={sticker.id}
                              className="relative group p-1.5 rounded-xl bg-[#253341]/70 hover:bg-[#253341] border border-[#38444d] flex flex-col items-center gap-1 transition"
                            >
                              {sticker.custom && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCustomSticker(sticker.id);
                                  }}
                                  title="Eliminar este sticker guardado"
                                  className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
                                >
                                  ✕
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSendSticker(sticker)}
                                title={`Enviar ${sticker.label}`}
                                className="w-full flex flex-col items-center gap-1"
                              >
                                <img
                                  src={sticker.src}
                                  alt={sticker.label}
                                  className="w-12 h-12 object-contain"
                                />
                                <span className="text-[10px] text-gray-300 truncate w-full text-center">
                                  {sticker.label}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* FORMULARIO */}
            <form
              onSubmit={sendMessage}
              className="p-4 border-t border-[#38444d] bg-[#192734] flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setPickerOpen((prev) => !prev)}
                disabled={sending}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg transition disabled:opacity-50 ${
                  pickerOpen
                    ? "bg-sky-500 text-white"
                    : "bg-[#253341] text-amber-300 hover:bg-[#304253]"
                }`}
                title="Emojis y stickers"
              >
                😊
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen((prev) => !prev)}
                disabled={sending}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg transition disabled:opacity-50 ${
                  pickerOpen
                    ? "bg-sky-500 text-white"
                    : "bg-[#253341] text-amber-300 hover:bg-[#304253]"
                }`}
                title="Emojis y stickers"
              >
                😊
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen((prev) => !prev)}
                disabled={sending}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg transition disabled:opacity-50 ${
                  pickerOpen
                    ? "bg-sky-500 text-white"
                    : "bg-[#253341] text-amber-300 hover:bg-[#304253]"
                }`}
                title="Emojis y stickers"
              >
                😊
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  sending ||
                  isRecordingAudio ||
                  selectedFiles.length >= MAX_FILES
                }
                className="w-11 h-11 shrink-0 rounded-full bg-[#253341] text-gray-200 hover:bg-[#304253] disabled:opacity-50 transition"
                title="Adjuntar archivos"
              >
                📎
              </button>

              <button
                type="button"
                onClick={toggleAudioRecording}
                disabled={sending || selectedFiles.length >= MAX_FILES}
                className={`h-11 shrink-0 rounded-full px-3 flex items-center justify-center gap-1.5 font-semibold text-xs transition disabled:opacity-50 ${
                  isRecordingAudio
                    ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                    : "bg-[#253341] text-emerald-400 hover:bg-[#304253]"
                }`}
                title={isRecordingAudio ? "Detener grabación" : "Grabar audio"}
              >
                <span className="text-base">
                  {isRecordingAudio ? "⏹️" : "🎤"}
                </span>
                {isRecordingAudio && (
                  <span>
                    {Math.floor(recordingSeconds / 60)}:
                    {String(recordingSeconds % 60).padStart(2, "0")}
                  </span>
                )}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={content}
                onChange={(e) => handleContentInputChange(e.target.value)}
                placeholder={
                  isViewOnce
                    ? "Mensaje para ver una vez..."
                    : "Escribe un mensaje..."
                }
                maxLength={5000}
                disabled={sending}
                className="flex-1 min-w-0 bg-[#253341] border border-[#38444d] rounded-full px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-sky-500"
              />

              {/* BOTÓN "VER UNA VEZ" (①) */}
              <button
                type="button"
                onClick={() => setIsViewOnce((prev) => !prev)}
                disabled={sending}
                title={
                  isViewOnce
                    ? "Ver una vez activado (se destruye al abrirlo)"
                    : "Enviar para ver una vez"
                }
                className={`w-11 h-11 shrink-0 rounded-full border font-bold text-base flex items-center justify-center transition ${
                  isViewOnce
                    ? "bg-emerald-500 border-emerald-400 text-white shadow-md shadow-emerald-500/30"
                    : "bg-[#253341] border-[#38444d] text-gray-300 hover:bg-[#304253]"
                }`}
              >
                ①
              </button>

              <button
                type="submit"
                disabled={
                  sending || (!content.trim() && selectedFiles.length === 0)
                }
                className="bg-sky-500 text-white px-5 py-3 rounded-full font-bold hover:bg-sky-600 disabled:opacity-50 transition"
              >
                {sending ? "..." : "Enviar"}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <span className="text-6xl mb-4">💬</span>
            <h2 className="text-xl font-bold text-white">Tus mensajes</h2>
            <p className="text-center px-4 text-sm mt-1">
              Selecciona un amigo con solicitud aceptada a la izquierda para
              comenzar a conversar.
            </p>
          </div>
        )}
      </section>

      {/* ==========================================
          MENÚ FLOTANTE DE OPCIONES + REACCIONES (ESTILO WHATSAPP)
         ========================================== */}
      {menuMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setMenuMessage(null)}
        >
          <div
            className="w-full max-w-xs flex flex-col gap-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra rápida de reacciones estilo WhatsApp */}
            {!menuMessage.deletedForAll && (
              <div className="bg-[#192734] border border-[#38444d] rounded-full px-3 py-2 shadow-2xl flex items-center justify-between gap-1">
                {REACTION_EMOJIS.map((emoji) => {
                  const myReaction = menuMessage.reactions?.find(
                    (r) => r.userId === user?.id,
                  );
                  const isSelected = myReaction?.emoji === emoji;

                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        handleReactToMessage(menuMessage.id, emoji)
                      }
                      className={`w-9 h-9 rounded-full text-xl flex items-center justify-center transition transform hover:scale-125 ${
                        isSelected
                          ? "bg-sky-500/30 ring-1 ring-sky-400"
                          : "hover:bg-[#253341]"
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Vista previa del mensaje seleccionado */}
            <div
              className={`px-4 py-3 rounded-2xl shadow-xl text-sm ${
                menuMessage.senderId === user?.id
                  ? "bg-sky-600 text-white"
                  : "bg-[#253341] text-gray-100 border border-[#38444d]"
              }`}
            >
              <p className="line-clamp-3 wrap-break-word">
                {getMessageSummary(menuMessage)}
              </p>
              <p className="text-[10px] opacity-75 text-right mt-1">
                {formatDate(menuMessage.createdAt)}
              </p>
            </div>

            {/* Lista de acciones */}
            <div className="bg-[#192734] border border-[#38444d] rounded-2xl overflow-hidden shadow-2xl">
              {!menuMessage.deletedForAll && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(menuMessage);
                    setMenuMessage(null);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="w-full px-4 py-3.5 text-left text-sm font-medium text-white hover:bg-[#253341] flex items-center gap-3 transition"
                >
                  <span className="text-base">↩️</span>
                  <span>Responder</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDeleteModalMessage(menuMessage);
                  setMenuMessage(null);
                }}
                className={`w-full px-4 py-3.5 text-left text-sm font-medium text-red-400 hover:bg-[#253341] flex items-center gap-3 transition ${
                  !menuMessage.deletedForAll ? "border-t border-[#38444d]" : ""
                }`}
              >
                <span className="text-base">🗑️</span>
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ELIMINAR PARA MÍ / PARA TODOS
         ========================================== */}
      {deleteModalMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
          onClick={() => setDeleteModalMessage(null)}
        >
          <div
            className="w-full max-w-sm bg-[#192734] border border-[#38444d] rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white">
              ¿Eliminar mensaje?
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Elige cómo deseas eliminar este mensaje de la conversación.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              {(deleteModalMessage.senderId === user?.id ||
                user?.role === "ADMIN" ||
                user?.role === "ADMINISTRADOR") &&
                !deleteModalMessage.deletedForAll && (
                  <button
                    type="button"
                    onClick={() =>
                      executeDeleteMessage(deleteModalMessage, "everyone")
                    }
                    className="w-full py-2.5 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold text-sm text-right transition"
                  >
                    Eliminar para todos
                  </button>
                )}

              <button
                type="button"
                onClick={() => executeDeleteMessage(deleteModalMessage, "me")}
                className="w-full py-2.5 px-4 rounded-xl bg-[#253341] hover:bg-[#304253] text-sky-400 font-semibold text-sm text-right transition"
              >
                Eliminar para mí
              </button>

              <button
                type="button"
                onClick={() => setDeleteModalMessage(null)}
                className="w-full py-2.5 px-4 rounded-xl hover:bg-[#253341]/60 text-gray-300 font-medium text-sm text-right transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: CONTENIDO "VER UNA VEZ" (①)
         ========================================== */}
      {viewingOnceData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setViewingOnceData(null)}
        >
          <div
            className="w-full max-w-md bg-[#192734] border border-[#38444d] rounded-2xl p-5 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#38444d]">
              <div>
                <h3 className="text-sm font-bold text-emerald-400">
                  ① Mensaje para ver una vez
                </h3>
                <p className="text-xs text-gray-400">
                  De {viewingOnceData.senderName} · Se ocultará al cerrar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingOnceData(null)}
                className="w-8 h-8 rounded-full bg-[#253341] hover:bg-[#304253] text-gray-200 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 max-h-[65vh] overflow-y-auto">
              {viewingOnceData.content && (
                <p className="whitespace-pre-wrap wrap-break-word text-sm bg-[#15202b] p-3.5 rounded-xl border border-[#38444d]">
                  {viewingOnceData.content}
                </p>
              )}
              {renderMedia(viewingOnceData.media || [])}
            </div>

            <button
              type="button"
              onClick={() => setViewingOnceData(null)}
              className="mt-5 w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 font-bold text-sm transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
