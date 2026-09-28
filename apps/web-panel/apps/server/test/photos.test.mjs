import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import sharp from 'sharp';
import { registerPhotos } from '../dist/photos.js';
import { defaultSettings, defaultPhotoEdit } from '@walldeck/contracts';
test('photo edits persist separately, validate inputs, thumbnails and private metadata stay safe', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walldeck-photos-'));
  const photos = path.join(root, 'photos'); await mkdir(photos);
  const file = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'green' } }).jpeg().toBuffer();
  await writeFile(path.join(photos, 'a.jpg'), file);
  const manifest = { sourceUrl: 'https://example.invalid/private-album', items: { a: { id: 'a', filename: 'a.jpg', width: 1200, height: 800, active: true } } };
  await writeFile(path.join(photos, '.walldeck-album.json'), JSON.stringify(manifest));
  let app = Fastify();
  try {
    await registerPhotos(app, photos, root, () => {}, async () => defaultSettings);
    const edit = { ...defaultPhotoEdit, rotation: 90, landscape: { x: .2, y: .7, zoom: 2 } };
    assert.equal((await app.inject({ method: 'PUT', url: '/api/photos/a/edit', payload: edit })).statusCode, 200);
    assert.equal((await app.inject({ method: 'PUT', url: '/api/photos/a/edit', payload: { ...edit, rotation: 45 } })).statusCode, 400);
    const list = await app.inject('/api/photos');
    assert.equal(list.json()[0].orientation, 'portrait');
    assert.doesNotMatch(list.body, /private-album|sourceUrl/);
    const thumb = await app.inject('/api/photos/a/thumbnail');
    assert.equal(thumb.statusCode, 200); assert.equal(thumb.headers['content-type'], 'image/webp');
    assert.ok((await sharp(thumb.rawPayload).metadata()).width <= 480);
    assert.deepEqual(await readFile(path.join(photos, 'a.jpg')), file);
    await app.close(); app = Fastify();
    await registerPhotos(app, photos, root, () => {}, async () => defaultSettings);
    assert.deepEqual((await app.inject('/api/photos')).json()[0].edit, edit);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
