import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const versionData = {
  timestamp: Date.now(),
  date: new Date().toISOString()
}

const distDir = path.join(__dirname, '../dist')
const versionFile = path.join(distDir, 'version.json')

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}

// Write version file
fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2))

console.log('Generated version.json:', versionData)
