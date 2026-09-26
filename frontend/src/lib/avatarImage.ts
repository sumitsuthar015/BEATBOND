import { avatarUrl, type AvatarConfig } from "@/lib/avatar";

// The avatar artwork is 240×290. A profile photo is square and usually shown
// as a small circle, so crop a square around the face.
const ART_WIDTH = 240;
const ART_HEIGHT = 290;
const CROP = { x: 20, y: 18, size: 200 };

/** Draws an avatar as a square PNG, ready to upload as a profile photo. */
export const avatarToPng = async (config: AvatarConfig, seed: string, size = 512): Promise<Blob> => {
  const dataUri = avatarUrl(config, seed);
  // Give the SVG a real size so the browser rasterises it at full detail.
  const svg = decodeURIComponent(dataUri.slice(dataUri.indexOf(",") + 1))
    .replace("<svg ", `<svg width="${ART_WIDTH}" height="${ART_HEIGHT}" `);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  // The artwork has rounded corners; fill behind them with its backdrop.
  const backdrop = config.options?.backgroundColor;
  context.fillStyle = backdrop ? `#${backdrop.replace("#", "")}` : "#20242d";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, CROP.x, CROP.y, CROP.size, CROP.size, 0, 0, size, size);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the avatar"))), "image/png");
  });
};
