const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const builtAt = new Date().toISOString()

let commit = ''

try {
  commit = execSync('git rev-parse --short HEAD', {
    cwd: path.resolve(rootDir, '..'),
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim()
} catch {
  commit = ''
}

const version = commit ? `${builtAt}__${commit}` : builtAt

const publicDir = path.join(rootDir, 'public')
const generatedDir = path.join(rootDir, 'src', 'generated')

fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(generatedDir, { recursive: true })

const appVersionJson = JSON.stringify(
  {
    version,
    built_at: builtAt,
    commit,
  },
  null,
  2,
) + '\n'

fs.writeFileSync(path.join(publicDir, 'app-version.json'), appVersionJson)

const publicAssetsDir = path.join(publicDir, 'assets')
fs.mkdirSync(publicAssetsDir, { recursive: true })
fs.writeFileSync(path.join(publicAssetsDir, 'app-version.json'), appVersionJson)

fs.writeFileSync(
  path.join(generatedDir, 'appVersion.ts'),
  [
    `export const APP_VERSION = ${JSON.stringify(version)}`,
    `export const APP_BUILT_AT = ${JSON.stringify(builtAt)}`,
    `export const APP_COMMIT = ${JSON.stringify(commit)}`,
    '',
  ].join('\n'),
)

console.log(`App version: ${version}`)
