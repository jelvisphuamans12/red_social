require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.friendship.findMany({
    where: {
      status: "PENDING"
    },
    include: {
      requester: {
        select: {
          name: true
        }
      }
    }
  });

  let created = 0;
  let alreadyExists = 0;

  for (const friendship of pending) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: friendship.addresseeId,
        type: "FRIEND_REQUEST",
        relatedId: friendship.id,
        relatedType: "FRIENDSHIP"
      }
    });

    if (existing) {
      alreadyExists++;
      continue;
    }

    await prisma.notification.create({
      data: {
        type: "FRIEND_REQUEST",
        content: `${friendship.requester.name} te envió una solicitud de amistad`,
        userId: friendship.addresseeId,
        relatedId: friendship.id,
        relatedType: "FRIENDSHIP"
      }
    });

    console.log(
      `Notificación creada para el usuario ${friendship.addresseeId}, solicitud ${friendship.id}`
    );

    created++;
  }

  console.log("\n=== RESULTADO ===");
  console.log({
    solicitudesPendientes: pending.length,
    notificacionesCreadas: created,
    notificacionesYaExistentes: alreadyExists
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
