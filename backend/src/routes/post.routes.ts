
import { Router, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import { upload } from '../config/upload';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

const MAX_FILES = 10;

const REACTION_TYPES = [
  'LIKE',
  'LOVE',
  'HAHA',
  'WOW',
  'SAD',
  'ANGRY',
] as const;

type ReactionType = typeof REACTION_TYPES[number];

function isReactionType(value: unknown): value is ReactionType {
  return (
    typeof value === 'string' &&
    REACTION_TYPES.includes(value as ReactionType)
  );
}

function countReactions(reactions: { type: string }[]) {
  const counts: Record<ReactionType, number> = {
    LIKE: 0,
    LOVE: 0,
    HAHA: 0,
    WOW: 0,
    SAD: 0,
    ANGRY: 0,
  };

  for (const reaction of reactions) {
    if (isReactionType(reaction.type)) {
      counts[reaction.type]++;
    }
  }

  return counts;
}

// Determinar el tipo de archivo
function getMediaType(mimeType: string): string {
  if (mimeType.startsWith('image/')) {
    return 'IMAGE';
  }

  if (mimeType.startsWith('video/')) {
    return 'VIDEO';
  }

  return 'DOCUMENT';
}

// Eliminar archivos subidos si ocurre un error
async function deleteUploadedFiles(files: Express.Multer.File[]) {
  await Promise.all(
    files.map(async file => {
      try {
        await fs.unlink(
          path.join(process.cwd(), 'uploads', file.filename)
        );
      } catch (error) {
        console.error(
          `No se pudo eliminar el archivo ${file.filename}:`,
          error
        );
      }
    })
  );
}

// Middleware para recibir hasta 10 archivos
function uploadPostFiles(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  upload.array('files', MAX_FILES)(
    req,
    res,
    async (error: unknown) => {
      if (error) {
        const files = Array.isArray(req.files)
          ? req.files
          : [];

        await deleteUploadedFiles(files);

        const uploadError = error as {
          code?: string;
          message?: string;
        };

        if (uploadError.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'Cada archivo puede pesar como máximo 50 MB.',
          });
          return;
        }

        if (
          uploadError.code === 'LIMIT_FILE_COUNT' ||
          uploadError.code === 'LIMIT_UNEXPECTED_FILE'
        ) {
          res.status(400).json({
            error: 'Solo puedes subir hasta 10 archivos por publicación. Comprueba también que el campo se llame files.',
          });
          return;
        }

        console.error('Error al subir archivos:', error);

        res.status(400).json({
          error: uploadError.message || 'No se pudieron subir los archivos.',
        });
        return;
      }

      next();
    }
  );
}

// GET /api/posts - Obtener publicaciones, archivos, reacciones y comentarios
router.get(
  '/',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const posts = await prisma.post.findMany({
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          media: {
            orderBy: {
              position: 'asc',
            },
          },
          comments: {
            where: {
              parentCommentId: null,
            },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
              reactions: {
                select: {
                  userId: true,
                  type: true,
                },
              },
              replies: {
                orderBy: {
                  createdAt: 'asc',
                },
                include: {
                  author: {
                    select: {
                      id: true,
                      name: true,
                      avatarUrl: true,
                    },
                  },
                  reactions: {
                    select: {
                      userId: true,
                      type: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          reactions: {
            select: {
              userId: true,
              type: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const formattedPosts = posts.map(post => {
        const myReaction = post.reactions.find(
          reaction => reaction.userId === userId
        );

        const reactionCounts = countReactions(post.reactions);

        const comments = post.comments.map(comment => {
          const commentReaction = comment.reactions.find(
            reaction => reaction.userId === userId
          );

          const replies = comment.replies.map(reply => {
            const replyReaction = reply.reactions.find(
              reaction => reaction.userId === userId
            );

            return {
              ...reply,
              myReaction: replyReaction?.type ?? null,
              reactionCounts: countReactions(reply.reactions),
              reactionsCount: reply.reactions.length,
              replies: [],
            };
          });

          return {
            ...comment,
            myReaction: commentReaction?.type ?? null,
            reactionCounts: countReactions(comment.reactions),
            reactionsCount: comment.reactions.length,
            replies,
          };
        });

        return {
          id: post.id,
          content: post.content,
          imageUrl: post.imageUrl,
          media: post.media,
          privacy: post.privacy,
          authorId: post.authorId,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          isEdited: post.isEdited,
          author: post.author,
          comments,
          myReaction: myReaction?.type ?? null,
          reactionCounts,
          likesCount: post.reactions.length,
        };
      });

      res.json(formattedPosts);
    } catch (error) {
      console.error('Error al obtener publicaciones:', error);

      res.status(500).json({
        error: 'Error al obtener los posts',
      });
    }
  }
);

// POST /api/posts - Crear publicación con hasta 10 archivos
router.post(
  '/',
  requireAuth,
  uploadPostFiles,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const files = Array.isArray(req.files)
      ? req.files
      : [];

    try {
      const userId = req.user!.id;

      const content =
        typeof req.body.content === 'string'
          ? req.body.content.trim()
          : '';

      const privacy =
        typeof req.body.privacy === 'string' &&
        req.body.privacy.trim()
          ? req.body.privacy.trim()
          : 'MEMBERS';

      if (!content && files.length === 0) {
        res.status(400).json({
          error: 'La publicación debe tener texto o al menos un archivo.',
        });

        await deleteUploadedFiles(files);
        return;
      }

      if (files.length > MAX_FILES) {
        res.status(400).json({
          error: 'Solo puedes publicar hasta 10 archivos.',
        });

        await deleteUploadedFiles(files);
        return;
      }

      // Mantener imageUrl para compatibilidad con publicaciones antiguas
      const firstImage = files.find(file =>
        file.mimetype.startsWith('image/')
      );

      const imageUrl = firstImage
        ? `/uploads/${firstImage.filename}`
        : null;

      const post = await prisma.post.create({
        data: {
          content,
          imageUrl,
          privacy,
          authorId: userId,

          media: {
            create: files.map((file, index) => ({
              url: `/uploads/${file.filename}`,
              originalName: file.originalname,
              mimeType: file.mimetype,
              fileSize: file.size,
              mediaType: getMediaType(file.mimetype),
              position: index,
              uploadedById: userId,
            })),
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
          media: {
            orderBy: {
              position: 'asc',
            },
          },
        },
      });

      res.status(201).json({
        message: 'Publicación creada correctamente',
        post,
      });
    } catch (error) {
      console.error('Error al crear publicación:', error);

      // Si falla la creación, eliminar los archivos que se subieron
      await deleteUploadedFiles(files);

      res.status(500).json({
        error: 'Error al guardar la publicación y sus archivos.',
      });
    }
  }
);

// POST /api/posts/:id/reaction - Añadir, cambiar o quitar reacción
router.post(
  '/:id/reaction',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const postId = Number(req.params.id);
    const userId = req.user!.id;
    const type = req.body.type;

    if (!Number.isInteger(postId) || postId <= 0) {
      res.status(400).json({
        error: 'ID de publicación inválido',
      });
      return;
    }

    if (!isReactionType(type)) {
      res.status(400).json({
        error: 'Tipo de reacción inválido',
      });
      return;
    }

    try {
      const { notification, ...result } = await prisma.$transaction(async tx => {
        const post = await tx.post.findUnique({
          where: { id: postId },
          select: {
            id: true,
            authorId: true,
          },
        });

        if (!post) {
          throw new Error('POST_NOT_FOUND');
        }

        const existingReaction = await tx.reaction.findUnique({
          where: {
            postId_userId: {
              postId,
              userId,
            },
          },
        });

        let myReaction: ReactionType | null;

        let createdNotification: Awaited<
          ReturnType<typeof tx.notification.create>
        > | null = null;

        if (existingReaction?.type === type) {
          await tx.reaction.delete({
            where: { id: existingReaction.id },
          });

          myReaction = null;
        } else if (existingReaction) {
          await tx.reaction.update({
            where: { id: existingReaction.id },
            data: { type },
          });

          myReaction = type;
        } else {
          await tx.reaction.create({
            data: {
              postId,
              userId,
              type,
            },
          });

          myReaction = type;

          if (post.authorId !== userId) {
            const actor = await tx.user.findUnique({
              where: { id: userId },
              select: { name: true },
            });

            createdNotification = await tx.notification.create({
              data: {
                type: 'LIKE',
                content: `${actor?.name || 'Un usuario'} reaccionó a tu publicación (${type}).`,
                userId: post.authorId,
              },
            });
          }
        }

        const reactions = await tx.reaction.findMany({
          where: { postId },
          select: { type: true },
        });

        return {
          myReaction,
          likesCount: reactions.length,
          reactionCounts: countReactions(reactions),
          notification: createdNotification,
        };
      });

      if (notification) {
        const io = req.app.get('io');

        io?.to(`user:${notification.userId}`).emit(
          'new_notification',
          notification
        );
      }

      res.json({
        message: result.myReaction
          ? 'Reacción guardada correctamente'
          : 'Reacción eliminada correctamente',
        ...result,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'POST_NOT_FOUND'
      ) {
        res.status(404).json({
          error: 'Publicación no encontrada',
        });
        return;
      }

      console.error('Error al procesar reacción:', error);

      res.status(500).json({
        error: 'Error al procesar la reacción',
      });
    }
  }
);

// POST /api/posts/:id/comments - Añadir comentario o respuesta
// Body: { content: string, parentCommentId?: number }
router.post(
  '/:id/comments',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const postId = Number(req.params.id);
    const userId = req.user!.id;

    const content =
      typeof req.body.content === 'string'
        ? req.body.content.trim()
        : '';

    const rawParentCommentId = req.body.parentCommentId;
    let parentCommentId: number | null = null;

    if (rawParentCommentId !== undefined && rawParentCommentId !== null && rawParentCommentId !== '') {
      parentCommentId = Number(rawParentCommentId);
    }

    if (!Number.isInteger(postId) || postId <= 0) {
      res.status(400).json({ error: 'ID de publicación inválido' });
      return;
    }

    if (!content) {
      res.status(400).json({ error: 'El comentario no puede estar vacío' });
      return;
    }

    if (content.length > 5000) {
      res.status(400).json({ error: 'El comentario no puede superar los 5000 caracteres' });
      return;
    }

    if (parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      res.status(400).json({ error: 'ID del comentario al que respondes inválido' });
      return;
    }

    try {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true },
      });

      if (!post) {
        res.status(404).json({ error: 'Publicación no encontrada' });
        return;
      }

      let parentComment: { id: number; authorId: number } | null = null;

      if (parentCommentId !== null) {
        parentComment = await prisma.comment.findFirst({
          where: {
            id: parentCommentId,
            postId,
            parentCommentId: null,
          },
          select: {
            id: true,
            authorId: true,
          },
        });

        if (!parentComment) {
          res.status(404).json({
            error: 'El comentario al que intentas responder no existe o no pertenece a esta publicación',
          });
          return;
        }
      }

      const comment = await prisma.comment.create({
        data: {
          content,
          postId,
          authorId: userId,
          parentCommentId,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          reactions: {
            select: {
              userId: true,
              type: true,
            },
          },
        },
      });

      // Las respuestas notifican al autor del comentario principal.
      // Los comentarios principales notifican al autor de la publicación.
      const notificationUserId = parentComment
        ? parentComment.authorId
        : post.authorId;

      if (notificationUserId !== userId) {
        const notification = await prisma.notification.create({
          data: {
            type: parentComment ? 'COMMENT_REPLY' : 'COMMENT',
            content: parentComment
              ? `${comment.author.name} respondió tu comentario: "${content.substring(0, 100)}"`
              : `${comment.author.name} comentó tu publicación: "${content.substring(0, 100)}"`,
            userId: notificationUserId,
          },
        });

        const io = req.app.get('io');
        io?.to(`user:${notificationUserId}`).emit('new_notification', notification);
      }

      res.status(201).json({
        message: parentComment
          ? 'Respuesta añadida correctamente'
          : 'Comentario añadido correctamente',
        comment: {
          ...comment,
          myReaction: null,
          reactionCounts: countReactions([]),
          reactionsCount: 0,
          replies: [],
        },
      });
    } catch (error) {
      console.error('Error al crear comentario:', error);
      res.status(500).json({ error: 'Error al comentar' });
    }
  }
);

// DELETE /api/posts/:postId/comments/:commentId
// Solo el autor del comentario o un administrador pueden eliminarlo.
// Las respuestas y reacciones se eliminan mediante onDelete: Cascade.
router.delete(
  '/:postId/comments/:commentId',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);
    const userId = req.user!.id;

    if (!Number.isInteger(postId) || postId <= 0 || !Number.isInteger(commentId) || commentId <= 0) {
      res.status(400).json({ error: 'ID de publicación o comentario inválido' });
      return;
    }

    try {
      const [comment, currentUser] = await Promise.all([
        prisma.comment.findFirst({
          where: { id: commentId, postId },
          include: {
            post: {
              select: { authorId: true },
            },
          },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }),
      ]);

      if (!comment) {
        res.status(404).json({ error: 'Comentario no encontrado' });
        return;
      }

      const isAdmin =
        currentUser?.role === 'ADMIN' ||
        currentUser?.role === 'ADMINISTRADOR';

      const canDelete = comment.authorId === userId || isAdmin;

      if (!canDelete) {
        res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' });
        return;
      }

      await prisma.comment.delete({ where: { id: commentId } });

      res.json({
        message: 'Comentario eliminado correctamente',
        commentId,
        postId,
      });
    } catch (error) {
      console.error('Error al eliminar comentario:', error);
      res.status(500).json({ error: 'No se pudo eliminar el comentario' });
    }
  }
);

// POST /api/posts/:postId/comments/:commentId/reaction
// Añade, cambia o quita la reacción del usuario al comentario.
router.post(
  '/:postId/comments/:commentId/reaction',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);
    const userId = req.user!.id;
    const type = req.body.type;

    if (!Number.isInteger(postId) || postId <= 0 || !Number.isInteger(commentId) || commentId <= 0) {
      res.status(400).json({ error: 'ID de publicación o comentario inválido' });
      return;
    }

    if (!isReactionType(type)) {
      res.status(400).json({ error: 'Tipo de reacción inválido' });
      return;
    }

    try {
      const result = await prisma.$transaction(async tx => {
        const comment = await tx.comment.findFirst({
          where: { id: commentId, postId },
          select: {
            id: true,
            authorId: true,
          },
        });

        if (!comment) {
          throw new Error('COMMENT_NOT_FOUND');
        }

        const existingReaction = await tx.commentReaction.findUnique({
          where: {
            commentId_userId: {
              commentId,
              userId,
            },
          },
        });

        let myReaction: ReactionType | null;
        let createdNotification: Awaited<
          ReturnType<typeof tx.notification.create>
        > | null = null;

        if (existingReaction?.type === type) {
          await tx.commentReaction.delete({
            where: { id: existingReaction.id },
          });
          myReaction = null;
        } else if (existingReaction) {
          await tx.commentReaction.update({
            where: { id: existingReaction.id },
            data: { type },
          });
          myReaction = type;
        } else {
          await tx.commentReaction.create({
            data: {
              commentId,
              userId,
              type,
            },
          });
          myReaction = type;

          if (comment.authorId !== userId) {
            const actor = await tx.user.findUnique({
              where: { id: userId },
              select: { name: true },
            });

            createdNotification = await tx.notification.create({
              data: {
                type: 'COMMENT_REACTION',
                content: `${actor?.name || 'Un usuario'} reaccionó a tu comentario (${type}).`,
                userId: comment.authorId,
              },
            });
          }
        }

        const reactions = await tx.commentReaction.findMany({
          where: { commentId },
          select: { userId: true, type: true },
        });

        return {
          myReaction,
          reactionsCount: reactions.length,
          reactionCounts: countReactions(reactions),
          notification: createdNotification,
        };
      });

      if (result.notification) {
        const io = req.app.get('io');
        io?.to(`user:${result.notification.userId}`).emit(
          'new_notification',
          result.notification
        );
      }

      res.json({
        message: result.myReaction
          ? 'Reacción guardada correctamente'
          : 'Reacción eliminada correctamente',
        myReaction: result.myReaction,
        reactionsCount: result.reactionsCount,
        reactionCounts: result.reactionCounts,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'COMMENT_NOT_FOUND') {
        res.status(404).json({ error: 'Comentario no encontrado' });
        return;
      }

      console.error('Error al reaccionar al comentario:', error);
      res.status(500).json({ error: 'No se pudo procesar la reacción' });
    }
  }
);

// ======================================================
// DELETE /api/posts/:id - Eliminar publicación
// El autor o un administrador pueden eliminarla.
// También elimina los archivos físicos asociados.
// ======================================================

router.delete(
  '/:id',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const postId = Number(req.params.id);
    const userId = req.user!.id;

    if (!Number.isInteger(postId) || postId <= 0) {
      res.status(400).json({
        error: 'ID de publicación inválido',
      });
      return;
    }

    try {
      const [post, currentUser] = await Promise.all([
        prisma.post.findUnique({
          where: { id: postId },
          include: {
            media: {
              select: {
                url: true,
              },
            },
          },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }),
      ]);

      if (!post) {
        res.status(404).json({
          error: 'Publicación no encontrada',
        });
        return;
      }

      const isAdmin =
        currentUser?.role === 'ADMIN' ||
        currentUser?.role === 'ADMINISTRADOR';

      if (post.authorId !== userId && !isAdmin) {
        res.status(403).json({
          error: 'No tienes permiso para eliminar esta publicación',
        });
        return;
      }

      // Guardar las rutas antes de eliminar el registro.
      const fileUrls = new Set<string>();

      if (post.imageUrl) {
        fileUrls.add(post.imageUrl);
      }

      post.media.forEach(media => {
        fileUrls.add(media.url);
      });

      // Eliminar publicación y sus registros relacionados.
      // Prisma eliminará comentarios, reacciones y PostMedia
      // gracias a las relaciones con onDelete: Cascade.
      await prisma.post.delete({
        where: { id: postId },
      });

      // Eliminar los archivos físicos asociados.
      for (const fileUrl of fileUrls) {
        if (!fileUrl.startsWith('/uploads/')) {
          continue;
        }

        const filename = path.basename(
          fileUrl.split('?')[0]
        );

        if (!filename || filename === '.' || filename === '..') {
          continue;
        }

        try {
          await fs.unlink(
            path.join(process.cwd(), 'uploads', filename)
          );
        } catch (fileError) {
          const error = fileError as NodeJS.ErrnoException;

          if (error.code !== 'ENOENT') {
            console.error(
              `No se pudo eliminar el archivo ${filename}:`,
              fileError
            );
          }
        }
      }

      res.json({
        message: 'Publicación eliminada correctamente',
        postId,
      });
    } catch (error) {
      console.error('Error al eliminar publicación:', error);

      res.status(500).json({
        error: 'No se pudo eliminar la publicación',
      });
    }
  }
);

export default router;
