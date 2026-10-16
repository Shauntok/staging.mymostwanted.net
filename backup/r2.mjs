import {S3Client, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command} from "@aws-sdk/client-s3";
import {Upload} from "@aws-sdk/lib-storage";
import {createReadStream} from "node:fs";
import {safeBackupObjectName} from "./crypto.mjs";

function getRequired(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Backup configuration ${name} is missing or invalid.`);
  }
  return value;
}

export function createBackupObjectStore(env = process.env) {
  if (env.MMWR_BACKUP_ENABLED !== "true") {
    throw new Error("Backup operations are disabled by configuration.");
  }

  const accountId = getRequired(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID", /^[a-f0-9]{32}$/);
  const accessKeyId = getRequired(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID", /^[A-Za-z0-9]{16,128}$/);
  const secretAccessKey = getRequired(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY", /^.{32,256}$/);
  const bucket = getRequired(env.R2_BUCKET, "R2_BUCKET", /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {accessKeyId, secretAccessKey},
  });

  return Object.freeze({
    bucket,
    async putEncryptedFile({runId, artifactId, filePath, encryptedSha256, encryptedBytes}) {
      const key = safeBackupObjectName(runId, artifactId);
      if (typeof filePath !== "string" || !filePath.trim()
        || !/^[a-f0-9]{64}$/.test(encryptedSha256)
        || !Number.isSafeInteger(encryptedBytes) || encryptedBytes < 1) {
        throw new Error("Encrypted backup artifact metadata is invalid.");
      }

      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: encryptedBytes,
          ContentType: "application/octet-stream",
          CacheControl: "private, no-store",
          Metadata: {
            "format-version": "1",
            "run-id": runId,
            "artifact-id": artifactId,
            "encrypted-sha256": encryptedSha256,
          },
        },
        partSize: 8 * 1024 * 1024,
        queueSize: 2,
        leavePartsOnError: false,
      });

      const result = await upload.done();
      return {key, etag: result.ETag ?? null, encryptedBytes};
    },
    async headEncryptedObject(key) {
      validateOpaqueKey(key);
      const result = await client.send(new HeadObjectCommand({Bucket: bucket, Key: key}));
      return {
        contentLength: result.ContentLength ?? null,
        encryptedSha256: result.Metadata?.["encrypted-sha256"] ?? null,
        formatVersion: result.Metadata?.["format-version"] ?? null,
      };
    },
    async getEncryptedObject(key) {
      validateOpaqueKey(key);
      const result = await client.send(new GetObjectCommand({Bucket: bucket, Key: key}));
      if (!result.Body) throw new Error("The backup object has no response body.");
      return result.Body;
    },
    async listEncryptedObjects(runId, continuationToken) {
      validateRunId(runId);
      const result = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `runs/${runId}/`,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }));
      return {
        objects: (result.Contents ?? []).map((object) => ({
          key: object.Key,
          lastModified: object.LastModified?.toISOString() ?? null,
          contentLength: object.Size ?? null,
        })),
        continuationToken: result.NextContinuationToken ?? null,
      };
    },
    close() {
      client.destroy();
    },
  });
}

function validateRunId(runId) {
  if (typeof runId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(runId)) {
    throw new Error("Backup run ID is invalid.");
  }
}

function validateOpaqueKey(key) {
  if (typeof key !== "string" || !/^runs\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\.mmwrbk$/.test(key)) {
    throw new Error("Backup object key is invalid.");
  }
}
