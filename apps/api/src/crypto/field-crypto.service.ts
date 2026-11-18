import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

@Injectable()
export class FieldCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>("DATA_ENCRYPTION_KEY"), "hex");
    if (this.key.length !== 32) {
      throw new Error("DATA_ENCRYPTION_KEY must encode exactly 32 random bytes.");
    }
  }

  encrypt(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const [version, encodedIv, encodedTag, encodedData] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedTag || !encodedData) {
      throw new Error("Encrypted vehicle field has an unsupported format.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedData, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  mask(value: string | null): string | null {
    if (!value) {
      return null;
    }
    return value.length <= 4 ? "****" : `${"*".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
  }
}
