import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();
const prisma = new PrismaClient();

export async function getAcceptedFriendIds(userId: number): Promise<number[]> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return [];
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: {
      requesterId: true,
      addresseeId: true,
    },
  });

  const friendIds = new Set<number>();

  for (const friendship of friendships) {
    if (friendship.requesterId === userId) {
      friendIds.add(friendship.addresseeId);
    } else if (friendship.addresseeId === userId) {
      friendIds.add(friendship.requesterId);
    }
  }

  return Array.from(friendIds);
}

export async function areFriends(
  userIdA: number,
  userIdB: number,
): Promise<boolean> {
  if (
    !Number.isInteger(userIdA) ||
    !Number.isInteger(userIdB) ||
    userIdA <= 0 ||
    userIdB <= 0 ||
    userIdA === userIdB
  ) {
    return false;
  }

  const acceptedFriend = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userIdA, addresseeId: userIdB },
        { requesterId: userIdB, addresseeId: userIdA },
      ],
    },
    select: { id: true },
  });

  return Boolean(acceptedFriend);
}

router.use(requireAuth);

function getUserId(req: AuthRequest): number | null {
  const userId = Number(req.user?.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

function emitNotification(
  req: AuthRequest,
  userId: number,
  notification: unknown,
) {
  const io = req.app.get("io") as
    | {
        to: (room: string) => {
          emit: (event: string, data: unknown) => void;
        };
      }
    | undefined;

  io?.to(`user:${userId}`).emit("new_notification", notification);
}

// ======================================================
// DESCUBRIR USUARIOS
// GET /friends/discover
// ======================================================

router.get("/discover", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const [users, relationships] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: { not: userId },
          isBanned: false,
        },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          bio: true,
        },
      }),

      prisma.friendship.findMany({
        where: {
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        select: {
          requesterId: true,
          addresseeId: true,
        },
      }),
    ]);

    const excludedIds = new Set<number>();

    relationships.forEach((friendship) => {
      excludedIds.add(friendship.requesterId);
      excludedIds.add(friendship.addresseeId);
    });

    const availableUsers = users.filter((user) => !excludedIds.has(user.id));

    return res.json(availableUsers);
  } catch (error) {
    console.error("Error al descubrir usuarios:", error);
    return res.status(500).json({
      message: "Error al buscar usuarios",
    });
  }
});

// ======================================================
// ENVIAR SOLICITUD DE AMISTAD
// POST /friends/request
// ======================================================

router.post("/request", async (req: AuthRequest, res: Response) => {
  try {
    const requesterId = getUserId(req);
    const addresseeId = Number(req.body?.addresseeId);

    if (!requesterId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    if (!Number.isInteger(addresseeId) || addresseeId <= 0) {
      return res.status(400).json({
        message: "ID del usuario destinatario inválido",
      });
    }

    if (requesterId === addresseeId) {
      return res.status(400).json({
        message: "No puedes enviarte una solicitud a ti mismo",
      });
    }

    const [requester, addressee] = await Promise.all([
      prisma.user.findUnique({
        where: { id: requesterId },
        select: { id: true, name: true },
      }),

      prisma.user.findUnique({
        where: { id: addresseeId },
        select: { id: true, name: true, isBanned: true },
      }),
    ]);

    if (!requester || !addressee || addressee.isBanned) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });

    if (existing?.status === "ACCEPTED") {
      return res.status(409).json({
        message: "Ya son amigos",
      });
    }

    if (existing?.status === "PENDING") {
      return res.status(409).json({
        message:
          existing.requesterId === requesterId
            ? "Ya enviaste una solicitud a esta persona"
            : "Esta persona ya te envió una solicitud",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let friendship;

      if (existing) {
        // Permite volver a enviar una solicitud anteriormente rechazada.
        friendship = await tx.friendship.update({
          where: { id: existing.id },
          data: {
            requesterId,
            addresseeId,
            status: "PENDING",
            createdAt: new Date(),
          },
        });
      } else {
        friendship = await tx.friendship.create({
          data: {
            requesterId,
            addresseeId,
            status: "PENDING",
          },
        });
      }

      const notification = await tx.notification.create({
        data: {
          type: "FRIEND_REQUEST",
          content: `${requester.name} te envió una solicitud de amistad`,
          userId: addresseeId,
          relatedId: friendship.id,
          relatedType: "FRIENDSHIP",
        },
      });

      return { friendship, notification };
    });

    emitNotification(req, addresseeId, result.notification);

    return res.status(201).json({
      message: "Solicitud de amistad enviada",
      friendship: result.friendship,
      notification: result.notification,
    });
  } catch (error) {
    console.error("Error al enviar solicitud:", error);

    return res.status(500).json({
      message: "Error al enviar la solicitud de amistad",
    });
  }
});

// ======================================================
// SOLICITUDES RECIBIDAS
// GET /friends/requests
// ======================================================

router.get("/requests", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const requests = await prisma.friendship.findMany({
      where: {
        addresseeId: userId,
        status: "PENDING",
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(requests);
  } catch (error) {
    console.error("Error al obtener solicitudes:", error);

    return res.status(500).json({
      message: "Error al obtener las solicitudes",
    });
  }
});

// ======================================================
// ACEPTAR SOLICITUD
// POST /friends/accept
// Body: { friendshipId: number }
// ======================================================

router.post("/accept", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const friendshipId = Number(req.body?.friendshipId);

    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    if (!Number.isInteger(friendshipId) || friendshipId <= 0) {
      return res.status(400).json({
        message: "ID de solicitud inválido",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const friendship = await tx.friendship.findUnique({
        where: { id: friendshipId },
      });

      if (!friendship) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (friendship.addresseeId !== userId) {
        throw new Error("NOT_REQUEST_RECIPIENT");
      }

      if (friendship.status !== "PENDING") {
        throw new Error("REQUEST_ALREADY_PROCESSED");
      }

      const updatedFriendship = await tx.friendship.update({
        where: { id: friendshipId },
        data: { status: "ACCEPTED" },
      });

      await tx.notification.updateMany({
        where: {
          userId,
          relatedId: friendshipId,
          relatedType: "FRIENDSHIP",
          type: "FRIEND_REQUEST",
        },
        data: {
          isRead: true,
        },
      });

      const accepter = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      const notification = await tx.notification.create({
        data: {
          type: "FRIEND_ACCEPTED",
          content: `${accepter?.name ?? "Un usuario"} aceptó tu solicitud de amistad`,
          userId: friendship.requesterId,
          relatedId: friendshipId,
          relatedType: "FRIENDSHIP",
        },
      });

      return {
        friendship: updatedFriendship,
        notification,
        requesterId: friendship.requesterId,
      };
    });

    emitNotification(req, result.requesterId, result.notification);

    return res.json({
      message: "Solicitud de amistad aceptada",
      friendship: result.friendship,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "REQUEST_NOT_FOUND") {
        return res.status(404).json({
          message: "Solicitud no encontrada",
        });
      }

      if (error.message === "NOT_REQUEST_RECIPIENT") {
        return res.status(403).json({
          message: "No puedes aceptar una solicitud que no te pertenece",
        });
      }

      if (error.message === "REQUEST_ALREADY_PROCESSED") {
        return res.status(409).json({
          message: "Esta solicitud ya fue procesada",
        });
      }
    }

    console.error("Error al aceptar solicitud:", error);

    return res.status(500).json({
      message: "Error al aceptar la solicitud",
    });
  }
});

// ======================================================
// RECHAZAR SOLICITUD
// POST /friends/reject
// Body: { friendshipId: number }
// ======================================================

router.post("/reject", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const friendshipId = Number(req.body?.friendshipId);

    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    if (!Number.isInteger(friendshipId) || friendshipId <= 0) {
      return res.status(400).json({
        message: "ID de solicitud inválido",
      });
    }

    await prisma.$transaction(async (tx) => {
      const friendship = await tx.friendship.findUnique({
        where: { id: friendshipId },
      });

      if (!friendship) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (friendship.addresseeId !== userId) {
        throw new Error("NOT_REQUEST_RECIPIENT");
      }

      if (friendship.status !== "PENDING") {
        throw new Error("REQUEST_ALREADY_PROCESSED");
      }

      await tx.friendship.update({
        where: { id: friendshipId },
        data: { status: "REJECTED" },
      });

      await tx.notification.updateMany({
        where: {
          userId,
          relatedId: friendshipId,
          relatedType: "FRIENDSHIP",
          type: "FRIEND_REQUEST",
        },
        data: {
          isRead: true,
        },
      });
    });

    return res.json({
      message: "Solicitud de amistad rechazada",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "REQUEST_NOT_FOUND") {
        return res.status(404).json({
          message: "Solicitud no encontrada",
        });
      }

      if (error.message === "NOT_REQUEST_RECIPIENT") {
        return res.status(403).json({
          message: "No puedes rechazar una solicitud que no te pertenece",
        });
      }

      if (error.message === "REQUEST_ALREADY_PROCESSED") {
        return res.status(409).json({
          message: "Esta solicitud ya fue procesada",
        });
      }
    }

    console.error("Error al rechazar solicitud:", error);

    return res.status(500).json({
      message: "Error al rechazar la solicitud",
    });
  }
});

// ======================================================
// OBTENER AMIGOS
// GET /friends
// ======================================================

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            bio: true,
          },
        },
        addressee: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            bio: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const friends = friendships.map((friendship) => {
      const friendUser =
        friendship.requesterId === userId
          ? friendship.addressee
          : friendship.requester;

      return {
        ...friendUser,
        friendshipId: friendship.id,
        friendshipStatus: friendship.status,
        isFriend: true,
      };
    });

    return res.json(friends);
  } catch (error) {
    console.error("Error al obtener amigos:", error);

    return res.status(500).json({
      error: "No se pudo obtener tu lista de amigos aceptados",
      message: "Error al obtener amigos",
    });
  }
});

export default router;
