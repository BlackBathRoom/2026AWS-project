// Shared, decorative line icons. Visible labels carry the accessible names.
const paths = {
  book:'<path d="M12 5.5C9.4 3.8 6.5 3.3 3 4v15c3.5-.7 6.4-.2 9 1.5C14.6 18.8 17.5 18.3 21 19V4c-3.5-.7-6.4-.2-9 1.5Zm0 0v15"/>',
  home:'<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-8h6v8"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  materials:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18m4-13h4m-4 4h4"/>',
  quiz:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-6 8 2 2 4-4"/>',
  ai:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4H13a8 8 0 0 1 8 7.5Z"/><path d="M7 11h9m-9 4h6"/>',
  task:'<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/>',
  progress:'<path d="M4 20h16M5 16V9h3v7m3 0V4h3v12m3 0v-5h3v5"/>',
  training:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
  review:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h4m-3 5 2 2 5-5"/>',
  manage:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
  accounts:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m3-14h6m-3-3v6"/>',
  assignments:'<path d="M3 5h6v6H3zM15 15h6v6h-6zM6 11v7h9m-2-13h8m-4-3 4 3-4 3"/>',
  approvals:'<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  audit:'<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7m2-4v6l4 2"/>',
  settings:'<path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  logout:'<path d="M10 3H4v18h6m0-9h11m-4-4 4 4-4 4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
export const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.book}</svg>`;
export const brand = () => `<span class="brand-icon">${icon('book')}</span><span class="brand-wordmark">bittomo<span class="brand-sub">情報Ⅱ 教員ラーニング</span></span>`;
export const studyIllustration = () => `<svg class="study-illustration" viewBox="0 0 360 240" fill="none" aria-hidden="true" focusable="false"><ellipse cx="176" cy="215" rx="142" ry="12" fill="#dce3d5"/><g stroke="#6f826a" stroke-width="1.8" stroke-linejoin="round"><path d="m57 178 177-15 69 24-174 17-72-26Z" fill="#edf0e5"/><path d="M57 178v15l72 26 174-18v-14l-174 17-72-26Z" fill="#e3e9db"/><path d="m77 160 161-13 47 20-163 16-45-23Z" fill="#f8f8f0"/><path d="M77 160v12l45 23 163-16v-12l-163 16-45-23Z" fill="#eef0e6"/><path d="M105 79c34-7 61 2 79 20 21-15 52-21 81-13l-27 76c-24-6-43-5-68 5-21-16-46-20-76-17l11-71Z" fill="#fafbf5"/><path d="m184 99-14 68m-67-26c25-3 48 1 67 17 22-9 43-11 69-5"/><path d="M117 96c18-2 34 3 47 12m-49 2c17-2 31 3 45 11m-47 2c17-1 28 3 43 11m44-24c17-8 33-9 48-7m-53 20c17-7 32-8 48-6m-52 19c17-6 30-8 48-5" stroke="#a7b49b"/><path d="M54 154c-2-35-8-63-18-86m14 62c-21-5-30-18-29-30 18 0 30 15 29 30Zm-8-29C22 95 17 81 20 70c16 4 25 17 22 31Zm-8-34C19 59 18 45 24 36c13 8 17 21 10 31Zm16 65c-3-19 7-32 21-35 3 16-5 30-21 35Zm-7-31c-3-18 3-32 15-39 7 16 2 30-15 39Z" fill="#c3cfb6" stroke="#97a88d"/></g></svg>`;
