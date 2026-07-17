import { getR2 } from './db';

export async function uploadToR2(
  key: string,
  data: ReadableStream | ArrayBuffer | string,
  contentType: string
): Promise<void> {
  const r2 = await getR2();
  await r2.put(key, data, {
    httpMetadata: { contentType },
  });
}

export async function getFromR2(key: string): Promise<R2ObjectBody | null> {
  const r2 = await getR2();
  return r2.get(key);
}

export async function deleteFromR2(key: string): Promise<void> {
  const r2 = await getR2();
  await r2.delete(key);
}

export function generateVideoKey(courseId: string, lessonId: string, ext: string): string {
  return `courses/${courseId}/lessons/${lessonId}/video.${ext}`;
}

export function generateImageKey(type: 'workshop' | 'course' | 'avatar', id: string, ext: string): string {
  return `images/${type}/${id}.${ext}`;
}
