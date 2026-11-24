import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";

const router = Router();
const prisma = new PrismaClient();

// Validaciones con Zod
const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  inviteCode: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function sendPasswordResetLink(params: { to: string; resetUrl: string }) {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[DEV] Enlace de recuperación para ${params.to}: ${params.resetUrl}`,
    );
  }
  // Conecta aquí tu función de envío de correo (Nodemailer, Resend, etc.)
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, inviteCode } = registerSchema.parse(
      req.body,
    );

    // 1. Verificar si el correo ya existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: "El correo ya está registrado" });
      return;
    }

    // 2. Verificar si el código de invitación es válido y no ha sido usado
    const invite = await prisma.invite.findUnique({
      where: { code: inviteCode },
    });
    if (!invite) {
      res.status(400).json({ error: "Código de invitación inválido" });
      return;
    }

    // 3. Encriptar contraseña y crear usuario
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    // 5. Generar Token
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
    );
    res.status(201).json({
      message: "Usuario registrado con éxito",
      token,
      user: { id: newUser.id, name: newUser.name, role: newUser.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0].message });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({ error: "Tu cuenta está suspendida" });
      return;
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
    );
    res.json({
      message: "Login exitoso",
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0].message });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  async (req: Request, res: Response): Promise<void> => {
    const genericResponse = {
      message:
        "Si el correo está registrado, enviaremos un enlace para recuperar tu cuenta.",
    };

    try {
      const { email: rawEmail } = forgotPasswordSchema.parse(req.body);
      const email = rawEmail.trim().toLowerCase();

      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(rawToken);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

        await sendPasswordResetLink({ to: user.email, resetUrl });
      }

      res.status(200).json(genericResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0].message });
        return;
      }
      console.error("Error en forgot-password:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  },
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token: rawToken, newPassword } = resetPasswordSchema.parse(
        req.body,
      );
      const tokenHash = hashResetToken(rawToken.trim());
      const now = new Date();

      const resetRecord = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
      });

      if (!resetRecord) {
        res
          .status(400)
          .json({
            error: "El enlace de recuperación es inválido o ha expirado.",
          });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetRecord.userId },
          data: { passwordHash },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetRecord.id },
          data: { usedAt: now },
        }),
      ]);

      res
        .status(200)
        .json({ message: "Contraseña actualizada correctamente." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0].message });
        return;
      }
      console.error("Error en reset-password:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  },
);

export default router;
