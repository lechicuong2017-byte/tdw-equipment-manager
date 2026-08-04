import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const encryptionVersion = 1;

function getEncryptionKey() {
  const encoded = String(
    process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY || "",
  ).trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new Error("SOFTWARE_LICENSE_ENCRYPTION_KEY chưa được cấu hình hợp lệ");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("SOFTWARE_LICENSE_ENCRYPTION_KEY phải có đúng 32 byte");
  }
  return key;
}

function additionalData(licenseId: string, version: number) {
  return Buffer.from(`tdw:software-license:${licenseId}:v${version}`, "utf8");
}

export function maskSoftwareLicenseKey(value: string) {
  const suffix = value.match(/[A-Za-z0-9]/g)?.slice(-4).join("") || "";
  return suffix ? `••••-••••-${suffix}` : "••••-••••";
}

export function encryptSoftwareLicenseKey(value: string, licenseId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(additionalData(licenseId, encryptionVersion));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    encryptionVersion,
  };
}

export function decryptSoftwareLicenseKey(
  encrypted: {
    ciphertext: string;
    iv: string;
    authTag: string;
    encryptionVersion: number;
  },
  licenseId: string,
) {
  if (encrypted.encryptionVersion !== encryptionVersion) {
    throw new Error("Phiên bản mã hóa key chưa được hỗ trợ");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(additionalData(licenseId, encrypted.encryptionVersion));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
