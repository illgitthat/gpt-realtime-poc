import { defineConfig } from 'vite'

export default defineConfig({
    define: {
        'import.meta.env.VITE_AZURE_OPENAI_ENDPOINT': JSON.stringify(process.env.VITE_AZURE_OPENAI_ENDPOINT),
        'import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT': JSON.stringify(process.env.VITE_AZURE_OPENAI_DEPLOYMENT),
        'import.meta.env.VITE_AZURE_OPENAI_API_KEY': JSON.stringify(process.env.VITE_AZURE_OPENAI_API_KEY),
    }
})
