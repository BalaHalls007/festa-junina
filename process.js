const sharp = require('sharp');

async function process() {
  const img = await sharp('current.png').raw().toBuffer({ resolveWithObject: true });
  const { data, info } = img;
  const { width, height } = info;

  console.log('Processing', width, 'x', height);

  // Step 1: Find per-row content boundaries
  // Content = NOT background (not near-black AND not near-white/cream)
  const leftContent = new Int32Array(height);
  const rightContent = new Int32Array(height);

  for (let y = 0; y < height; y++) {
    let left = width, right = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const bright = (r + g + b) / 3;
      const sat = maxC - minC;

      const isDarkBg = maxC < 12;
      const isLightBg = bright > 190 && sat < 48 && minC / Math.max(maxC, 1) > 0.84;

      if (!isDarkBg && !isLightBg) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }

    // Minimum margin of 15px
    if (left === width) {
      // Entire row is background
      leftContent[y] = -1;
      rightContent[y] = -1;
    } else {
      leftContent[y] = Math.max(left, 5);
      rightContent[y] = Math.min(right, width - 6);
    }
  }

  // Step 2: Apply transparency
  let transparentCount = 0;

  for (let y = 0; y < height; y++) {
    const left = leftContent[y];
    const right = rightContent[y];

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const bright = (r + g + b) / 3;
      const sat = maxC - minC;

      const isDarkBg = maxC < 12;
      const isLightBg = bright > 190 && sat < 48 && minC / Math.max(maxC, 1) > 0.84;

      let makeTransparent = false;

      if (left === -1) {
        // Entire row is background → all transparent
        makeTransparent = true;
      } else if (x < left || x > right) {
        // Outside content boundaries
        makeTransparent = true;
      } else if (isDarkBg) {
        // Black background within content area
        makeTransparent = true;
      } else if (isLightBg) {
        // White/cream background within content area
        makeTransparent = true;
      }

      if (makeTransparent) {
        data[i + 3] = 0;     // alpha = 0
        data[i] = 0;         // zero RGB to prevent bleed
        data[i + 1] = 0;
        data[i + 2] = 0;
        transparentCount++;
      }
    }
  }

  const total = width * height;
  console.log('Transparent:', transparentCount, '(' + (transparentCount / total * 100).toFixed(1) + '%)');
  console.log('Opaque:', total - transparentCount, '(' + ((total - transparentCount) / total * 100).toFixed(1) + '%)');

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile('output.png');

  console.log('Saved output.png');
}

process().catch(console.error);
