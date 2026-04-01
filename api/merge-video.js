import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static binary not found.'));
      return;
    }
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

function base64ToBuffer(data) {
  return Buffer.from(data, 'base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-'));
  const inputVideo = path.join(tempDir, 'input-video.webm');
  const inputAudio = path.join(tempDir, 'input-audio.wav');
  const outputFile = path.join(tempDir, 'output.mp4');

  try {
    const { videoBase64, audioBase64 } = req.body || {};
    if (!videoBase64 || !String(videoBase64).trim()) return res.status(400).json({ error: 'Missing videoBase64' });
    if (!audioBase64 || !String(audioBase64).trim()) return res.status(400).json({ error: 'Missing audioBase64' });

    fs.writeFileSync(inputVideo, base64ToBuffer(videoBase64));
    fs.writeFileSync(inputAudio, base64ToBuffer(audioBase64));

    await runFfmpeg([
      '-y',
      '-i', inputVideo,
      '-i', inputAudio,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outputFile
    ]);

    const outputBuffer = fs.readFileSync(outputFile);
    if (!outputBuffer.length) throw new Error('Merged MP4 output is empty.');

    return res.status(200).json({
      ok: true,
      mimeType: 'video/mp4',
      mergedBase64: outputBuffer.toString('base64')
    });
  } catch (error) {
    console.error('merge-video failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown merge error' });
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}
