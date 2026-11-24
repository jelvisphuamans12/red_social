import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Test1234!', 10);

  // 1. Crear Administrador
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.local' },
    update: {},
    create: {
      email: 'admin@test.local',
      name: 'Administrador',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // 2. Crear Usuarios de prueba
  const alice = await prisma.user.upsert({
    where: { email: 'alice@test.local' },
    update: {},
    create: {
      email: 'alice@test.local',
      name: 'Alice',
      passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@test.local' },
    update: {},
    create: {
      email: 'bob@test.local',
      name: 'Bob',
      passwordHash,
    },
  });

  // 3. Crear una invitación generada por el admin
  await prisma.invite.upsert({
    where: { code: 'BIENVENIDO2026' },
    update: {},
    create: {
      code: 'BIENVENIDO2026',
      createdById: admin.id,
    },
  });

  console.log('✅ Datos de prueba insertados con éxito');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });