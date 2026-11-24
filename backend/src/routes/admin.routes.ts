import { Router, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// POST /api/admin/invites (Solo Admin)
router.post('/invites', requireAuth, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); 
    const newInvite = await prisma.invite.create({
      data: {
        code,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ message: 'Invitación creada', invite: newInvite });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la invitación' });
  }
});

// GET /api/admin/invites (Solo Admin - Para listar)
router.get('/invites', requireAuth, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const invites = await prisma.invite.findMany({
    include: { usedBy: { select: { name: true, email: true } } }
  });
  res.json(invites);
});
// GET /api/admin/users (Solo Admin - Para listar usuarios)
router.get('/users', requireAuth, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        isBanned: true,
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
}); 
export default router;