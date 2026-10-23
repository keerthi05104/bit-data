import { File, FileArchive, FileAudio, FileImage, FileText, FileVideo } from 'lucide-react';

export function fileIcon(mime = '', name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('video/')) return FileVideo;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.includes('pdf') || ['pdf','doc','docx','txt','rtf'].includes(ext)) return FileText;
  if (['zip','rar','7z','gz'].includes(ext)) return FileArchive;
  return File;
}
export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  if (bytes < 1024*1024*1024) return `${(bytes/1024/1024).toFixed(1)} MB`;
  return `${(bytes/1024/1024/1024).toFixed(1)} GB`;
}
export function formatDate(date) {
  if (!date) return 'Date unknown';
  return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric' }).format(new Date(date));
}
