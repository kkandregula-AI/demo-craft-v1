// Updated app.js (overlap fixed)
function renderSceneContent(ctx, scene, canvasWidth, canvasHeight) {
  const padding = 40;
  const contentWidth = canvasWidth * 0.45;
  const startX = padding;
  let y = 80;

  ctx.font = "bold 36px Inter";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(scene.title || "", startX, y);
  y += 50;

  ctx.font = "22px Inter";
  const lineHeight = 30;

  (scene.bullets || []).forEach((b) => {
    wrapText(ctx, "• " + b, startX, y, contentWidth, lineHeight);
    y += lineHeight * 1.6;
  });

  const captionY = canvasHeight - 80;
  ctx.font = "20px Inter";
  ctx.fillStyle = "#a9b7d0";
  wrapText(ctx, scene.voiceover || "", startX, captionY, canvasWidth - 80, 26);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
