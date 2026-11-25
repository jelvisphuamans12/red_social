import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import userRoutes from "./routes/user.routes";
import postRoutes from "./routes/post.routes";
import messageRoutes from "./routes/messages.routes";
import notificationRoutes from "./routes/notifications.routes";
import storyRoutes from "./routes/stories.routes";
import friendshipRoutes, { areFriends } from "./routes/friendship.routes";
// Si creaste password.routes.ts aparte, descomenta la siguiente línea y la de app.use("/api/auth", passwordRoutes):
// import passwordRoutes from "./routes/password.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const httpServer = http.createServer(app);
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  ...(process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []),
];

const isOriginAllowed = (origin?: string) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origen no permitido por CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware general
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origen no permitido por CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Compartir Socket.IO con las rutas Express
app.set("io", io);

// Verificar que el backend funciona
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "Backend funcionando correctamente",
  });
});

// Rutas
app.use("/api/auth", authRoutes);
// app.use("/api/auth", passwordRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", friendshipRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);

// Autenticación de conexiones Socket.IO
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("No autorizado: falta el token"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      role: string;
    };

    if (!decoded.id) {
      return next(new Error("Token inválido"));
    }

    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error("Token inválido o expirado"));
  }
});

// Seguimiento de presencia en memoria (online y última vez)
const onlineUsers = new Set<number>();
const lastSeenMap = new Map<number, string>();

// Conexión de usuarios
io.on("connection", (socket) => {
  const userId: number = socket.data.user.id;

  // Cada usuario entra a su propia sala privada
  socket.join(`user:${userId}`);
  onlineUsers.add(userId);

  console.log(`Usuario ${userId} conectado al chat`);

  // Enviar al usuario recién conectado la lista actual de conectados y últimas conexiones
  socket.emit("presence:sync", {
    onlineUserIds: Array.from(onlineUsers),
    lastSeen: Object.fromEntries(lastSeenMap),
  });

  // Avisar a los demás usuarios que este usuario ahora está en línea
  socket.broadcast.emit("presence:update", {
    userId,
    isOnline: true,
    lastSeen: null,
  });

  // ==========================================
  // INDICADOR DE "ESCRIBIENDO..." EN TIEMPO REAL
  // ==========================================
  socket.on("chat:typing", async (data: { toUserId: number }) => {
    if (!data?.toUserId) return;
    const allowed = await areFriends(userId, Number(data.toUserId));
    if (!allowed) return;
    io.to(`user:${data.toUserId}`).emit("chat:typing", {
      fromUserId: userId,
    });
  });

  socket.on("chat:stop_typing", async (data: { toUserId: number }) => {
    if (!data?.toUserId) return;
    const allowed = await areFriends(userId, Number(data.toUserId));
    if (!allowed) return;
    io.to(`user:${data.toUserId}`).emit("chat:stop_typing", {
      fromUserId: userId,
    });
  });

  // ==========================================
  // SEÑALIZACIÓN WEBRTC (LLAMADAS Y VIDEOLLAMADAS)
  // ==========================================

  // 1. Iniciar llamada (voz o video)
  socket.on(
    "call:initiate",
    async (data: {
      toUserId: number;
      offer: unknown;
      callType: "audio" | "video";
      callerName: string;
      callerAvatar: string | null;
    }) => {
      const allowed = await areFriends(userId, Number(data.toUserId));
      if (!allowed) {
        socket.emit("call:unavailable", {
          toUserId: data.toUserId,
          reason: "Solo puedes llamar a amigos que hayan aceptado tu solicitud",
        });
        return;
      }

      const targetRoom = `user:${data.toUserId}`;
      const roomSockets = io.sockets.adapter.rooms.get(targetRoom);

      // Si el destinatario no está conectado, avisar inmediatamente
      if (!roomSockets || roomSockets.size === 0) {
        socket.emit("call:unavailable", {
          toUserId: data.toUserId,
          reason: "El usuario no está conectado en este momento",
        });
        return;
      }

      io.to(targetRoom).emit("call:incoming", {
        fromUserId: userId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        offer: data.offer,
        callType: data.callType,
      });
    },
  );

  // 2. Aceptar llamada y devolver respuesta SDP
  socket.on("call:accept", (data: { toUserId: number; answer: unknown }) => {
    io.to(`user:${data.toUserId}`).emit("call:accepted", {
      fromUserId: userId,
      answer: data.answer,
    });
  });

  // 3. Intercambiar candidatos ICE
  socket.on(
    "call:ice-candidate",
    (data: { toUserId: number; candidate: unknown }) => {
      io.to(`user:${data.toUserId}`).emit("call:ice-candidate", {
        fromUserId: userId,
        candidate: data.candidate,
      });
    },
  );

  // 4. Rechazar llamada
  socket.on("call:reject", (data: { toUserId: number; reason?: string }) => {
    io.to(`user:${data.toUserId}`).emit("call:rejected", {
      fromUserId: userId,
      reason: data.reason || "Llamada rechazada",
    });
  });

  // 5. Colgar / Finalizar llamada
  socket.on("call:hangup", (data: { toUserId: number }) => {
    io.to(`user:${data.toUserId}`).emit("call:ended", {
      fromUserId: userId,
    });
  });

  socket.on("disconnect", () => {
    console.log(`Usuario ${userId} desconectado del chat`);

    // Verificar si el usuario no tiene otra pestaña abierta antes de marcarlo desconectado
    const remainingSockets = io.sockets.adapter.rooms.get(`user:${userId}`);
    if (!remainingSockets || remainingSockets.size === 0) {
      const now = new Date().toISOString();
      onlineUsers.delete(userId);
      lastSeenMap.set(userId, now);

      io.emit("presence:update", {
        userId,
        isOnline: false,
        lastSeen: now,
      });
    }
  });
});

// Iniciar servidor HTTP y Socket.IO
httpServer.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
  console.log("Chat en tiempo real y llamadas WebRTC habilitados");
});
