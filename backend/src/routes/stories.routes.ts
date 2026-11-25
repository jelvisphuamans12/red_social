import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import fs from "fs";

import { requireAuth, AuthRequest } from "../middlewares/auth.middleware";
import { upload } from "../config/upload";

const prisma = new PrismaClient();
const router = Router();

router.use(requireAuth);

const ALLOWED_STORY_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const getMediaType = (mimeType: string): string => {
  return mimeType.startsWith("image/") ? "IMAGE" : "VIDEO";
};

const deleteUploadedFile = (file?: Express.Multer.File) => {
  if (!file) return;

  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (error) {
    console.error("Error al eliminar archivo:", error);
  }
};

// ==========================================
// 1. PUBLICAR UNA HISTORIA
// ==========================================

router.post(
  "/",
  (req: AuthRequest, res: Response, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          res.status(400).json({
            error:
              error.code === "LIMIT_FILE_SIZE"
                ? "La historia no puede superar los 50 MB"
                : "No se pudo cargar el archivo",
          });
          return;
        }

        res.status(400).json({
          error: error.message || "Error al cargar el archivo",
        });
        return;
      }

      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    const file = req.file;

    try {
      const userId = req.user!.id;

      if (!file) {
        res.status(400).json({
          error: "Debes seleccionar una imagen o video",
        });
        return;
      }

      if (!ALLOWED_STORY_TYPES.has(file.mimetype)) {
        deleteUploadedFile(file);

        res.status(400).json({
          error: "Solo se permiten imágenes y videos",
        });
        return;
      }

      const caption =
        typeof req.body.caption === "string" ? req.body.caption.trim() : "";

      if (caption.length > 500) {
        deleteUploadedFile(file);

        res.status(400).json({
          error: "El texto no puede superar los 500 caracteres",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isBanned: true,
        },
      });

      if (!user || user.isBanned) {
        deleteUploadedFile(file);

        res.status(403).json({
          error: "No tienes permiso para publicar historias",
        });
        return;
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const musicUrl =
        typeof req.body.musicUrl === "string" && req.body.musicUrl.trim()
          ? req.body.musicUrl.trim()
          : null;
      const musicTitle =
        typeof req.body.musicTitle === "string" && req.body.musicTitle.trim()
          ? req.body.musicTitle.trim()
          : null;
      const musicArtist =
        typeof req.body.musicArtist === "string" && req.body.musicArtist.trim()
          ? req.body.musicArtist.trim()
          : null;
      const musicCover =
        typeof req.body.musicCover === "string" && req.body.musicCover.trim()
          ? req.body.musicCover.trim()
          : null;
      const musicStartTime =
        req.body.musicStartTime !== undefined && req.body.musicStartTime !== ""
          ? Number(req.body.musicStartTime) || 0
          : null;

      const rawPrivacy =
        typeof req.body.privacy === "string"
          ? req.body.privacy.trim().toUpperCase()
          : "FRIENDS";
      const privacy =
        rawPrivacy === "GLOBAL" || rawPrivacy === "PUBLIC"
          ? "GLOBAL"
          : "FRIENDS";

      const story = await prisma.story.create({
        data: {
          caption: caption || null,
          url: `${process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`}/uploads/${file.filename}`,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          mediaType: getMediaType(file.mimetype),
          privacy,
          musicUrl,
          musicTitle,
          musicArtist,
          musicCover,
          musicStartTime,
          authorId: userId,
          expiresAt,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              views: true,
            },
          },
        },
      });

      const io = req.app.get("io");

      if (io) {
        io.emit("new_story", story);
      }

      res.status(201).json(story);
    } catch (error) {
      console.error("Error al publicar historia:", error);

      deleteUploadedFile(file);

      res.status(500).json({
        error: "No se pudo publicar la historia",
      });
    }
  },
);

// ==========================================
// 2. LISTAR HISTORIAS ACTIVAS (Solo amigos y propias)
// ==========================================

router.get(
  "/",
  requireAuth, // Asegúrate de tener esto
  async (req: AuthRequest, res: Response) => {
    try {
      const currentUserId = req.user!.id;
      const now = new Date();

      // 1. Buscar las amistades aceptadas del usuario actual
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
        },
      });

      // 2. Extraer los IDs de los amigos
      const friendIds = friendships.map((f) =>
        f.requesterId === currentUserId ? f.addresseeId : f.requesterId,
      );

      // 3. Crear el arreglo con mi ID y los IDs de mis amigos
      const allowedAuthorIds = [currentUserId, ...friendIds];

      // 4. Buscar historias (Aplicando el candado en authorId)
      const stories = await prisma.story.findMany({
        where: {
          expiresAt: {
            gt: now,
          },
          author: {
            isBanned: false,
          },
          authorId: {
            in: allowedAuthorIds, // <--- EL CANDADO DE PRIVACIDAD
          },
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          views: {
            where: {
              userId: currentUserId,
            },
            select: {
              id: true,
            },
          },
          _count: {
            select: {
              views: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const result = stories.map((story) => ({
        ...story,
        hasViewed: story.views.length > 0,
        views: undefined,
      }));

      res.json(result);
    } catch (error) {
      console.error("Error al listar historias:", error);

      res.status(500).json({
        error: "No se pudieron obtener las historias",
      });
    }
  },
);
// ==========================================
// 3. REGISTRAR VISUALIZACIÓN
// ==========================================

router.post("/:id/view", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const storyId = Number(req.params.id);

    if (!Number.isInteger(storyId) || storyId <= 0) {
      res.status(400).json({
        error: "ID de historia inválido",
      });
      return;
    }

    const story = await prisma.story.findFirst({
      where: {
        id: storyId,
        expiresAt: {
          gt: new Date(),
        },
        author: {
          isBanned: false,
        },
      },
      select: {
        id: true,
      },
    });

    if (!story) {
      res.status(404).json({
        error: "La historia no existe o ha expirado",
      });
      return;
    }

    const view = await prisma.storyView.upsert({
      where: {
        storyId_userId: {
          storyId,
          userId,
        },
      },
      update: {},
      create: {
        storyId,
        userId,
      },
    });

    res.json({
      message: "Visualización registrada",
      view,
    });
  } catch (error) {
    console.error("Error al registrar visualización:", error);

    res.status(500).json({
      error: "No se pudo registrar la visualización",
    });
  }
});

// ==========================================
// 4. VER QUIÉN HA VISTO UNA HISTORIA
// ==========================================

router.get("/:id/views", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const storyId = Number(req.params.id);

    if (!Number.isInteger(storyId) || storyId <= 0) {
      res.status(400).json({
        error: "ID de historia inválido",
      });
      return;
    }

    const story = await prisma.story.findUnique({
      where: {
        id: storyId,
      },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!story) {
      res.status(404).json({
        error: "Historia no encontrada",
      });
      return;
    }

    if (story.authorId !== userId) {
      res.status(403).json({
        error: "Solo el autor puede consultar las visualizaciones",
      });
      return;
    }

    const views = await prisma.storyView.findMany({
      where: {
        storyId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        viewedAt: "desc",
      },
    });

    res.json(views);
  } catch (error) {
    console.error("Error al consultar visualizaciones:", error);

    res.status(500).json({
      error: "No se pudieron obtener las visualizaciones",
    });
  }
});

// ==========================================
// 5. ELIMINAR UNA HISTORIA
// ==========================================

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const storyId = Number(req.params.id);

    if (!Number.isInteger(storyId) || storyId <= 0) {
      res.status(400).json({
        error: "ID de historia inválido",
      });
      return;
    }

    const story = await prisma.story.findUnique({
      where: {
        id: storyId,
      },
    });

    if (!story) {
      res.status(404).json({
        error: "Historia no encontrada",
      });
      return;
    }

    if (story.authorId !== userId) {
      res.status(403).json({
        error: "No puedes eliminar historias de otros usuarios",
      });
      return;
    }

    await prisma.story.delete({
      where: {
        id: storyId,
      },
    });

    const filePath = require("path").resolve(
      process.cwd(),
      "uploads",
      story.url.replace("/uploads/", ""),
    );

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error("No se pudo eliminar el archivo:", error);
    }

    res.json({
      message: "Historia eliminada correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar historia:", error);

    res.status(500).json({
      error: "No se pudo eliminar la historia",
    });
  }
});

export default router;
