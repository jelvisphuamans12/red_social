import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

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

export default router;
