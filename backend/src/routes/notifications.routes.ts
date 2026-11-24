
import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middlewares/auth.middleware';
const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// ========================================
// 1. OBTENER TODAS LAS NOTIFICACIONES
// ========================================
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(notifications);
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// ========================================
// 2. OBTENER CANTIDAD DE NO LEÍDAS
// ========================================
router.get('/unread-count', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('Error al contar notificaciones:', error);
    res.status(500).json({ error: 'Error al contar notificaciones' });
  }
});

// ========================================
// 3. MARCAR UNA NOTIFICACIÓN COMO LEÍDA
// ========================================
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      res.status(400).json({ error: 'ID de notificación inválido' });
      return;
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notificación no encontrada' });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error al marcar notificación:', error);
    res.status(500).json({ error: 'Error al actualizar notificación' });
  }
});

// ========================================
// 4. MARCAR TODAS COMO LEÍDAS
// ========================================
router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    res.json({
      message: 'Todas las notificaciones fueron marcadas como leídas',
      updatedCount: result.count,
    });
  } catch (error) {
    console.error('Error al actualizar notificaciones:', error);
    res.status(500).json({ error: 'Error al actualizar notificaciones' });
  }
});

export default router;
