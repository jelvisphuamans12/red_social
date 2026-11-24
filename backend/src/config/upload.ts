
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Crear automáticamente la carpeta uploads
const uploadDir = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Guardar archivos en el backend
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    cb(null, uniqueName);
  },
});

// Tipos de archivos permitidos
const allowedMimeTypes = new Set([
  // Imágenes
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',

  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime',

  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Archivos de texto
  'text/plain',
]);

const fileFilter: multer.Options['fileFilter'] = (
  _req,
  file,
  cb
) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido'));
  }
};

// Configuración general
export const upload = multer({
  storage,

  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB por archivo
    files: 10, // Máximo 10 archivos por solicitud
  },

  fileFilter,
});
