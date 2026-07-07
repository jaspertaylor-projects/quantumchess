// frontend/src/account/avatarUpload.js
// Purpose: Premium avatar upload — center-crop the chosen image to a 256px
// square on a canvas, then store it in the qc-avatars bucket (public read;
// paid-only insert enforced by storage RLS, path must be <uid>/...).
// Imports From: ./supabaseClient.js
// Exported To: ./AccountModal.jsx

import { supabase } from './supabaseClient.js';

const AVATAR_SIZE = 256;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

function cropToBlob(img) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) return Promise.reject(new Error('That image looks empty.'));
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
    0, 0, AVATAR_SIZE, AVATAR_SIZE,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the image.'))),
      'image/webp',
      0.85,
    );
  });
}

// Returns { url } (public URL with a cache-busting version) or { error }.
export async function uploadAvatar(user, file) {
  if (!supabase || !user) return { error: 'Accounts are not configured.' };
  if (!file || !/^image\//.test(file.type)) return { error: 'Pick an image file.' };
  if (file.size > MAX_INPUT_BYTES) return { error: 'Image is too large (max 10 MB).' };

  try {
    const img = await loadImage(file);
    const blob = await cropToBlob(img);
    const path = `${user.id}/avatar.webp`;
    const { error: uploadError } = await supabase.storage
      .from('qc-avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/webp' });
    if (uploadError) {
      const friendly = /security|policy|denied|violates/i.test(uploadError.message || '')
        ? 'Avatar upload is a Premium feature.'
        : uploadError.message || 'Upload failed.';
      return { error: friendly };
    }
    const { data } = supabase.storage.from('qc-avatars').getPublicUrl(path);
    if (!data || !data.publicUrl) return { error: 'Upload succeeded but no public URL came back.' };
    // Same path on every upload — the version param defeats stale caches.
    return { url: `${data.publicUrl}?v=${Date.now()}` };
  } catch (err) {
    return { error: (err && err.message) || 'Upload failed.' };
  }
}
