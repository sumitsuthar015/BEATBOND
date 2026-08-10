export type AvatarConfig = { gender: "male" | "female"; options: Record<string, string> };

const color = (value: string | undefined, fallback: string) => value ? `#${value.replace("#", "")}` : fallback;
const pick = (value: string | undefined, choices: string[], fallback = choices[0]) => choices.includes(value || "") ? value! : fallback;

/**
 * A local, self-contained character renderer. Avatar previews must never rely
 * on a third-party image request: that was the reason the editor showed broken
 * image icons and appeared non-functional in the installed app.
 */
export const avatarUrl = (config?: AvatarConfig | null, seed = "beatbond") => {
  const options = config?.options || {};
  const skin = color(options.skinColor, "#f2d3b1");
  const hairColor = color(options.hairColor, "#2c1b18");
  const outfit = color(options.clothingColor, "#65c9ff");
  const background = color(options.backgroundColor, "#20242d");
  const hair = pick(options.hair, ["short01", "long01", "bob", "curly", "dreads01", "frizzle"]);
  const clothes = pick(options.clothing, ["hoodie", "graphicShirt", "blazerAndShirt", "overall", "shirtCrewNeck", "collarAndSweater"]);
  const eyes = pick(options.eyes, ["default", "happy", "side", "squint", "hearts"]);
  const mouth = pick(options.mouth, ["default", "smile", "serious", "twinkle", "tongue"]);
  const glasses = options.glasses || "none";
  const facialHair = options.facialHair || "none";
  const hat = options.hat || "none";
  const jewelry = options.jewelry || "none";
  const shoes = options.shoes || "sneakers";

  const hairShape: Record<string, string> = {
    short01: `<path d="M66 105c0-39 24-60 54-60 35 0 57 22 57 61-14-13-32-18-55-18-22 0-39 6-56 17Z"/>`,
    long01: `<path d="M64 111c0-42 23-66 57-66 37 0 58 28 55 72l-14 43h-15l-5-52c-15-15-45-18-62 1l-4 51H61Z"/>`,
    bob: `<path d="M62 112c1-45 25-67 59-67 36 0 58 28 56 73l-6 43h-25l-4-53c-19-13-43-14-60 2l-3 51H59Z"/>`,
    curly: `<path d="M58 112c-10-45 18-73 58-70 42-2 67 31 55 73-8-13-18-23-31-27-8 10-29 10-40 0-15 5-29 14-42 24Z"/><circle cx="72" cy="72" r="18"/><circle cx="98" cy="56" r="18"/><circle cx="126" cy="55" r="20"/><circle cx="151" cy="69" r="19"/>`,
    dreads01: `<path d="M63 111c2-42 25-66 57-66 35 0 58 25 55 67-16-15-37-22-58-20-20-1-37 7-54 19Z"/><path d="M73 79v91M89 61v112M107 53v123M128 54v122M148 64v109M164 80v90" fill="none" stroke="${hairColor}" stroke-width="11" stroke-linecap="round"/>`,
    frizzle: `<path d="M59 114c-4-38 17-71 59-71 39 0 65 31 57 72-9-15-22-25-38-28-12 8-28 8-39 0-17 5-29 15-39 27Z"/><path d="M66 78q12-18 23 0t23 0 23 0 23 0" fill="none" stroke="${hairColor}" stroke-width="9"/>`,
  };
  const eyeShape = eyes === "hearts" ? `<text x="89" y="131" font-size="18">♥</text><text x="132" y="131" font-size="18">♥</text>` : eyes === "happy" ? `<path d="M87 126q9 10 18 0M132 126q9 10 18 0" fill="none" stroke="#202124" stroke-width="4" stroke-linecap="round"/>` : eyes === "squint" ? `<path d="M86 128l18-5M132 123l18 5" fill="none" stroke="#202124" stroke-width="4" stroke-linecap="round"/>` : eyes === "side" ? `<circle cx="99" cy="126" r="5"/><circle cx="143" cy="126" r="5"/>` : `<circle cx="96" cy="126" r="5"/><circle cx="144" cy="126" r="5"/>`;
  const mouthShape = mouth === "smile" ? `<path d="M105 153q16 17 32 0" fill="none" stroke="#9c4d56" stroke-width="4" stroke-linecap="round"/>` : mouth === "serious" ? `<path d="M108 158h25" stroke="#9c4d56" stroke-width="4" stroke-linecap="round"/>` : mouth === "tongue" ? `<path d="M109 153q12 8 25 0v10q-12 10-25 0Z" fill="#e8798b"/>` : mouth === "twinkle" ? `<path d="M109 153q12 11 25 0" fill="none" stroke="#9c4d56" stroke-width="4"/><circle cx="140" cy="150" r="2" fill="#fff"/>` : `<path d="M109 155q12 7 25 0" fill="none" stroke="#9c4d56" stroke-width="4" stroke-linecap="round"/>`;
  const outfitDetail = clothes === "hoodie" ? `<path d="M74 199q46-31 92 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="5"/><path d="M106 198v30M134 198v30" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>` : clothes === "graphicShirt" ? `<circle cx="120" cy="221" r="14" fill="#fff" fill-opacity=".75"/><path d="M113 221h14" stroke="${outfit}" stroke-width="4"/>` : clothes === "blazerAndShirt" ? `<path d="M75 196l28 36 17-18 17 18 29-36v72H75Z" fill="#27364b"/><path d="M106 198l14 17 14-17v49h-28Z" fill="#fff"/>` : clothes === "overall" ? `<path d="M87 196h66v76H87Z" fill="#2c5c86"/><path d="M91 193l16 30M149 193l-16 30" stroke="#2c5c86" stroke-width="10"/>` : clothes === "collarAndSweater" ? `<path d="M102 198l18 20 18-20" fill="#fff"/><path d="M101 198l19 20 19-20" fill="none" stroke="#fff" stroke-width="3"/>` : `<path d="M84 202q36 18 72 0" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4"/>`;
  const glassesShape = glasses === "none" ? "" : glasses === "round" ? `<circle cx="96" cy="126" r="14" fill="none" stroke="#202124" stroke-width="4"/><circle cx="144" cy="126" r="14" fill="none" stroke="#202124" stroke-width="4"/><path d="M110 126h20" stroke="#202124" stroke-width="4"/>` : `<path d="M78 116h37v21H82q-7-10-4-21Zm47 0h37q3 11-4 21h-33Z" fill="#202124" fill-opacity=".86"/><path d="M115 126h10" stroke="#202124" stroke-width="4"/>`;
  const beard = facialHair === "none" ? "" : facialHair === "moustacheFancy" ? `<path d="M103 146q8-9 17 0 9-9 18 0-8 10-18 3-10 7-17-3Z" fill="${hairColor}"/>` : `<path d="M91 143q8 36 29 36t29-36q-9 13-29 13t-29-13Z" fill="${hairColor}" fill-opacity=".85"/>`;
  const headwear = hat === "none" ? "" : hat === "beanie" ? `<path d="M72 91q6-48 48-48t48 48Z" fill="#e05263"/><path d="M69 91h102v15H69Z" fill="#bd3648"/>` : hat === "hijab" ? `<path d="M65 112q2-70 55-70t55 70l-5 72H70Z" fill="#7c4dff"/><ellipse cx="120" cy="119" rx="41" ry="52" fill="${skin}"/>` : `<path d="M68 94q9-54 52-54t52 54l-12 20H80Z" fill="#d08a3e"/><path d="M68 94h104v16H68Z" fill="#a7652c"/>`;
  const jewelryShape = jewelry === "none" ? "" : jewelry === "chain" ? `<path d="M100 183q20 17 40 0" fill="none" stroke="#f7ca4f" stroke-width="4"/>` : jewelry === "hoops" ? `<circle cx="76" cy="146" r="7" fill="none" stroke="#f7ca4f" stroke-width="3"/><circle cx="164" cy="146" r="7" fill="none" stroke="#f7ca4f" stroke-width="3"/>` : `<circle cx="76" cy="143" r="3" fill="#f7ca4f"/><circle cx="164" cy="143" r="3" fill="#f7ca4f"/>`;
  const shoeShape = shoes === "boots" ? `<path d="M78 271h28v-18h13v18h43q3-11-12-17l-17-8h-36l-17 10Z" fill="#49352c"/>` : shoes === "loafers" ? `<path d="M78 271h35v-18h13v18h36q0-10-14-15l-22-8H97l-19 10Z" fill="#542f22"/>` : `<path d="M77 271h37v-18h12v18h37q-1-10-16-15l-20-8H98l-21 10Z" fill="#f7f7f7" stroke="#364152" stroke-width="3"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 290" role="img" aria-label="Custom avatar ${seed}"><rect width="240" height="290" rx="30" fill="${background}"/><ellipse cx="120" cy="272" rx="73" ry="11" fill="#000" opacity=".2"/><path d="M91 239h27v25H91Zm31 0h27v25h-27Z" fill="#d7d8dc"/>${shoeShape}<path d="M73 277h94" stroke="#fff" stroke-opacity=".2"/><path d="M73 275v-63q4-29 31-32h32q27 3 31 32v63Z" fill="${outfit}"/>${outfitDetail}<ellipse cx="76" cy="127" rx="10" ry="16" fill="${skin}"/><ellipse cx="164" cy="127" rx="10" ry="16" fill="${skin}"/><path d="M81 91q0-43 39-43t39 43v50q0 42-39 42t-39-42Z" fill="${skin}"/>${headwear}<g fill="${hairColor}">${hairShape[hair]}</g><path d="M86 113q10-7 20 0M134 113q10-7 20 0" fill="none" stroke="${hairColor}" stroke-width="4" stroke-linecap="round"/>${eyeShape}${glassesShape}${mouthShape}${beard}${jewelryShape}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
