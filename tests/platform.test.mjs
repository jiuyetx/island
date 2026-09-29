import assert from 'node:assert/strict';

let imageCreations = 0;
let writtenPath;
let imageSource;
globalThis.wx = {
  createCanvas: () => ({ createImage: () => { throw new Error('Canvas has no createImage API'); } }),
  createImage: () => {
    imageCreations += 1;
    return {
      set src(value) {
        imageSource = value;
        queueMicrotask(() => this.onload());
      },
    };
  },
  env: { USER_DATA_PATH: '/mock-user-data' },
  getFileSystemManager: () => ({
    readFileSync: (path, encoding) => {
      assert.equal(path, 'assets/generated/tropical-atlas.webp');
      assert.equal(encoding, 'base64');
      return 'mock-image';
    },
    writeFileSync: (path, contents, encoding) => {
      writtenPath = path;
      assert.equal(contents, 'mock-image');
      assert.equal(encoding, 'base64');
    },
  }),
};

const { loadImage } = await import('../src/platform.js');
await loadImage('assets/generated/tropical-atlas.webp');
assert.equal(imageCreations, 1);
assert.equal(writtenPath, '/mock-user-data/tropical-atlas.webp');
assert.equal(imageSource, writtenPath);
delete globalThis.wx;
console.log('WeChat image loading check passed');
