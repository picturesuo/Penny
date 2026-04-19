import { prisma } from "@/db/prisma";
import { generateIntellectualBiography } from "@/lib/intellectual-biography";
import type { IntellectualBiography, BiographyChapter } from "@/types/intellectual-biography";
import type { BiographyAnnotation as BiographyAnnotationRecord } from "@prisma/client";

function decorateChapter(chapter: BiographyChapter, annotations: BiographyAnnotationRecord[]): BiographyChapter {
  return {
    ...chapter,
    userAnnotations: annotations
      .filter((annotation) => annotation.chapterId === chapter.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((annotation) => ({
        id: annotation.id,
        chapterId: annotation.chapterId,
        userId: annotation.userId,
        annotationText: annotation.annotationText,
        targetType: annotation.targetType as BiographyChapter["userAnnotations"][number]["targetType"],
        targetId: annotation.targetId,
        createdAt: annotation.createdAt,
      })),
  };
}

export async function getIntellectualBiography(userId: string): Promise<IntellectualBiography> {
  const [biography, annotations] = await Promise.all([
    generateIntellectualBiography(userId),
    prisma.biographyAnnotation.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    ...biography,
    chapters: biography.chapters.map((chapter) => decorateChapter(chapter, annotations)),
  };
}

export async function addBiographyAnnotation(params: {
  userId: string;
  chapterId: string;
  targetType: "chapter" | "belief_shift" | "highlight";
  targetId: string;
  annotationText: string;
}) {
  return prisma.biographyAnnotation.create({
    data: {
      userId: params.userId,
      chapterId: params.chapterId,
      targetType: params.targetType,
      targetId: params.targetId,
      annotationText: params.annotationText,
    },
  });
}
