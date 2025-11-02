import restart from 'vite-plugin-restart'
import glsl from 'vite-plugin-glsl'

export default {
  root: 'src/',
  publicDir: '../static/',
  base: './',
  
  server: {
    host: true,
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env)
  },
  
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    
    // Use esbuild instead of terser (faster, no extra dependency)
    minify: 'esbuild',
    
    // Single bundle output
    rollupOptions: {
      output: {
        entryFileNames: 'webgl-hero.js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: undefined
      }
    },
    
    // Target modern browsers
    target: 'es2020',
    
    // File size warning threshold
    chunkSizeWarningLimit: 1000
  },
  
  plugins: [
    restart({ restart: ['../static/**'] }),
    glsl()
  ]
}