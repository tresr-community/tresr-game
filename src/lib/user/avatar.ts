/**
 * Avatar Upload Utility
 *
 * Handles client-side image validation, resize, WebP conversion,
 * and upload to Juno Storage "images" collection.
 */

import {uploadBlob} from "@junobuild/core";
import {getSatelliteConfig} from "../auth";
import {log} from "../utils/log";

const COMPONENT_NAME = "Avatar";

/** Max raw file size before processing (256 KB) */
export const AVATAR_MAX_FILE_SIZE = 256 * 1024;

/** Output dimensions (square) */
const AVATAR_SIZE = 256;

/** WebP quality (0–1) */
const AVATAR_QUALITY = 0.8;

/** Accepted MIME types */
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Validate, resize, convert and upload an avatar image.
 *
 * @param file      The raw File from an <input type="file"> or drop event
 * @param principal The user's principal ID (used as filename key)
 * @returns         The public URL of the uploaded avatar
 */
export async function uploadAvatar(
  file: File,
  principal: string
): Promise<string> {
  // --- Validate ---
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Use JPG, PNG, or WebP.`);
  }

  if (file.size > AVATAR_MAX_FILE_SIZE) {
    const sizeKB = Math.round(file.size / 1024);
    throw new Error(
      `File too large (${sizeKB} KB). Maximum is ${AVATAR_MAX_FILE_SIZE / 1024} KB.`
    );
  }

  // --- Resize + convert to WebP ---
  log.info(COMPONENT_NAME, `Processing avatar (${file.size} bytes)...`);
  const blob = await resizeAndConvert(file);
  log.info(COMPONENT_NAME, `Processed to WebP (${blob.size} bytes)`);

  // --- Upload to Juno Storage ---
  const fullPath = `/avatars/${principal}.webp`;

  const result = await uploadBlob({
    data: blob,
    filename: `${principal}.webp`,
    collection: "images",
    fullPath,
    ...getSatelliteConfig(),
  });

  const url = result.downloadUrl;
  log.info(COMPONENT_NAME, `Avatar uploaded: ${url}`);
  return url;
}

/**
 * Resize an image to AVATAR_SIZE×AVATAR_SIZE and convert to WebP.
 * Uses an OffscreenCanvas if available, otherwise falls back to a regular canvas.
 */
function resizeAndConvert(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Calculate crop (center square)
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context not available"));
          return;
        }

        // Draw cropped + resized
        ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to convert image to WebP"));
            }
          },
          "image/webp",
          AVATAR_QUALITY
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));

    // Load the file as a data URL
    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
