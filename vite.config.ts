import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed to GitHub Pages at https://<account>.github.io/clasmentors/
export default defineConfig({
  base: '/clasmentors/',
  plugins: [react()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      // transformers.js imports ONNX Runtime's WebGPU build, whose WASM binary is ~24 MB.
      // Matching runs on the CPU, and the CPU-only build's binary is ~13 MB.
      'onnxruntime-web/webgpu': 'onnxruntime-web/wasm',
    },
  },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
})
