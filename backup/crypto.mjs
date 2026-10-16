import {createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes} from "node:crypto";
import {createReadStream, createWriteStream} from "node:fs";
import {rm} from "node:fs/promises";
import {basename, resolve} from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";

const MAGIC = Buffer.from("MMWRBK01", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;
const ALGORITHM = "aes-256-gcm";

// Only deterministic evidence that persisted encrypted data failed its
// integrity checks uses this type. Configuration and provider/I/O errors stay
// ordinary errors so the run ledger does not overstate a validation failure.
export class BackupValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackupValidationError";
  }
}

function parseMasterKey(encodedKey) {
  if (typeof encodedKey !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
    throw new Error("Backup encryption key must be a canonical base64-encoded 32-byte key.");
  }
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    key.fill(0);
    throw new Error("Backup encryption key must be a canonical base64-encoded 32-byte key.");
  }
  return key;
}

function contextBytes(runId, artifactId) {
  for (const value of [runId, artifactId]) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
      throw new Error("Backup run and artifact IDs must use 1-80 alphanumeric, underscore, or hyphen characters.");
    }
  }
  return Buffer.from(`mmwr:backup:v1:${runId}:${artifactId}`, "utf8");
}

function deriveArtifactKey(masterKey, salt, runId, artifactId) {
  return Buffer.from(hkdfSync("sha256", masterKey, salt, contextBytes(runId, artifactId), 32));
}

function createHashState() {
  return {hash: createHash("sha256"), bytes: 0};
}

function updateHash(state, chunk) {
  state.hash.update(chunk);
  state.bytes += chunk.length;
}

function finishHash(state) {
  return {sha256: state.hash.digest("hex"), bytes: state.bytes};
}

function ensureDifferentFiles(inputPath, outputPath) {
  if (resolve(inputPath) === resolve(outputPath)) {
    throw new Error("Backup encryption input and output must be different files.");
  }
}

/**
 * Encrypts a file to a new, mode-restricted MMWR envelope without loading it
 * into memory. The caller must keep outputPath in a private temporary folder.
 */
export async function encryptBackupFile({inputPath, outputPath, encodedKey, runId, artifactId}) {
  ensureDifferentFiles(inputPath, outputPath);
  const masterKey = parseMasterKey(encodedKey);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const artifactKey = deriveArtifactKey(masterKey, salt, runId, artifactId);
  const cipher = createCipheriv(ALGORITHM, artifactKey, iv);
  const plaintext = createHashState();
  const ciphertext = createHashState();
  const header = Buffer.concat([MAGIC, salt, iv]);

  async function* encryptChunks() {
    updateHash(ciphertext, header);
    yield header;

    for await (const rawChunk of createReadStream(inputPath)) {
      const chunk = Buffer.from(rawChunk);
      updateHash(plaintext, chunk);
      const encrypted = cipher.update(chunk);
      if (encrypted.length) {
        updateHash(ciphertext, encrypted);
        yield encrypted;
      }
    }

    const final = cipher.final();
    if (final.length) {
      updateHash(ciphertext, final);
      yield final;
    }

    const tag = cipher.getAuthTag();
    updateHash(ciphertext, tag);
    yield tag;
  }

  try {
    await pipeline(
      Readable.from(encryptChunks()),
      createWriteStream(outputPath, {flags: "wx", mode: 0o600}),
    );
    return {
      format: "MMWRBK01",
      algorithm: ALGORITHM,
      runId,
      artifactId,
      plaintext: finishHash(plaintext),
      encrypted: finishHash(ciphertext),
    };
  } catch (error) {
    await rm(outputPath, {force: true}).catch(() => {});
    throw error;
  } finally {
    masterKey.fill(0);
    artifactKey.fill(0);
  }
}

/**
 * Decrypts only to a new private temporary file. Authentication and manifest
 * checks complete before the caller may move that file into a restore step.
 */
export async function decryptBackupFile({
  inputPath,
  outputPath,
  encodedKey,
  runId,
  artifactId,
  expectedPlaintextSha256,
  expectedPlaintextBytes,
  expectedEncryptedSha256,
  expectedEncryptedBytes,
}) {
  ensureDifferentFiles(inputPath, outputPath);
  if ((expectedPlaintextSha256 === undefined) !== (expectedPlaintextBytes === undefined)) {
    throw new BackupValidationError("Backup plaintext expectations must include both digest and size.");
  }
  const masterKey = parseMasterKey(encodedKey);
  const plaintext = createHashState();
  const ciphertext = createHashState();
  let artifactKey;
  let decipher;

  async function* decryptChunks() {
    let buffered = Buffer.alloc(0);
    let headerRead = false;
    let trailing = Buffer.alloc(0);

    for await (const rawChunk of createReadStream(inputPath)) {
      const chunk = Buffer.from(rawChunk);
      updateHash(ciphertext, chunk);
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;

      if (!headerRead) {
        if (buffered.length < HEADER_BYTES) continue;
        const magic = buffered.subarray(0, MAGIC.length);
        if (!magic.equals(MAGIC)) throw new BackupValidationError("Backup artifact format is unsupported.");

        const saltStart = MAGIC.length;
        const ivStart = saltStart + SALT_BYTES;
        const salt = buffered.subarray(saltStart, ivStart);
        const iv = buffered.subarray(ivStart, HEADER_BYTES);
        artifactKey = deriveArtifactKey(masterKey, salt, runId, artifactId);
        decipher = createDecipheriv(ALGORITHM, artifactKey, iv);
        buffered = buffered.subarray(HEADER_BYTES);
        headerRead = true;
      }

      if (headerRead && buffered.length) {
        const available = Buffer.concat([trailing, buffered]);
        if (available.length > TAG_BYTES) {
          const ciphertextChunk = available.subarray(0, available.length - TAG_BYTES);
          trailing = available.subarray(available.length - TAG_BYTES);
          const decrypted = decipher.update(ciphertextChunk);
          if (decrypted.length) {
            updateHash(plaintext, decrypted);
            yield decrypted;
          }
        } else {
          trailing = available;
        }
        buffered = Buffer.alloc(0);
      }
    }

    if (!headerRead || !decipher || trailing.length !== TAG_BYTES) {
      throw new BackupValidationError("Backup artifact is incomplete.");
    }

    let final;
    try {
      decipher.setAuthTag(trailing);
      final = decipher.final();
    } catch {
      throw new BackupValidationError("Backup artifact authentication failed.");
    }
    if (final.length) {
      updateHash(plaintext, final);
      yield final;
    }
  }

  try {
    await pipeline(
      Readable.from(decryptChunks()),
      createWriteStream(outputPath, {flags: "wx", mode: 0o600}),
    );

    const actualPlaintext = finishHash(plaintext);
    const actualEncrypted = finishHash(ciphertext);
    const plaintextMismatch = expectedPlaintextSha256 !== undefined
      && (actualPlaintext.sha256 !== expectedPlaintextSha256 || actualPlaintext.bytes !== expectedPlaintextBytes);
    if (plaintextMismatch
      || actualEncrypted.sha256 !== expectedEncryptedSha256
      || actualEncrypted.bytes !== expectedEncryptedBytes) {
      throw new BackupValidationError("Backup artifact does not match its encrypted manifest.");
    }
    return {plaintext: actualPlaintext, encrypted: actualEncrypted};
  } catch (error) {
    await rm(outputPath, {force: true}).catch(() => {});
    throw error;
  } finally {
    masterKey.fill(0);
    artifactKey?.fill(0);
  }
}

export function newBackupArtifactId(prefix = "object") {
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(prefix)) {
    throw new Error("Backup artifact prefix is invalid.");
  }
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

export function safeBackupObjectName(runId, artifactId) {
  contextBytes(runId, artifactId);
  return `runs/${runId}/${basename(artifactId)}.mmwrbk`;
}
