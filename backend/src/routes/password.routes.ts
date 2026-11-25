import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const router = Router();
const prisma = new PrismaClient();

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const SECURITY_HASH_ROUNDS = 12;

const securityQuestionSchema = z.object({
  email: z.string().email(),
});

const verifySecurityAnswerSchema = z.object({
  email: z.string().email(),
  answer: z.string().min(1),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).optional(),
  email: z.string().email().optional(),
  answer: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  newPassword: z.string().min(6).optional(),
});

function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, " ").toLowerCase();
}

async function createSingleUseResetToken(userId: number): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

async function sendPasswordResetLink(params: { to: string; resetUrl: string }) {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[DEV] Enlace de recuperación para ${params.to}: ${params.resetUrl}`,
    );
  }
  // Conecta aquí tu envío de correo real (Nodemailer, Resend, etc.)
}

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
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

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

      if (!rawToken || !newPassword) {
        res.status(400).json({
          error: "Debes proporcionar el token y la nueva contraseña.",
        });
        return;
      }

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
        res.status(400).json({
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
