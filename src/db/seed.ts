import { pbkdf2Sync, randomBytes } from "node:crypto";
import { prisma } from "@/db/prisma";

const SAMPLE_EMAIL = "sample@penny.local";
const SAMPLE_PASSWORD = "penny-sample-123";
const SAMPLE_DISPLAY_NAME = "Sample Founder";
const PASSWORD_ITERATIONS = 120_000;

function createPasswordHash(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, "sha512").toString("hex");
  return `pbkdf2_sha512$${PASSWORD_ITERATIONS}$${salt}$${derived}`;
}

async function ensureSampleUser() {
  const existing = await prisma.user.findUnique({
    where: { email: SAMPLE_EMAIL },
  });

  if (existing) {
    const passwordSalt = randomBytes(16).toString("hex");
    if (!existing.emailVerifiedAt) {
      return prisma.user.update({
        where: { email: SAMPLE_EMAIL },
        data: {
          emailVerifiedAt: new Date(),
          passwordHash: createPasswordHash(SAMPLE_PASSWORD, passwordSalt),
          passwordSalt,
        },
      });
    }

    return prisma.user.update({
      where: { email: SAMPLE_EMAIL },
      data: {
        passwordHash: createPasswordHash(SAMPLE_PASSWORD, passwordSalt),
        passwordSalt,
      },
    });
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: SAMPLE_EMAIL,
      displayName: SAMPLE_DISPLAY_NAME,
      passwordHash: createPasswordHash(SAMPLE_PASSWORD, passwordSalt),
      passwordSalt,
      emailVerifiedAt: new Date(),
    },
  });

  return user;
}

async function ensureSampleMap(userId: string) {
  const existingMap = await prisma.thoughtMap.findFirst({
    where: { userId },
    include: { nodes: true },
  });

  if (existingMap) {
    return existingMap;
  }

  const map = await prisma.thoughtMap.create({
    data: {
      userId,
      title: "Sample founder map",
      rawThought: "Seeded starter map for local development.",
      status: "ready",
    },
  });

  const root = await prisma.thoughtNode.create({
    data: {
      mapId: map.id,
      kind: "root",
      nodeStatus: "active",
      content: "Seeded founder claim graph",
      note: "Local development seed",
      branchOrder: 0,
    },
  });

  await prisma.thoughtNode.createMany({
    data: [
      {
        mapId: map.id,
        parentId: root.id,
        kind: "claim",
        nodeStatus: "active",
        content: "Our biggest risk in the next 6 months is closing enterprise deals slowly.",
        note: "Seed claim 1",
        branchOrder: 1,
      },
      {
        mapId: map.id,
        parentId: root.id,
        kind: "claim",
        nodeStatus: "active",
        content: "The current team can execute the roadmap without a key hire.",
        note: "Seed claim 2",
        branchOrder: 2,
      },
      {
        mapId: map.id,
        parentId: root.id,
        kind: "claim",
        nodeStatus: "active",
        content: "The market timing for this category is favorable for the next 18 months.",
        note: "Seed claim 3",
        branchOrder: 3,
      },
    ],
  });

  await prisma.thoughtMapEvent.create({
    data: {
      mapId: map.id,
      nodeId: root.id,
      eventType: "map_created",
      payload: JSON.stringify({
        source: "development_seed",
        seedClaims: 3,
        seedUserId: userId,
      }),
    },
  });

  return prisma.thoughtMap.findUnique({
    where: { id: map.id },
    include: { nodes: true, events: true },
  });
}

async function main() {
  const sampleUser = await ensureSampleUser();
  await ensureSampleMap(sampleUser.id);

  console.log(
    JSON.stringify(
      {
        user: {
          email: sampleUser.email,
          displayName: sampleUser.displayName,
        },
        credentials: {
          email: SAMPLE_EMAIL,
          password: SAMPLE_PASSWORD,
        },
        note: "Development seed created a loginable sample user and starter map.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
