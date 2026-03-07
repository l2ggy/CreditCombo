(() => {
  const SCALE_FACTOR = 2;

  const toDataUrl = async (response) => {
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const inlineBackgroundImages = async (cloneRoot, sourceRoot) => {
    const clonedElements = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
    const sourceElements = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
    const tasks = [];

    clonedElements.forEach((clonedElement, index) => {
      const sourceElement = sourceElements[index];
      if (!sourceElement) {
        return;
      }

      const computedBackgroundImage = getComputedStyle(sourceElement).backgroundImage;
      if (!computedBackgroundImage || !computedBackgroundImage.includes('url(')) {
        return;
      }

      const urls = [...computedBackgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
      if (!urls.length) {
        return;
      }

      tasks.push((async () => {
        let inlinedBackground = computedBackgroundImage;
        for (const url of urls) {
          if (url.startsWith('data:')) {
            continue;
          }

          const dataUrl = await toDataUrl(await fetch(url));
          inlinedBackground = inlinedBackground.replace(url, dataUrl);
        }

        clonedElement.style.backgroundImage = inlinedBackground;
      })());
    });

    await Promise.all(tasks);
  };

  const exportCanvas = async (target) => {
    const clonedNode = target.cloneNode(true);

    clonedNode.style.margin = '0';
    clonedNode.style.boxShadow = 'none';

    await inlineBackgroundImages(clonedNode, target);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${1080 * SCALE_FACTOR}" height="${1080 * SCALE_FACTOR}">
        <foreignObject width="1080" height="1080" transform="scale(${SCALE_FACTOR})">
          ${new XMLSerializer().serializeToString(clonedNode)}
        </foreignObject>
      </svg>
    `;

    const image = new Image();
    image.decoding = 'sync';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 1080 * SCALE_FACTOR;
    canvas.height = 1080 * SCALE_FACTOR;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    return await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportButtons = document.querySelectorAll('[data-export-target]');
  exportButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const originalLabel = button.textContent;
      const target = document.getElementById(button.dataset.exportTarget);
      if (!target) {
        return;
      }

      button.disabled = true;
      button.textContent = 'Exporting…';

      try {
        const blob = await exportCanvas(target);
        if (!blob) {
          throw new Error('Failed to export image blob');
        }

        triggerDownload(blob, button.dataset.exportName || 'ad-creative.png');
        button.textContent = 'Saved';
      } catch (error) {
        console.error(error);
        button.textContent = 'Export failed';
      } finally {
        setTimeout(() => {
          button.textContent = originalLabel;
          button.disabled = false;
        }, 1200);
      }
    });
  });
})();
