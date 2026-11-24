import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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

// POST /api/users/change-password - Cambiar contraseña estando autenticado
router.post(
  "/change-password",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const currentPassword =
        typeof req.body?.currentPassword === "string"
          ? req.body.currentPassword
          : "";
      const newPassword =
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

      if (!currentPassword || newPassword.length < 8) {
        res.status(400).json({
          error:
            "Debes enviar tu contraseña actual y una nueva de al menos 8 caracteres",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });

      if (!user) {
        res.status(404).json({ error: "Usuario no encontrado" });
        return;
      }

      // Reemplaza `passwordHash` con `Ctrl + H` si tu columna en User se llama distinto (ej. `password`)
      const validPassword = await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

      if (!validPassword) {
        res.status(401).json({ error: "La contraseña actual es incorrecta" });
        return;
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
      res.status(500).json({ error: "Error al cambiar la contraseña" });
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
