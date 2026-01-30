<script>
// ===== DP ICON PACK =====
// Version: 1.2
// All icons and designs reserved by mahi902
const DP_ICONS = {
  menu: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="3" y="5" width="18" height="2" rx="1"/><rect x="3" y="11" width="18" height="2" rx="1"/><rect x="3" y="17" width="18" height="2" rx="1"/></svg>`,
  save: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM7 3v5h8V3H7zM5 19h14v-7H5v7z"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
  bold: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.6 11.8c1-.7 1.6-1.8 1.6-2.8 0-2.5-2-4.5-4.5-4.5H7v15h5.8c2.5 0 4.5-2 4.5-4.5 0-1.4-.7-2.7-1.7-3.2zM10 7.5h2.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5H10v-3zm3.5 9H10v-3h3.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5z"/></svg>`,
  italic: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 5v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V5h-8z"/></svg>`,
  underline: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>`,
  strikethrough: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 11v2h18v-2H3z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  file: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
  'file-text': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zM8 15h8v2H8v-2zm0-4h8v2H8v-2z"/></svg>`,
  'file-pdf': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-3V13h-1.5V7h4.5v1.5zM9 10h1V8H9v2zm5.5 2h1V8.5h-1V12zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>`,
  'file-word': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1.8 15.31l-1.34-4.81-1.35 4.81H11.5l-2.1-7.31h1.5l1.32 5.11 1.44-5.11h1.24l1.32 5.11 1.34-5.11h1.4l-2.09 7.31h-1.6zM13 9V3.5L18.5 9H13z"/></svg>`,
  'file-excel': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1.8 15h-1.6l-1.2-2.5-1.2 2.5h-1.6l2-3.8-1.8-3.5h1.6l1 2.2 1.1-2.2h1.5l-1.9 3.5 2.1 3.8zM13 9V3.5L18.5 9H13z"/></svg>`,
  'file-powerpoint': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-3 15V9.5h3c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5h-1.5V17H11zm1.5-4.5h1.5c.55 0 1-.45 1-1s-.45-1-1-1h-1.5v2zM13 9V3.5L18.5 9H13z"/></svg>`,
  'file-image': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm11-4.14l-1.66-2.11-2.25 2.91-1.5-1.92L8.5 18h10l-1.5-2.14zM11 11c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z"/></svg>`,
  'file-audio': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-2 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4-4h-3v-4.5h3V14zM13 9V3.5L18.5 9H13z"/></svg>`,
  'file-video': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1 14l-3-2v2H8v-4h4v2l3-2v4zM13 9V3.5L18.5 9H13z"/></svg>`,
  'file-archive': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10h-4v-2h4v2zm0-3h-4v-2h4v2zm0-3h-4V8h4v2z"/></svg>`,
  'new-file': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-1-6h-2v-2h-2v2h-2v2h2v2h2v-2h2v-2z"/></svg>`,
  'copy-file': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
  'delete-file': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  'download-file': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  'upload-file': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z"/></svg>`,
  // --- Standard Tools ---
  edit2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>`,
  save2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.91 16c1.05-3.19 4.06-5.5 7.59-5.5 1.96 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`,
  cut: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm16-18h-3l-5 5 2.5 2.5L22 3V2z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
  paste: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>`,
  'select-all': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-18h-2v2h2V3zm2 6h-2v2h2V9zm0 8h-2v2h2v-2zm-4 4h2v-2h-2v2zm4-4h-2v2h2v-2zm0-4h-2v2h2v-2zM7 7h10v10H7V7z"/></svg>`,

  // --- Formatting v2 ---
  bold2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9h-3.5v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>`,
  italic2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/></svg>`,
  underline2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>`,
  strikethrough2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 11v2h18v-2H3z"/></svg>`,
  superscript: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 7h-2v1h3v1h-4V7c0-.55.45-1 1-1h2V5h-3V4h4v2c0 .55-.45 1-1 1zM5.88 20h2.1l3.4-5.42 3.42 5.42h2.1L12.31 14l4.38-7h-2.1l-3.08 4.9L8.41 7h-2.1l4.37 7L5.88 20z"/></svg>`,
  subscript: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 18h-2v1h3v1h-4v-2c0-.55.45-1 1-1h2v-1h-3v-1h4v2c0 .55-.45 1-1 1zM5.88 18h2.1l3.4-5.42 3.42 5.42h2.1L12.31 12l4.38-7h-2.1l-3.08 4.9L8.41 5h-2.1l4.37 7L5.88 18z"/></svg>`,

  // --- Alignment ---
  'align-left': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>`,
  'align-center': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6V7h10v2H7zM3 3v2h18V3H3z"/></svg>`,
  'align-right': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-8h12V7H9v2zM3 3v2h18V3H3z"/></svg>`,
  'align-justify': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/></svg>`,

  // --- Lists & Indent ---
  'bullet-list': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>`,
  'numbered-list': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>`,
  'increase-indent': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v2h9V8H3zm0 9h9v-2H3v2zm0-4h18v-2H3v2zm0-10v2h18V3H3zm11 10.5l4.5-4.5L14 4.5v9z"/></svg>`,
  'decrease-indent': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11 13h10v-2H11v2zm0 8h10v-2H11v2zm0-10V7h10v2H11zM3 3v2h18V3H3zm0 10.5L7.5 9 3 4.5v9zM3 21h18v-2H3v2z"/></svg>`,

  // --- Specialized ---
  'code-block': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>`,
  
  // --- Navigation & System ---
  home: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  forward: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
  
  // --- Info & Help ---
  help: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
  
  // --- Account & Access ---
  exit: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>`,
  login: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11 7L9.59 8.41 12.17 11H2v2h10.17l-2.58 2.59L11 17l5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  user: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 13.4 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  
  // --- Security ---
  lock: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>`,
  unlock: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5-2.28 0-4.27 1.54-4.84 3.59L9.25 5.5C9.57 4.62 10.42 4 11.38 4c1.1 0 2 .9 2 2v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/></svg>`,
  
  // --- Media & Multimedia ---
  image: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
  photo: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>`,
  video: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 10c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm0-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>`,
  microphone: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
  audio: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
  attachment: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>`,
  link: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>`,
  gallery: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>`,
  
  // --- Player Controls ---
  play: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`,
  'forward-media': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`,
  'rewind-media': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`,
  
  // --- Volume ---
  'volume-up': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  'volume-down': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,

  // --- Status & Action ---
  plus: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>`,
  add: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  remove: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  'tick-circle': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  error: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>`,
  'info-circle': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
  question: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`,
  loading: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8zm0 16c4.41 0 8-3.59 8-8h2c0 5.52-4.48 10-10 10v-2z"/></svg>`,
  'refresh-circle': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`, // Note: Re-using logic, but usually a circular arrow
  sync: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`,
  
  // --- Cloud ---
  cloud: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>`,
  'cloud-upload': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>`,
  'cloud-download': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>`,

  // --- Arrows & Direction ---
  'arrow-up': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>`,
  'arrow-down': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>`,
  'arrow-left': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  'arrow-right': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg>`,
  'double-arrow-left': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6V6z"/></svg>`,
  'double-arrow-right': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6-1.41 1.41zM16 6h2v12h-2V6z"/></svg>`,

  // --- Chevrons (Dropdowns/Accordions) ---
  'chevron-up': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>`,
  'chevron-down': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`,
  'chevron-left': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.41 7.41L10.83 12l4.58 4.59L14 18l-6-6 6-6z"/></svg>`,
  'chevron-right': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,

  // --- UI Elements & Toggles ---
  'plus-circle': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  'minus-circle': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>`,
  'settings-gear': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 1h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`,
  'home-circle': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15h-3v-5h6v5h-3zm5-6l-5-4.5L7 11V9.5l5-4.5 5 4.5V11z"/></svg>`,
  'menu-hamburger': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`,
  sidebar: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H9V5h10v14z"/></svg>`,
  'toggle-on': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>`,
  'toggle-off': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zM7 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>`,

  // --- Alerts & Time ---
  bell: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`,
  notification: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`,
  stopwatch: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`,

  // --- Collections ---
  star: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
  favorite: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`,
  label: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>`,

  // --- Table Management ---
  'add-row': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z"/><path d="M13 13h3v-2h-3V8h-2v3H8v2h3v3h2z"/></svg>`,
  'add-column': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z"/><path d="M11 11V8h2v3h3v2h-3v3h-2v-3H8v-2z"/></svg>`,
  'remove-row': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z"/><path d="M8 11h8v2H8z"/></svg>`,
  'remove-column': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z"/><path d="M11 8h2v8h-2z"/></svg>`,

  // --- Drawing Tools ---
  pencil2: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>`,
  brush: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34a.996.996 0 0 0-1.41 0L9 12.25 11.75 15l10.37-10.37c.38-.39.38-1.03 0-1.42z"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.78-.78 2.05 0 2.83L5.03 20h7.38l7.99-7.99c.78-.78.78-2.05 0-2.83L16.55 3.59c-.39-.39-.9-.59-1.41-.59zM11.41 18H7.41l-2.93-2.93 7.59-7.59 3.93 3.93L11.41 18z"/></svg>`,
  fill: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18 4V3c0-.55-.45-1-1-1H5c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V6h1v4H9v11c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-9h7V4h-2z"/></svg>`,
  airbrush: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7v2H6a2 2 0 0 0-2 2v2h16v-2a2 2 0 0 0-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v2H9V7c0-1.66 1.34-3 3-3zm-3 11v1h1v-1H9zm5 0v1h1v-1h-1zm-2 2v1h1v-1h-1zm-3 1v1h1v-1H9zm6 0v1h1v-1h-1zm-3 2v1h1v-1h-1z"/></svg>`,
  'color-picker': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.66 3L12 8.66 13.51 10.17l-9.83 9.83c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l9.83-9.83 1.51 1.51L22.11 7.41c.78-.78.78-2.05 0-2.83L19.07 1.5c-.78-.78-2.05-.78-2.82 0l-1.41 1.5z"/></svg>`,

  // --- Shapes & Selection ---
  rectangle: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14z"/></svg>`,
  ellipse: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
  polygon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 13.52l-7.07 7.07c-.39.39-1.02.39-1.41 0L2.93 13.09a.996.996 0 0 1 0-1.41l10.6-10.6c.39-.39 1.02-.39 1.41 0l7.07 7.07c.39.39.39 1.02 0 1.41l-.01-.04z"/></svg>`,
  lasso: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12.91 3.09c-2.43 0-4.41 1.98-4.41 4.41s1.98 4.41 4.41 4.41c1.17 0 2.22-.46 3-1.21l3.59 3.59-1.41 1.41-3.59-3.59a4.414 4.414 0 1 0-1.41 1.41l3.59 3.59-3.09 3.09c-.39.39-.39 1.02 0 1.41s1.02.39 1.41 0l3.09-3.09 3.59 3.59c.39.39 1.02.39 1.41 0s.39-1.02 0-1.41l-3.59-3.59 1.41-1.41L22 9.5c0-3.53-2.87-6.41-6.41-6.41h-2.68zM15 7.5c0 1.38-1.12 2.5-2.5 2.5S10 8.88 10 7.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5z"/></svg>`,
  marquee: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 5h2V3H3v2zm0 8h2v-2H3v2zm0 8h2v-2H3v2zm4 0h2v-2H7v2zm8 0h2v-2h-2v2zm-4 0h2v-2h-2v2zm10 0v-2h-2v2h2zm0-8h-2v2h2v-2zm0-8v2h-2V3h2zm-4 0h-2v2h2V3zm-4 0h-2v2h2V3zm-4 0H7v2h2V3z"/></svg>`,

  // --- Layers & Editing ---
  layer: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 8.93l-9-7-9 7 1.63 1.34L12 16z"/></svg>`,
  move: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.63 3.89l1.41-1.42c-.52-.75-.87-1.59-1.02-2.47zm1.02 5.47c1.16.9 2.51 1.44 3.89 1.61v-2.02c-.87-.14-1.72-.49-2.47-1.02l-1.42 1.43zM13 4.07V1L9 5l4 4V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
  flip: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15 21h2v-2h-2v2zm4-12h2V7h-2v2zM3 5v14c0 1.1.9 2 2 2h4v-2H5V5h4V3H5c-1.1 0-2 .9-2 2zm16-2v2h2c0-1.1-.9-2-2-2zm-8 20h2V1h-2v22zm8-6h2v-2h-2v2zM15 5h2V3h-2v2zm4 8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2z"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 15.5l-3.33-3.33c-.39-.39-1.02-.39-1.41 0L13 15.5H16V20h-4v-3h-2v3c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-4.5h1zm-17-7V4h4V1H2c-1.1 0-2 .9-2 2v6h2v-3.5l3.33 3.33c.39.39 1.02.39 1.41 0L11 5.5H8V1h4v4c0 1.1-.9 2-2 2H4.5V9h-1z"/></svg>`,
  zoom: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,

  // --- Misc UI ---
  export: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`,
  'trash': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,

  // --- Redesigned Android (Clean Silhouette) ---
  android: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 22h2v-2H7v2zm8 0h2v-2h-2v2zM7 18h10V9H7v9zm11-8h1v5h-1v-5zM5 10h1v5H5v-5zm7-6.5c-2.2 0-4 1.8-4 4h8c0-2.2-1.8-4-4-4zm3.6-1.1l.7-.7c.2-.2.2-.5 0-.7-.2-.2-.5-.2-.7 0l-.7.7c-.1.1-.1.2-.1.3s0 .2.1.3c.1.1.2.1.3.1zm-7.2 0c.1 0 .2 0 .3-.1.1-.1.1-.2.1-.3s0-.2-.1-.3l-.7-.7c-.2-.2-.5-.2-.7 0-.2.2-.2.5 0 .7l.7.7c.1.1.3.1.4.1z"/></svg>`,

  apple: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.5 13c-.02-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.9.8-3.7.8-.8 0-2-.8-3.2-.8-1.6 0-3.1.9-3.9 2.4-1.6 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 2.9 2.4 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-.1 2.8-1.2.9-1.3 1.3-2.6 1.3-2.6s-2.3-.9-2.3-3.6zm-2.4-8.8c.7-.8 1.1-1.9.9-3.1-1 .1-2.3.7-3 1.5-.6.8-1.1 1.9-.9 3.1 1.2.1 2.3-.7 3-1.5z"/></svg>`,

  // --- Social Media ---
  facebook: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1V12h3l-.5 3h-2.5v6.8c4.56-.93 8-4.96 8-9.8z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22.46 6c-.81.35-1.68.58-2.58.69a4.51 4.51 0 0 0 1.97-2.48c-.87.51-1.83.88-2.86 1.08a4.49 4.49 0 0 0-7.65 4.09A12.74 12.74 0 0 1 2 4.67a4.49 4.49 0 0 0 1.39 6c-.74-.02-1.43-.23-2.03-.56v.05a4.49 4.49 0 0 0 3.6 4.4c-.66.18-1.35.22-2.05.09a4.5 4.5 0 0 0 4.2 3.12A9.01 9.01 0 0 1 1 19.55a12.7 12.7 0 0 0 6.88 2.01c8.26 0 12.78-6.84 12.78-12.78l-.01-.58A9.13 9.13 0 0 0 23 6.13l-.54-.13z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.81.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.81-.41 2.23a3.71 3.71 0 0 1-.9 1.38c-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.81-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.81.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.77.13 4.9.33 4.14.63c-.78.3-1.45.71-2.11 1.37S.93 3.36.63 4.14C.33 4.9.13 5.77.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.28.26 2.15.56 2.91.3.78.71 1.45 1.37 2.11s1.33 1.07 2.11 1.37c.76.3 1.63.5 2.91.56 1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07c1.28-.06 2.15-.26 2.91-.56.78-.3 1.45-.71 2.11-1.37s1.07-1.33 1.37-2.11c.3-.76.5-1.63.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.28-.26-2.15-.56-2.91-.3-.78-.71-1.45-1.37-2.11s-1.33-1.07-2.11-1.37c-.76-.3-1.63-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.8a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a2.7 2.7 0 0 0-2.7-2.7c-1.2 0-2.3.7-2.7 1.7v-1.4h-2.5v7.7h2.5v-4.3a1.4 1.4 0 0 1 1.4-1.4 1.4 1.4 0 0 1 1.4 1.4v4.3h2.6M7.3 8.8a1.5 1.5 0 0 0 0-3 1.5 1.5 0 0 0 0 3m1.3 9.7V10.8H6v7.7h2.6z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.16c-.24.67-1.39 1.27-1.91 1.35-.52.08-1.02.1-3-.71-2.38-.97-3.92-3.39-4.04-3.55-.12-.16-.97-1.29-.97-2.46 0-1.17.61-1.75.83-1.99.22-.24.48-.3.65-.3h.46c.14 0 .34-.05.51.37.18.43.61 1.48.66 1.59.05.11.08.24 0 .41-.08.16-.12.27-.24.41-.12.14-.26.31-.37.42-.12.12-.24.26-.1.5.14.24.61 1.01 1.31 1.63.9.8 1.66 1.05 1.9 1.17.24.12.38.1.52-.06.14-.16.61-.71.77-.95.16-.24.32-.2.54-.12.22.08 1.41.66 1.65.78.24.12.41.18.47.28.06.11.06.63-.18 1.3z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.27 4.58c-1.32-.6-2.72-1.05-4.19-1.3a.08.08 0 0 0-.08.04c-.18.33-.39.77-.53 1.11a14.73 14.73 0 0 0-4.94 0c-.14-.34-.35-.78-.54-1.11a.08.08 0 0 0-.08-.04c-1.47.25-2.87.7-4.19 1.3a.08.08 0 0 0-.04.03C2.01 8.64 1.29 12.59 1.7 16.51a.08.08 0 0 0 .03.05c1.8 1.32 3.53 2.12 5.24 2.65a.08.08 0 0 0 .09-.03c.4-.55.76-1.13 1.07-1.74a.08.08 0 0 0-.04-.1c-.58-.22-1.14-.48-1.69-.8a.08.08 0 0 1-.01-.13c.12-.09.23-.18.35-.28a.08.08 0 0 1 .08-.01c3.42 1.57 7.11 1.57 10.48 0a.08.08 0 0 1 .08.01c.12.1.23.19.35.28a.08.08 0 0 1-.01.13c-.55.32-1.11.58-1.69.8a.08.08 0 0 0-.04.1c.31.61.67 1.19 1.07 1.74a.08.08 0 0 0 .09.03c1.71-.53 3.44-1.33 5.24-2.65a.08.08 0 0 0 .03-.05c.49-4.64-.81-8.52-3.1-11.9a.08.08 0 0 0-.04-.03zM9.13 13c-.93 0-1.7-.86-1.7-1.92 0-1.06.75-1.92 1.7-1.92.95 0 1.71.86 1.71 1.92 0 1.06-.75 1.92-1.71 1.92zm5.74 0c-.93 0-1.7-.86-1.7-1.92 0-1.06.75-1.92 1.7-1.92.95 0 1.71.86 1.71 1.92 0 1.06-.75 1.92-1.71 1.92z"/></svg>`,

  // --- Video & Services ---
  youtube: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM9.96 15.22V8.78L15.58 12l-5.62 3.22z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.59 14.45c-.18.3-.58.4-.87.21-2.43-1.48-5.49-1.82-9.09-1-.34.07-.68-.15-.75-.49-.07-.34.15-.68.49-.75 3.93-.9 7.34-.51 10.03 1.13.29.19.39.59.21.87l-.02.03zm1.22-2.73a.998.998 0 0 1-1.37.33c-2.78-1.71-7.02-2.21-10.31-1.21-.45.14-.91-.11-1.05-.56s.11-.91.56-1.05c3.78-1.15 8.46-.58 11.64 1.38.4.24.52.76.28 1.16l.25-.05zm.11-2.88c-3.33-1.98-8.84-2.17-12.01-1.21-.51.15-1.05-.14-1.2-.65-.15-.51.14-1.05.65-1.2 3.66-1.11 9.74-.89 13.58 1.39.46.27.61.87.34 1.33s-.9.61-1.36.34z"/></svg>`,
  github: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .83-.26 2.72 1.02a9.43 9.43 0 0 1 5 0c1.88-1.28 2.71-1.02 2.71-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>`,

  // --- Tech & Infrastructure ---
  google: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,

  // --- Archives & Data ---
  'file-zip': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 6h-2v2h2v-2zm0-2h-2v2h2v-2zm0-2h-2v2h2V8zm2 8h-4v2h4v-2z"/></svg>`,
  'file-csv': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-3 14H9v-1h2v1zm3 0h-2v-1h2v1zm0-2h-5v-1h5v1zm2-4H7V7h9v3z"/></svg>`,
  'file-json': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 15h-2v-1h2v1zm2-3h-4v-1h4v1zm0-3h-4V8h4v1zM13 3.5L18.5 9H13V3.5z"/></svg>`,
  'file-xml': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 14l-1.5-1.5L13 16l-1.5-1.5L10 16l-2-2 2-2 1.5 1.5L13 12l1.5 1.5L16 12l2 2-3 2z"/></svg>`,

  // --- Web & Styles ---
  'file-css': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 12h-2v1h2v1h-3v-4h3v1h-2v1h2v1zm5-1.5h-3v1h2v1h-3v-4h3v1h-2v1h2v1z"/></svg>`,
  'file-html': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 15h-1v-4h-1v4H9v-5h1v2h1v-2h1v5zm4 0h-3v-1h1v-3h-1v-1h3v1h-1v3h1v1z"/></svg>`,
  'file-js': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm.1 16.5c-.7 0-1.2-.2-1.6-.6l.7-.7c.3.3.6.4.9.4.4 0 .6-.2.6-.5v-4h1v3.9c0 1-.7 1.5-1.6 1.5zm3.4-.1c-.6 0-1.1-.2-1.5-.6l.6-.7c.3.3.6.4.9.4.3 0 .5-.1.5-.4s-.1-.4-.5-.5l-.4-.1c-.7-.2-1.1-.5-1.1-1.2 0-.7.6-1.2 1.4-1.2.5 0 .9.1 1.3.4l-.6.8c-.2-.2-.5-.3-.7-.3-.3 0-.5.1-.5.3s.1.3.5.5l.4.1c.7.2 1.1.6 1.1 1.2s-.6 1.3-1.4 1.3z"/></svg>`,
  'file-ts': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 14h-1v-4h-1v-1h3v1h-1v4zm4.5-.1c-.6 0-1.1-.2-1.5-.6l.6-.7c.3.3.6.4.9.4.3 0 .5-.1.5-.4s-.1-.4-.5-.5l-.4-.1c-.7-.2-1.1-.5-1.1-1.2 0-.7.6-1.2 1.4-1.2.5 0 .9.1 1.3.4l-.6.8c-.2-.2-.5-.3-.7-.3-.3 0-.5.1-.5.3s.1.3.5.5l.4.1c.7.2 1.1.6 1.1 1.2s-.6 1.3-1.4 1.3z"/></svg>`,

  // --- Programming Languages ---
  'file-py': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-3 15H9v-5h2v2h1v-2h1v5h-2v-2h-1v2zm4-4h-2v-1h2v1z"/></svg>`,
  'file-php': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-5 13H8v-4h1v1.5h1V11h1v4h-1v-1.5H9V15z"/></svg>`,
  'file-java': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-4 13l-1-4h1l.5 2 1-2h1l-1.5 4h-1z"/></svg>`,
  'file-c': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 14h-2c-1.1 0-2-.9-2-2v-1c0-1.1.9-2 2-2h2v1h-2v3h2v1z"/></svg>`,
  'file-cpp': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 14h-2v-1h2v1zm4 0h-1v1h-1v-1h-1v-1h1v-1h1v1h1v1z"/></svg>`,

  // --- Design Assets ---
  'file-svg': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 12.5h-2V13h2v-1h-3v4h3v-1.5zM17 16l-2-4h-1l2 4h1z"/></svg>`,
  'file-figma': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0-3.5a1.5 1.5 0 1 1 1.5-1.5c0 .8-.7 1.5-1.5 1.5z"/></svg>`,
  'file-ai': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-4 13H9l-1-4h1l.5 2.5 1-2.5h1l-1.5 4zm4 0h-1v-4h1v4z"/></svg>`,

  // --- Media Formats ---
  'file-mp3': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-4h-3v-2h3v2z"/></svg>`,
  'file-mp4': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 14h-1v-1h1v1zm-4 0H9v-5h3v1h-2v1h2v1h-2v2z"/></svg>`,
  'file-gif': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 14h-2v-4h3v1h-2v2h2v1z"/></svg>`,
  };
};

// ===== DP REPLACEMENT LOGIC =====
function DP_replaceIcons() {
  const allElements = document.querySelectorAll("body *:not(script)");
  allElements.forEach(el => {
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        let newHTML = node.nodeValue.replace(/DP:\((.*?)\)/g, (match, iconName) => {
          return DP_ICONS[iconName] || match;
        });
        if (newHTML !== node.nodeValue) {
          const span = document.createElement("span");
          span.style.display = "inline-flex";
          span.style.verticalAlign = "middle";
          span.innerHTML = newHTML;
          node.parentNode.replaceChild(span, node);
        }
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", DP_replaceIcons);
</script>
