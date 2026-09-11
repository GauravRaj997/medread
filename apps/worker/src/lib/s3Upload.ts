import { DeleteObjectsCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME!;

// Uploads a generated export (PDF/JPEG) under its own prefix, separate from
// originals, so cleanup/lifecycle rules can treat them differently later if needed.
export async function uploadExportToS3(buffer: Buffer, contentType: string): Promise<string> {
  const extension = contentType === "application/pdf" ? "pdf" : "jpg";
  const key = `exports/${crypto.randomUUID()}.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    })
  );

  return key;
}

export async function deleteS3Objects(keys: Array<string | null | undefined>): Promise<void> {
  const objects = keys.filter((key): key is string => Boolean(key)).map((Key) => ({ Key }));
  if (objects.length === 0) return;

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: objects, Quiet: true },
    })
  );
}
