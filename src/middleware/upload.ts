import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { DomainError } from "./errorHandler.js";

// FR-012: size and type are checked before anything is stored. Type is checked twice — the
// declared MIME type and the file's leading bytes — so a renamed .exe isn't accepted as a PDF.
export const MAX_BYTES = Number(process.env.DOCUMENT_MAX_BYTES ?? 10 * 1024 * 1024);

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  // .docx is a zip container
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) =>
    b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
};
export const ACCEPTED_TYPES = Object.keys(SIGNATURES);

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10 },
}).single("file");

export function assertAcceptedFile(file: { mimetype: string; buffer: Buffer } | undefined) {
  if (!file) {
    throw new DomainError("FILE_REQUIRED", "Attach a file in the 'file' field.", 400);
  }
  const check = SIGNATURES[file.mimetype];
  if (!check) {
    throw new DomainError(
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported file type ${file.mimetype}. Accepted: PDF, PNG, JPEG, DOCX.`,
      415,
    );
  }
  if (!check(file.buffer)) {
    throw new DomainError("UNSUPPORTED_FILE_TYPE", "The file's contents don't match its declared type.", 415);
  }
}

// Multer middleware with its errors mapped onto the standard error shape.
export function uploadFile(required: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    parser(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new DomainError("FILE_TOO_LARGE", `Files must be ${Math.floor(MAX_BYTES / 1024 / 1024)} MB or smaller.`, 413),
          );
        }
        return next(new DomainError("UPLOAD_INVALID", "Upload must be multipart/form-data with one 'file'.", 400));
      }
      if (err) return next(err);
      if (required || req.file) {
        try {
          assertAcceptedFile(req.file);
        } catch (e) {
          return next(e);
        }
      }
      next();
    });
  };
}
