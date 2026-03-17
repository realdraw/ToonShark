#!/usr/bin/env node

/**
 * Release helper — bumps version, commits, tags, and pushes.
 *
 * Usage:
 *   npm run release          # tag current package.json version
 *   npm run release:patch    # 0.1.0 → 0.1.1
 *   npm run release:minor    # 0.1.0 → 0.2.0
 *   npm run release:major    # 0.1.0 → 1.0.0
 */

import {readFileSync, writeFileSync} from 'fs'
import {execSync} from 'child_process'
import {dirname, resolve} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '..', 'package.json')
const lockPath = resolve(__dirname, '..', 'package-lock.json')

const bumpType = process.argv[2] // 'patch' | 'minor' | 'major' | undefined

function run(cmd) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: resolve(__dirname, '..') })
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (type) {
    case 'major': return `${major + 1}.0.0`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'patch': return `${major}.${minor}.${patch + 1}`
    default: throw new Error(`Unknown bump type: ${type}`)
  }
}

// 1. Check working tree is clean
try {
  execSync('git diff --quiet && git diff --cached --quiet', { cwd: resolve(__dirname, '..') })
} catch {
  console.error('\nError: Working tree is not clean. Commit or stash changes first.\n')
  process.exit(1)
}

// 2. Read current version
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
let version = pkg.version

// 3. Bump if requested
if (bumpType) {
  version = bumpVersion(version, bumpType)
  console.log(`\nBumping version: ${pkg.version} → ${version}\n`)

  // Update package.json
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  // Update package-lock.json
  const lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
  lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')

  // Commit version bump
  run('git add package.json package-lock.json')
  run(`git commit -m "chore: bump version to ${version}"`)
} else {
  console.log(`\nReleasing current version: ${version}\n`)
}

const tag = `v${version}`

// 4. Check tag doesn't already exist
try {
  execSync(`git rev-parse ${tag}`, { stdio: 'ignore', cwd: resolve(__dirname, '..') })
  console.error(`\nError: Tag ${tag} already exists.\n`)
  process.exit(1)
} catch {
  // Tag doesn't exist — good
}

// 5. Create tag and push
run(`git tag ${tag}`)
run('git push origin main')
run(`git push origin ${tag}`)

console.log(`\n✅ Released ${tag}`)
console.log(`   → https://github.com/realdraw/ToonShark/actions`)
console.log(`   → https://github.com/realdraw/ToonShark/releases\n`)
