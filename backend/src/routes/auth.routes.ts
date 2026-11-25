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
  securityQuestion: z.string().min(3).optional(),
  securityAnswer: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

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
  return answer.trim().toLowerCase();
}

async function createSingleUseResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

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
  console.log(
    `[RECOVERY] Enlace de recuperación para ${params.to}: ${params.resetUrl}`,
  );
  // Conecta aquí tu proveedor de correo (Resend, Nodemailer, etc.) si deseas envío real por email.
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      email: rawEmail,
      password,
      inviteCode,
      securityQuestion,
      securityAnswer,
    } = registerSchema.parse(req.body);

    const email = rawEmail.trim().toLowerCase();

    // 1. Verificar si el correo ya existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: "El correo ya está registrado" });
      return;
    }

    // 2. Verificar si el código de invitación es válido
    const invite = await prisma.invite.findUnique({
      where: { code: inviteCode },
    });
    if (!invite) {
      res.status(400).json({ error: "Código de invitación inválido" });
      return;
    }

    // 3. Encriptar contraseña y (opcionalmente) pregunta de seguridad
    const passwordHash = await bcrypt.hash(password, 10);
    const securityAnswerHash = securityAnswer
      ? await bcrypt.hash(normalizeAnswer(securityAnswer), 10)
      : null;

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        securityQuestion: securityQuestion?.trim() || null,
        securityAnswerHash,
      },
    });

    // 4. Generar Token
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
    console.error("Error en register:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email: rawEmail, password } = loginSchema.parse(req.body);
    const email = rawEmail.trim().toLowerCase();

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
    console.error("Error en login:", error);
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
        const rawToken = await createSingleUseResetToken(user.id);
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

// POST /api/auth/security-question
router.post(
  "/security-question",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email: rawEmail } = securityQuestionSchema.parse(req.body);
      const email = rawEmail.trim().toLowerCase();

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !user.securityQuestion || !user.securityAnswerHash) {
        res.status(400).json({
          error:
            "No hay una pregunta de seguridad configurada para este correo.",
        });
        return;
      }

      res.status(200).json({ question: user.securityQuestion });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0].message });
        return;
      }
      console.error("Error en security-question:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  },
);

// POST /api/auth/verify-security-answer
router.post(
  "/verify-security-answer",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email: rawEmail, answer } = verifySecurityAnswerSchema.parse(
        req.body,
      );
      const email = rawEmail.trim().toLowerCase();

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !user.securityAnswerHash) {
        res.status(400).json({
          error: "No se pudo validar la respuesta de seguridad.",
        });
        return;
      }

      const isValid = await bcrypt.compare(
        normalizeAnswer(answer),
        user.securityAnswerHash,
      );

      if (!isValid) {
        res.status(400).json({ error: "La respuesta no coincide." });
        return;
      }

      const resetToken = await createSingleUseResetToken(user.id);

      res.status(200).json({
        resetToken,
        token: resetToken,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0].message });
        return;
      }
      console.error("Error en verify-security-answer:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  },
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = resetPasswordSchema.parse(req.body);
      const nextPassword = parsed.newPassword || parsed.password;

      if (!nextPassword || nextPassword.length < 6) {
        res.status(400).json({
          error: "La nueva contraseña debe tener al menos 6 caracteres.",
        });
        return;
      }

      const now = new Date();
      const passwordHash = await bcrypt.hash(nextPassword, 10);

      // Flujo A: Restablecimiento mediante token de un solo uso
      if (parsed.token && parsed.token !== "direct-reset") {
        const tokenHash = hashResetToken(parsed.token.trim());
        const resetRecord = await prisma.passwordResetToken.findFirst({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: now },
          },
        });

        if (!resetRecord) {
          res.status(400).json({
            error:
              "El enlace o token de recuperación es inválido o ha expirado.",
          });
          return;
        }

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
        return;
      }

      // Flujo B: Restablecimiento directo validando correo + respuesta de seguridad
      if (parsed.email && parsed.answer) {
        const email = parsed.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.securityAnswerHash) {
          res.status(400).json({
            error: "No se pudo validar la cuenta para cambiar la contraseña.",
          });
          return;
        }

        const isValid = await bcrypt.compare(
          normalizeAnswer(parsed.answer),
          user.securityAnswerHash,
        );

        if (!isValid) {
          res
            .status(400)
            .json({ error: "La respuesta de seguridad no coincide." });
          return;
        }

        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
          }),
          prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: now },
          }),
        ]);

        res
          .status(200)
          .json({ message: "Contraseña actualizada correctamente." });
        return;
      }

      res.status(400).json({
        error: "Faltan datos válidos para restablecer la contraseña.",
      });
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
