import { Router, Response } from "express";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import fs from "fs";
import path from "path";

import { requireAuth, AuthRequest } from "../middlewares/auth.middleware";
import { upload } from "../config/upload";

const prisma = new PrismaClient();
const router = Router();

router.use(requireAuth);

// ==========================================
// UTILIDADES Y CONFIGURACIÓN DE INCLUDES
// ==========================================

const getMediaType = (mimeType: string): string => {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "DOCUMENT";
};

const deleteUploadedFiles = (files: Express.Multer.File[]) => {
  for (const file of files) {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error("No se pudo eliminar archivo temporal:", error);
    }
  }
};

const getUploadCandidatePaths = (filename: string): string[] => [
  path.join(process.cwd(), "uploads", filename),
  path.join(__dirname, "../../uploads", filename),
  path.join(__dirname, "../uploads", filename),
];

const deleteStoredUrls = (urls: string[]) => {
  for (const fileUrl of urls) {
    if (!fileUrl.startsWith("/uploads/")) continue;
    const filename = path.basename(fileUrl.split("?")[0].split("#")[0]);
    if (!filename || filename === "." || filename === "..") continue;

    for (const filePath of getUploadCandidatePaths(filename)) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileError) {
        console.error(`No se pudo eliminar el archivo ${filename}:`, fileError);
      }
    }
  }
};

// Sanitiza mensajes de "Ver una vez" para no exponer contenido/archivos en red ni en citas
const sanitizeMessageForClient = <T extends Record<string, any>>(msg: T): T => {
  const sanitized: Record<string, any> = { ...msg };

  if (sanitized.isViewOnce) {
    sanitized.content = "";
    sanitized.media = [];
    sanitized.sharedPost = null;
  }

  if (sanitized.replyTo?.isViewOnce) {
    sanitized.replyTo = {
      ...sanitized.replyTo,
      content: "",
      media: [],
    };
  }

  return sanitized as T;
};

// Incluye archivos, reacciones, mensaje citado (replyTo) y publicación compartida
const MESSAGE_INCLUDE = {
  media: {
    orderBy: {
      position: "asc" as const,
    },
  },
  reactions: {
    select: {
      id: true,
      emoji: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      senderId: true,
      deletedForAll: true,
      isViewOnce: true,
      sender: {
        select: {
          id: true,
          name: true,
        },
      },
      media: {
        orderBy: {
          position: "asc" as const,
        },
        take: 1,
      },
    },
  },
  sharedPost: {
    select: {
      id: true,
      content: true,
      imageUrl: true,
      privacy: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      media: {
        orderBy: {
          position: "asc" as const,
        },
        take: 1,
      },
    },
  },
};

// ==========================================
// 1. LISTAR USUARIOS (CON CONTEO DE NO LEÍDOS)
// ==========================================

router.get("/users", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isBanned: false,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        bio: true,
        _count: {
          select: {
            messagesSent: {
              where: {
                receiverId: currentUserId,
                isRead: false,
                deletedForReceiver: false,
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const formattedUsers = users.map(({ _count, ...user }) => ({
      ...user,
      unreadCount: _count.messagesSent,
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ==========================================
// 2. COMPARTIR PUBLICACIÓN A UNO O VARIOS AMIGOS
// POST /api/messages/share-post
// ==========================================

router.post("/share-post", async (req: AuthRequest, res: Response) => {
  try {
    const senderId = req.user!.id;
    const targetPostId = Number(req.body.postId);

    if (!Number.isInteger(targetPostId) || targetPostId <= 0) {
      res.status(400).json({ error: "ID de publicación inválido" });
      return;
    }

    const rawRecipientIds = Array.isArray(req.body.recipientIds)
      ? req.body.recipientIds
      : [];

    const recipientIds: number[] = Array.from(
      new Set(
        rawRecipientIds
          .map((id: unknown) => Number(id))
          .filter(
            (id: number) => Number.isInteger(id) && id > 0 && id !== senderId,
          ),
      ),
    );

    if (recipientIds.length === 0) {
      res.status(400).json({
        error: "Selecciona al menos un destinatario válido",
      });
      return;
    }

    if (recipientIds.length > 20) {
      res.status(400).json({
        error:
          "Solo puedes enviar una publicación a un máximo de 20 personas a la vez",
      });
      return;
    }

    const content =
      typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (content.length > 5000) {
      res.status(400).json({
        error: "El mensaje no puede superar los 5000 caracteres",
      });
      return;
    }

    const targetPost = await prisma.post.findUnique({
      where: { id: targetPostId },
      select: {
        id: true,
        authorId: true,
        privacy: true,
        sharedPostId: true,
      },
    });

    if (!targetPost) {
      res.status(404).json({ error: "Publicación no encontrada" });
      return;
    }

    const originalPostId = targetPost.sharedPostId ?? targetPost.id;

    const postToShare =
      originalPostId === targetPost.id
        ? targetPost
        : await prisma.post.findUnique({
            where: { id: originalPostId },
            select: {
              id: true,
              authorId: true,
              privacy: true,
            },
          });

    if (!postToShare) {
      res.status(404).json({
        error: "La publicación original ya no está disponible",
      });
      return;
    }

    if (
      postToShare.privacy === "PRIVATE" &&
      postToShare.authorId !== senderId
    ) {
      res.status(403).json({
        error: "No tienes permiso para compartir una publicación privada",
      });
      return;
    }

    const validRecipients = await prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        isBanned: false,
      },
      select: { id: true },
    });

    const validIds = validRecipients.map((u) => u.id);

    if (validIds.length === 0) {
      res.status(404).json({
        error: "Ninguno de los destinatarios está disponible",
      });
      return;
    }

    const createdMessages = await prisma.$transaction(
      validIds.map((receiverId) =>
        prisma.message.create({
          data: {
            content,
            senderId,
            receiverId,
            sharedPostId: postToShare.id,
          },
          include: MESSAGE_INCLUDE,
        }),
      ),
    );

    const io = req.app.get("io") as Server | undefined;

    if (io) {
      for (const msg of createdMessages) {
        io.to(`user:${msg.receiverId}`).emit("new_message", msg);
        io.to(`user:${senderId}`).emit("new_message", msg);
      }
    }

    res.status(201).json({
      message: "Publicación enviada correctamente",
      sentCount: createdMessages.length,
      messages: createdMessages,
    });
  } catch (error) {
    console.error("Error al compartir publicación por mensaje:", error);
    res.status(500).json({
      error: "No se pudo compartir la publicación",
    });
  }
});

// ==========================================
// 3. HISTORIAL DE CONVERSACIÓN
// GET /api/messages/:userId
// ==========================================

router.get("/:userId", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const otherUserId = Number(req.params.userId);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      res.status(400).json({ error: "ID de usuario inválido" });
      return;
    }

    if (otherUserId === currentUserId) {
      res.status(400).json({
        error: "No puedes conversar contigo mismo",
      });
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          {
            senderId: currentUserId,
            receiverId: otherUserId,
            deletedForSender: false,
          },
          {
            senderId: otherUserId,
            receiverId: currentUserId,
            deletedForReceiver: false,
          },
        ],
      },
      include: MESSAGE_INCLUDE,
      orderBy: {
        createdAt: "asc",
      },
      take: 200,
    });

    const unreadMessageIds = messages
      .filter(
        (message) =>
          message.senderId === otherUserId &&
          message.receiverId === currentUserId &&
          !message.isRead,
      )
      .map((message) => message.id);

    if (unreadMessageIds.length > 0) {
      const readAt = new Date();

      const updated = await prisma.message.updateMany({
        where: {
          id: { in: unreadMessageIds },
          senderId: otherUserId,
          receiverId: currentUserId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt,
        },
      });

      if (updated.count > 0) {
        const updatedIds = new Set(unreadMessageIds);

        for (const message of messages) {
          if (updatedIds.has(message.id)) {
            message.isRead = true;
            message.readAt = readAt;
          }
        }

        const io = req.app.get("io") as Server | undefined;

        if (io) {
          io.to(`user:${otherUserId}`).emit("messages_read", {
            readerId: currentUserId,
            messageIds: unreadMessageIds,
            readAt: readAt.toISOString(),
          });
        }
      }
    }

    const safeMessages = messages.map((msg) => sanitizeMessageForClient(msg));
    res.json(safeMessages);
  } catch (error) {
    console.error("Error al obtener mensajes:", error);
    res.status(500).json({
      error: "Error al obtener la conversación",
    });
  }
});

// ==========================================
// 3.1 MARCAR CONVERSACIÓN COMO LEÍDA EN TIEMPO REAL
// PATCH /api/messages/:userId/read
// ==========================================

router.patch("/:userId/read", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const otherUserId = Number(req.params.userId);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      res.status(400).json({ error: "ID de usuario inválido" });
      return;
    }

    const unreadMessages = await prisma.message.findMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false,
      },
      select: { id: true },
    });

    if (unreadMessages.length === 0) {
      res.json({ updatedCount: 0 });
      return;
    }

    const unreadMessageIds = unreadMessages.map((m) => m.id);
    const readAt = new Date();

    await prisma.message.updateMany({
      where: {
        id: { in: unreadMessageIds },
      },
      data: {
        isRead: true,
        readAt,
      },
    });

    const io = req.app.get("io") as Server | undefined;

    if (io) {
      io.to(`user:${otherUserId}`).emit("messages_read", {
        readerId: currentUserId,
        messageIds: unreadMessageIds,
        readAt: readAt.toISOString(),
      });
    }

    res.json({
      updatedCount: unreadMessageIds.length,
      messageIds: unreadMessageIds,
      readAt: readAt.toISOString(),
    });
  } catch (error) {
    console.error("Error al marcar mensajes como leídos:", error);
    res.status(500).json({
      error: "No se pudieron marcar los mensajes como leídos",
    });
  }
});

// ==========================================
// 3.2 ABRIR MENSAJE DE "VER UNA VEZ" (①)
// POST /api/messages/:id/open-once
// ==========================================

router.post("/:id/open-once", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const messageId = Number(req.params.id);

    if (!Number.isInteger(messageId) || messageId <= 0) {
      res.status(400).json({ error: "ID de mensaje inválido" });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });

    if (!message || !message.isViewOnce) {
      res.status(404).json({ error: "Mensaje temporal no encontrado" });
      return;
    }

    if (message.receiverId !== currentUserId) {
      res.status(403).json({
        error: "Solo el destinatario puede abrir este mensaje",
      });
      return;
    }

    if (message.viewedAt || message.deletedForAll) {
      res.status(410).json({
        error: "Este mensaje ya fue abierto y no está disponible",
      });
      return;
    }

    const viewedAt = new Date();
    const fileUrls = message.media.map((m) => m.url);

    // Guardamos los datos antes de limpiar la BD para devolverlos una única vez al visor
    const responsePayload = {
      id: message.id,
      content: message.content,
      media: message.media,
      createdAt: message.createdAt,
      viewedAt: viewedAt.toISOString(),
    };

    // Destruir registros en la base de datos inmediatamente (nadie más podrá abrirlo)
    await prisma.$transaction([
      prisma.messageMedia.deleteMany({
        where: { messageId },
      }),
      prisma.message.update({
        where: { id: messageId },
        data: {
          viewedAt,
          isRead: true,
          readAt: message.readAt ?? viewedAt,
          content: "",
          sharedPostId: null,
        },
      }),
    ]);

    // Eliminar el archivo físico 15 segundos después para dar tiempo al navegador a renderizarlo
    setTimeout(() => {
      deleteStoredUrls(fileUrls);
    }, 15_000);

    // Notificar en tiempo real a ambos usuarios que el mensaje ① pasó a "Abierto"
    const io = req.app.get("io") as Server | undefined;

    if (io) {
      const eventPayload = {
        messageId,
        viewedAt: viewedAt.toISOString(),
        senderId: message.senderId,
        receiverId: message.receiverId,
      };

      io.to(`user:${message.senderId}`).emit(
        "message_viewed_once",
        eventPayload,
      );
      io.to(`user:${currentUserId}`).emit("message_viewed_once", eventPayload);
    }

    res.json(responsePayload);
  } catch (error) {
    console.error("Error al abrir mensaje de ver una vez:", error);
    res.status(500).json({
      error: "No se pudo abrir el mensaje temporal",
    });
  }
});

// ==========================================
// 4. ENVIAR MENSAJES, ARCHIVOS, PUBLICACIONES O RESPUESTAS
// POST /api/messages/:userId
// ==========================================

router.post(
  "/:userId",
  (req: AuthRequest, res: Response, next) => {
    upload.array("files", 10)(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          res.status(400).json({
            error:
              error.code === "LIMIT_FILE_SIZE"
                ? "Cada archivo puede pesar como máximo 50 MB"
                : "No se pudieron cargar los archivos",
          });
          return;
        }

        res.status(400).json({
          error: error.message || "Tipo de archivo no permitido",
        });
        return;
      }

      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    const files = (req.files || []) as Express.Multer.File[];

    try {
      const currentUserId = req.user!.id;
      const receiverId = Number(req.params.userId);

      const content =
        typeof req.body.content === "string" ? req.body.content.trim() : "";

      const isViewOnce =
        req.body.isViewOnce === "true" || req.body.isViewOnce === true;

      const rawSharedPostId = req.body.sharedPostId;
      const sharedPostId =
        rawSharedPostId !== undefined &&
        rawSharedPostId !== null &&
        rawSharedPostId !== ""
          ? Number(rawSharedPostId)
          : null;

      const rawReplyToId = req.body.replyToId;
      const replyToId =
        rawReplyToId !== undefined &&
        rawReplyToId !== null &&
        rawReplyToId !== ""
          ? Number(rawReplyToId)
          : null;

      if (!Number.isInteger(receiverId) || receiverId <= 0) {
        deleteUploadedFiles(files);
        res.status(400).json({
          error: "ID de destinatario inválido",
        });
        return;
      }

      if (receiverId === currentUserId) {
        deleteUploadedFiles(files);
        res.status(400).json({
          error: "No puedes enviarte mensajes a ti mismo",
        });
        return;
      }

      if (
        sharedPostId !== null &&
        (!Number.isInteger(sharedPostId) || sharedPostId <= 0)
      ) {
        deleteUploadedFiles(files);
        res.status(400).json({
          error: "ID de publicación compartida inválido",
        });
        return;
      }

      if (
        replyToId !== null &&
        (!Number.isInteger(replyToId) || replyToId <= 0)
      ) {
        deleteUploadedFiles(files);
        res.status(400).json({
          error: "ID de mensaje al que respondes inválido",
        });
        return;
      }

      if (content.length > 5000) {
        deleteUploadedFiles(files);
        res.status(400).json({
          error: "El mensaje no puede superar los 5000 caracteres",
        });
        return;
      }

      if (!content && files.length === 0 && sharedPostId === null) {
        res.status(400).json({
          error:
            "Escribe un mensaje, adjunta un archivo o selecciona una publicación",
        });
        return;
      }

      const receiver = await prisma.user.findUnique({
        where: {
          id: receiverId,
        },
        select: {
          id: true,
          isBanned: true,
        },
      });

      if (!receiver || receiver.isBanned) {
        deleteUploadedFiles(files);
        res.status(404).json({
          error: "Usuario no disponible",
        });
        return;
      }

      if (replyToId !== null) {
        const parentMessage = await prisma.message.findFirst({
          where: {
            id: replyToId,
            OR: [
              { senderId: currentUserId, receiverId },
              { senderId: receiverId, receiverId: currentUserId },
            ],
          },
          select: { id: true },
        });

        if (!parentMessage) {
          deleteUploadedFiles(files);
          res.status(404).json({
            error:
              "El mensaje al que intentas responder no existe en este chat",
          });
          return;
        }
      }

      let resolvedSharedPostId: number | null = null;

      if (sharedPostId !== null) {
        const targetPost = await prisma.post.findUnique({
          where: { id: sharedPostId },
          select: {
            id: true,
            authorId: true,
            privacy: true,
            sharedPostId: true,
          },
        });

        if (!targetPost) {
          deleteUploadedFiles(files);
          res.status(404).json({
            error: "La publicación que intentas compartir no existe",
          });
          return;
        }

        const originalId = targetPost.sharedPostId ?? targetPost.id;

        const originalPost =
          originalId === targetPost.id
            ? targetPost
            : await prisma.post.findUnique({
                where: { id: originalId },
                select: {
                  id: true,
                  authorId: true,
                  privacy: true,
                },
              });

        if (!originalPost) {
          deleteUploadedFiles(files);
          res.status(404).json({
            error: "La publicación original ya no está disponible",
          });
          return;
        }

        if (
          originalPost.privacy === "PRIVATE" &&
          originalPost.authorId !== currentUserId
        ) {
          deleteUploadedFiles(files);
          res.status(403).json({
            error: "No tienes permiso para compartir una publicación privada",
          });
          return;
        }

        resolvedSharedPostId = originalPost.id;
      }

      const message = await prisma.message.create({
        data: {
          content,
          senderId: currentUserId,
          receiverId,
          sharedPostId: resolvedSharedPostId,
          replyToId,
          isViewOnce,
          media: {
            create: files.map((file, index) => ({
              url: `/uploads/${file.filename}`,
              originalName: file.originalname,
              mimeType: file.mimetype,
              fileSize: file.size,
              mediaType: getMediaType(file.mimetype),
              position: index,
            })),
          },
        },
        include: MESSAGE_INCLUDE,
      });

      const safeMessage = sanitizeMessageForClient(message);
      const io = req.app.get("io") as Server | undefined;

      if (io) {
        io.to(`user:${receiverId}`).emit("new_message", safeMessage);
        io.to(`user:${currentUserId}`).emit("new_message", safeMessage);
      }

      res.status(201).json(safeMessage);
    } catch (error) {
      console.error("Error al enviar mensaje:", error);

      deleteUploadedFiles(files);

      res.status(500).json({
        error: "Error al enviar el mensaje",
      });
    }
  },
);

// ==========================================
// 5. ELIMINAR MENSAJE (PARA MÍ O PARA TODOS)
// DELETE /api/messages/:id?scope=me|everyone
// ==========================================

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const messageId = Number(req.params.id);
  const scope = req.query.scope === "everyone" ? "everyone" : "me";

  if (!Number.isInteger(messageId) || messageId <= 0) {
    res.status(400).json({
      error: "ID de mensaje inválido",
    });
    return;
  }

  try {
    const [message, currentUser] = await Promise.all([
      prisma.message.findUnique({
        where: { id: messageId },
        include: {
          media: {
            select: {
              url: true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      }),
    ]);

    if (!message) {
      res.status(404).json({
        error: "Mensaje no encontrado",
      });
      return;
    }

    const isSender = message.senderId === currentUserId;
    const isReceiver = message.receiverId === currentUserId;
    const isAdmin =
      currentUser?.role === "ADMIN" || currentUser?.role === "ADMINISTRADOR";

    if (!isSender && !isReceiver && !isAdmin) {
      res.status(403).json({
        error: "No tienes permiso sobre este mensaje",
      });
      return;
    }

    const io = req.app.get("io") as Server | undefined;

    if (scope === "everyone") {
      if (!isSender && !isAdmin) {
        res.status(403).json({
          error: "Solo el remitente puede eliminar el mensaje para todos",
        });
        return;
      }

      const fileUrls = message.media.map((item) => item.url);

      await prisma.$transaction([
        prisma.messageMedia.deleteMany({
          where: { messageId },
        }),
        prisma.message.update({
          where: { id: messageId },
          data: {
            content: "",
            deletedForAll: true,
            sharedPostId: null,
          },
        }),
      ]);

      deleteStoredUrls(fileUrls);

      if (io) {
        const eventData = {
          messageId,
          scope: "everyone",
          senderId: message.senderId,
          receiverId: message.receiverId,
        };

        io.to(`user:${message.senderId}`).emit("message_deleted", eventData);
        io.to(`user:${message.receiverId}`).emit("message_deleted", eventData);
      }

      res.json({
        message: "Mensaje eliminado para todos",
        messageId,
        scope: "everyone",
      });
      return;
    }

    await prisma.message.update({
      where: { id: messageId },
      data: isSender
        ? { deletedForSender: true }
        : { deletedForReceiver: true },
    });

    res.json({
      message: "Mensaje eliminado para ti",
      messageId,
      scope: "me",
    });
  } catch (error) {
    console.error("Error al eliminar mensaje:", error);
    res.status(500).json({
      error: "No se pudo eliminar el mensaje",
    });
  }
});

// ==========================================
// 6. REACCIONAR A UN MENSAJE (TOGGLE / CAMBIAR)
// POST /api/messages/:id/react
// ==========================================

const ALLOWED_REACTION_EMOJIS = new Set([
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "🔥",
]);

router.post("/:id/react", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const messageId = Number(req.params.id);
    const emoji =
      typeof req.body.emoji === "string" ? req.body.emoji.trim() : "";

    if (!Number.isInteger(messageId) || messageId <= 0) {
      res.status(400).json({ error: "ID de mensaje inválido" });
      return;
    }

    if (!ALLOWED_REACTION_EMOJIS.has(emoji)) {
      res.status(400).json({ error: "Emoji de reacción no permitido" });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        deletedForAll: true,
      },
    });

    if (!message || message.deletedForAll) {
      res.status(404).json({ error: "Mensaje no disponible para reaccionar" });
      return;
    }

    if (
      message.senderId !== currentUserId &&
      message.receiverId !== currentUserId
    ) {
      res.status(403).json({ error: "No tienes acceso a este mensaje" });
      return;
    }

    const existingReaction = await prisma.messageReaction.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId: currentUserId,
        },
      },
    });

    let action: "added" | "updated" | "removed";

    if (existingReaction && existingReaction.emoji === emoji) {
      await prisma.messageReaction.delete({
        where: { id: existingReaction.id },
      });
      action = "removed";
    } else if (existingReaction) {
      await prisma.messageReaction.update({
        where: { id: existingReaction.id },
        data: { emoji },
      });
      action = "updated";
    } else {
      await prisma.messageReaction.create({
        data: {
          messageId,
          userId: currentUserId,
          emoji,
        },
      });
      action = "added";
    }

    const updatedReactions = await prisma.messageReaction.findMany({
      where: { messageId },
      select: {
        id: true,
        emoji: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const io = req.app.get("io") as Server | undefined;

    if (io) {
      const eventPayload = {
        messageId,
        reactions: updatedReactions,
      };
      io.to(`user:${message.senderId}`).emit("message_reacted", eventPayload);
      io.to(`user:${message.receiverId}`).emit("message_reacted", eventPayload);
    }

    res.json({
      action,
      messageId,
      reactions: updatedReactions,
    });
  } catch (error) {
    console.error("Error al reaccionar al mensaje:", error);
    res.status(500).json({ error: "No se pudo registrar la reacción" });
  }
});

export default router;
