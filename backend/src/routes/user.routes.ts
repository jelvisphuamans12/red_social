import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, AuthRequest } from "../middlewares/auth.middleware";
import { upload } from "../config/upload";

const router = Router();
const prisma = new PrismaClient();

// GET /api/users/me - Obtener mis datos (incluye avatarUrl y coverUrl)
router.get(
  "/me",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        role: true,
      },
    });
    res.json(user);
  },
);

// PUT /api/users/me - Actualizar nombre y biografía
router.put(
  "/me",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, bio } = req.body;
    try {
      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: { name, bio },
      });
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ error: "Error al actualizar perfil" });
    }
  },
);

// POST /api/users/avatar - Subir foto de perfil
router.post(
  "/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No se subió ninguna imagen" });
        return;
      }

      // Guardamos la ruta pública de la imagen
      const avatarUrl = `/uploads/${req.file.filename}`;

      await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl },
      });

      res.json({ message: "Avatar actualizado", avatarUrl });
    } catch (error) {
      res.status(500).json({ error: "Error al subir avatar" });
    }
  },
);

// POST /api/users/cover - Subir foto de portada
router.post(
  "/cover",
  requireAuth,
  upload.single("cover"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No se subió ninguna imagen" });
        return;
      }

      // Guardamos la ruta pública de la portada
      const coverUrl = `/uploads/${req.file.filename}`;

      await prisma.user.update({
        where: { id: req.user!.id },
        data: { coverUrl },
      });

      res.json({ message: "Portada actualizada", coverUrl });
    } catch (error) {
      res.status(500).json({ error: "Error al subir foto de portada" });
    }
  },
);

export default router;
