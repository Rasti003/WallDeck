import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { extractPhotoMetadata, readPhotoMetadata } from '../dist/photo-metadata.js';

test('only original capture date is used and camera calendar date is preserved', () => {
  assert.equal(extractPhotoMetadata({ DateTimeOriginal: '2024:02:29 23:50:00' }).takenOn, '2024-02-29');
  assert.equal(extractPhotoMetadata({ DateTimeOriginal: '2023:02:29 10:00:00' }).takenOn, null);
  assert.equal(extractPhotoMetadata({ DateTimeOriginal: '2024-01-01T00:15:00+14:00' }).takenOn, '2024-01-01');
  assert.deepEqual(extractPhotoMetadata({ ModifyDate: '2020:01:01', CreateDate: '2020:01:01', downloadedAt: '2020-01-01' }), { takenOn: null, place: null });
});
test('embedded place is preferred and coordinates require a valid pair', () => {
  assert.equal(extractPhotoMetadata({ City: 'Kraków', Country: 'Polska', latitude: 50, longitude: 20 }).place, 'Kraków · Polska');
  assert.equal(extractPhotoMetadata({ latitude: 50.1234, longitude: 20.1234 }).place, '50.12°N 20.12°E');
  assert.equal(extractPhotoMetadata({ latitude: 200, longitude: 20 }).place, null);
});
test('reads embedded EXIF from a real image and invalidates cache after replacement', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walldeck-exif-'));
  const filename = path.join(root, 'photo.jpg');
  try {
    await sharp({ create: { width: 50, height: 50, channels: 3, background: 'green' } }).withExif({ IFD2: { DateTimeOriginal: '2022:07:12 12:00:00' } }).jpeg().toFile(filename);
    assert.equal((await readPhotoMetadata(filename)).takenOn, '2022-07-12');
    await sharp({ create: { width: 60, height: 60, channels: 3, background: 'red' } }).jpeg().toFile(filename);
    assert.deepEqual(await readPhotoMetadata(filename), { takenOn: null, place: null });
  } finally { await rm(root, { recursive: true, force: true }); }
});
