/// <reference types="vite/client" />
declare module '*.md?raw' {
  const text: string;
  export default text;
}
declare module '*.svg?raw' {
  const text: string;
  export default text;
}
