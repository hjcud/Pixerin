// Desktop checks never replace or inspect the user's system clipboard.
module.exports = async (app) =>
  app.evaluate(({ clipboard, nativeImage }) => {
    if (globalThis.__mockPixelClipboard) return;
    globalThis.__mockPixelClipboard = true;
    globalThis.__testClipboardImage = nativeImage.createEmpty();
    clipboard.writeImage = (image) => {
      globalThis.__testClipboardImage = image;
    };
    clipboard.readImage = () => globalThis.__testClipboardImage;
  });
