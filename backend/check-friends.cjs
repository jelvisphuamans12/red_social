const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const amistades = await prisma.friendship.findMany({
    include: {
      requester: {
        select: { id: true, name: true }
      },
      addressee: {
        select: { id: true, name: true }
      }
    }
  });

  const notificaciones = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 15
  });

  console.log("\n=== SOLICITUDES Y AMISTADES ===");
  console.log(JSON.stringify(amistades, null, 2));

  console.log("\n=== NOTIFICACIONES ===");
  console.log(JSON.stringify(notificaciones, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
