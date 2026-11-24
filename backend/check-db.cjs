const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();

  try {
    const [usuarios, publicaciones, mensajes, notificaciones, amistades] =
      await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.message.count(),
        prisma.notification.count(),
        prisma.friendship.count()
      ]);

    console.log({
      usuarios,
      publicaciones,
      mensajes,
      notificaciones,
      amistades
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
