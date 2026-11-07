const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

async function main() {
  const source = path.join(__dirname, "..", "assets", "exile-reactor.svg");
  const output = path.join(__dirname, "..", "assets", "exile-reactor.ico");
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  if (!fs.existsSync(source)) {
    throw new Error(`Reactor SVG not found: ${source}`);
  }

  const pngs = await Promise.all(
    sizes.map((size) =>
      sharp(source)
        .resize(size, size, { fit: "contain" })
        .png()
        .toBuffer(),
    ),
  );

  // ICO files contain PNG-encoded images, one image per resolution.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = [];
  for (let i = 0; i < pngs.length; i++) {
    const size = sizes[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += pngs[i].length;
  }

  fs.writeFileSync(output, Buffer.concat([header, ...entries, ...pngs]));
  console.log(`Created ${output} (${sizes.join(", ")} px)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
