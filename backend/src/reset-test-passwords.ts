const dotenv = require("dotenv");
dotenv.config();

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const users = [
    {
      email: "bob@test.local",
      password: "Bob12345!",
    },
    {
      email: "alice@test.local",
      password: "Alice12345!",
    },
  ];

  try {
    await prisma.$transaction(async (tx) => {
      for (const user of users) {
        const existingUser = await tx.user.findUnique({
          where: { email: user.email },
        });

        if (!existingUser) {
          throw new Error(
            `No existe el usuario: ${user.email}`
          );
        }

        const passwordHash = await bcrypt.hash(
          user.password,
          12
        );

        await tx.user.update({
          where: { email: user.email },
          data: { passwordHash },
        });

        console.log(`Contraseña actualizada: ${user.email}`);
      }
    });

    console.log("\n¡Contraseñas actualizadas correctamente!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
