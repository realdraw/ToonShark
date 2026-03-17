import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {FileService} from './file.service'
import {JobRepository} from './job-repository'
import {mkdirSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import type {JobMeta} from '@shared/types'

/**
 * PDF 폴더 해상도(resolution) 시나리오 테스트
 *
 * 기존: jobs/{prefix}/ (prefix 기반)
 * 변경: jobs/{pdfName}/ (PDF 파일명 기반)
 */

function createPdf(path: string, content: string): void {
  writeFileSync(path, content)
}

function createPdfWithSize(path: string, sizeBytes: number): void {
  writeFileSync(path, Buffer.alloc(sizeBytes, 'x'))
}

function setupJobFolder(
  baseDir: string,
  folderName: string,
  versionId: string,
  sourcePdfPath: string,
  sourcePdfContent?: Buffer
): JobMeta {
  const jobDir = join(baseDir, 'jobs', folderName)
  const versionPath = join(jobDir, versionId)
  const sourceDir = join(jobDir, 'source')

  mkdirSync(join(versionPath, 'slices'), { recursive: true })
  mkdirSync(sourceDir, { recursive: true })

  // Copy PDF to source/
  if (sourcePdfContent) {
    const pdfBasename = sourcePdfPath.split('/').pop()!
    writeFileSync(join(sourceDir, pdfBasename), sourcePdfContent)
  }

  const meta: JobMeta = {
    id: `${folderName}_${versionId}`,
    title: folderName,
    prefix: 'some_prefix',
    sourcePdfPath,
    copiedPdfPath: join(sourceDir, sourcePdfPath.split('/').pop()!),
    createdAt: new Date().toISOString(),
    mode: 'fixed',
    pageCount: 1,
    sliceCount: 1,
    versionPath,
    options: { sliceHeight: 1000 },
    files: []
  }

  writeFileSync(join(versionPath, 'meta.json'), JSON.stringify(meta, null, 2))
  return meta
}

describe('PDF Folder Resolution', () => {
  let testDir: string
  let fileService: FileService
  let repo: JobRepository

  beforeEach(() => {
    testDir = join(tmpdir(), `pdf_folder_test_${Date.now()}`)
    mkdirSync(join(testDir, 'jobs'), { recursive: true })
    fileService = new FileService()
    repo = new JobRepository(testDir, fileService)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('sanitizePdfFolderName', () => {
    // S6. 특수문자 파일명
    it('S6: should sanitize PDF path to folder name', () => {
      expect(fileService.sanitizePdfFolderName('/path/to/episode_01.pdf')).toBe('episode_01')
      expect(fileService.sanitizePdfFolderName('/path/to/My Webtoon!.pdf')).toBe('My_Webtoon')
      expect(fileService.sanitizePdfFolderName('C:\\Users\\test\\웹툰_1화.pdf')).toBe('웹툰_1화')
    })

    // E1. sanitize 후 빈 문자열
    it('E1: should fallback to "untitled" when name becomes empty after sanitize', () => {
      expect(fileService.sanitizePdfFolderName('/path/to/.pdf')).toBe('untitled')
      expect(fileService.sanitizePdfFolderName('/path/to/!!!.pdf')).toBe('untitled')
    })

    // E5. 매우 긴 파일명
    it('E5: should truncate very long filenames', () => {
      const longName = 'a'.repeat(300) + '.pdf'
      const result = fileService.sanitizePdfFolderName(`/path/to/${longName}`)
      expect(result.length).toBeLessThanOrEqual(100)
    })

    // E6. 한글/CJK 파일명
    it('E6: should preserve Korean/CJK characters', () => {
      expect(fileService.sanitizePdfFolderName('/path/to/웹툰_에피소드.pdf')).toBe('웹툰_에피소드')
      expect(fileService.sanitizePdfFolderName('/path/to/漫画_第1話.pdf')).toBe('漫画_第1話')
    })
  })

  describe('comparePdfFiles', () => {
    it('should return true for identical files', async () => {
      const content = Buffer.alloc(1024, 'hello')
      const pathA = join(testDir, 'a.pdf')
      const pathB = join(testDir, 'b.pdf')
      writeFileSync(pathA, content)
      writeFileSync(pathB, content)

      expect(await fileService.comparePdfFiles(pathA, pathB)).toBe(true)
    })

    it('should return false for files with different sizes', async () => {
      const pathA = join(testDir, 'a.pdf')
      const pathB = join(testDir, 'b.pdf')
      writeFileSync(pathA, Buffer.alloc(1024, 'x'))
      writeFileSync(pathB, Buffer.alloc(2048, 'x'))

      expect(await fileService.comparePdfFiles(pathA, pathB)).toBe(false)
    })

    // S7. 크기 같고 내용 다른 PDF
    it('S7: should return false for same-size files with different content', async () => {
      const pathA = join(testDir, 'a.pdf')
      const pathB = join(testDir, 'b.pdf')
      const bufA = Buffer.alloc(1024, 'a')
      const bufB = Buffer.alloc(1024, 'b')
      writeFileSync(pathA, bufA)
      writeFileSync(pathB, bufB)

      expect(await fileService.comparePdfFiles(pathA, pathB)).toBe(false)
    })

    it('should return false when one file does not exist', async () => {
      const pathA = join(testDir, 'a.pdf')
      writeFileSync(pathA, 'content')

      expect(await fileService.comparePdfFiles(pathA, join(testDir, 'nonexistent.pdf'))).toBe(false)
    })

    it('should handle large files by comparing partial hash (head + tail)', async () => {
      // Create two large files that differ only in the tail
      const size = 256 * 1024 // 256KB
      const pathA = join(testDir, 'a.pdf')
      const pathB = join(testDir, 'b.pdf')
      const bufA = Buffer.alloc(size, 'x')
      const bufB = Buffer.alloc(size, 'x')
      bufB[size - 1] = 0 // differ in last byte

      writeFileSync(pathA, bufA)
      writeFileSync(pathB, bufB)

      expect(await fileService.comparePdfFiles(pathA, pathB)).toBe(false)
    })
  })

  describe('resolveFolderForPdf', () => {
    // S1. 기본 — PDF 파일명으로 폴더 생성
    it('S1: should return PDF filename as folder name when no existing folder', async () => {
      const pdfPath = join(testDir, 'episode_01.pdf')
      createPdf(pdfPath, 'pdf-content')

      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfPath),
        pdfPath
      )
      expect(folderName).toBe('episode_01')
    })

    // S2. 같은 PDF 재실행 — 폴더 재사용
    it('S2: should reuse folder for the same PDF', async () => {
      const pdfPath = join(testDir, 'episode_01.pdf')
      const pdfContent = Buffer.from('same-pdf-content')
      createPdf(pdfPath, pdfContent.toString())

      // Setup existing job with the same PDF
      setupJobFolder(testDir, 'episode_01', 'v1', pdfPath, pdfContent)

      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfPath),
        pdfPath
      )
      expect(folderName).toBe('episode_01')
    })

    // S3. 같은 PDF, 다른 prefix — 같은 폴더
    it('S3: should use same folder regardless of prefix (prefix only affects filenames)', async () => {
      const pdfPath = join(testDir, 'episode_01.pdf')
      const pdfContent = Buffer.from('same-pdf-content')
      createPdf(pdfPath, pdfContent.toString())

      // Existing job was created with prefix 'black'
      setupJobFolder(testDir, 'episode_01', 'v1', pdfPath, pdfContent)

      // New request with prefix 'white' — should still resolve to same folder
      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfPath),
        pdfPath
      )
      expect(folderName).toBe('episode_01')
    })

    // S4. 같은 파일명, 다른 PDF — suffix 분리
    it('S4: should create suffixed folder for different PDF with same filename', async () => {
      // First PDF
      const pdfPathA = join(testDir, 'subdir_a', 'episode_01.pdf')
      mkdirSync(join(testDir, 'subdir_a'), { recursive: true })
      const contentA = Buffer.from('content-A-different')
      writeFileSync(pdfPathA, contentA)

      // Existing job for first PDF
      setupJobFolder(testDir, 'episode_01', 'v1', pdfPathA, contentA)

      // Second PDF — same filename, different content
      const pdfPathB = join(testDir, 'subdir_b', 'episode_01.pdf')
      mkdirSync(join(testDir, 'subdir_b'), { recursive: true })
      const contentB = Buffer.from('content-B-different')
      writeFileSync(pdfPathB, contentB)

      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfPathB),
        pdfPathB
      )
      expect(folderName).toBe('episode_01_2')
    })

    // S5. 같은 파일명, 같은 내용, 다른 경로 — 폴더 재사용
    it('S5: should reuse folder for same content PDF from different path', async () => {
      const content = Buffer.from('identical-pdf-content')

      // Original PDF and job
      const pdfPathA = join(testDir, 'downloads', 'episode_01.pdf')
      mkdirSync(join(testDir, 'downloads'), { recursive: true })
      writeFileSync(pdfPathA, content)
      setupJobFolder(testDir, 'episode_01', 'v1', pdfPathA, content)

      // Same PDF from different path
      const pdfPathB = join(testDir, 'desktop', 'episode_01.pdf')
      mkdirSync(join(testDir, 'desktop'), { recursive: true })
      writeFileSync(pdfPathB, content)

      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfPathB),
        pdfPathB
      )
      expect(folderName).toBe('episode_01')
    })

    // E2. suffix 연쇄 충돌
    it('E2: should handle cascading suffix conflicts', async () => {
      // Three different PDFs with same filename
      const contentA = Buffer.from('content-A')
      const contentB = Buffer.from('content-BB')
      const contentC = Buffer.from('content-CCC')

      const pdfA = join(testDir, 'a', 'ep.pdf')
      mkdirSync(join(testDir, 'a'), { recursive: true })
      writeFileSync(pdfA, contentA)

      const pdfB = join(testDir, 'b', 'ep.pdf')
      mkdirSync(join(testDir, 'b'), { recursive: true })
      writeFileSync(pdfB, contentB)

      const pdfC = join(testDir, 'c', 'ep.pdf')
      mkdirSync(join(testDir, 'c'), { recursive: true })
      writeFileSync(pdfC, contentC)

      // First PDF occupies ep/
      setupJobFolder(testDir, 'ep', 'v1', pdfA, contentA)
      // Second PDF occupies ep_2/
      setupJobFolder(testDir, 'ep_2', 'v1', pdfB, contentB)

      // Third PDF should get ep_3
      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfC),
        pdfC
      )
      expect(folderName).toBe('ep_3')
    })

    // E3. 기존 source/ 폴더의 PDF가 삭제된 경우
    it('E3: should reuse folder when source PDF was manually deleted', async () => {
      const pdfPath = join(testDir, 'episode_01.pdf')
      writeFileSync(pdfPath, 'pdf-content')

      // Setup job folder WITHOUT copying PDF to source/
      const jobDir = join(testDir, 'jobs', 'episode_01')
      const versionPath = join(jobDir, 'v1')
      mkdirSync(join(versionPath, 'slices'), { recursive: true })
      mkdirSync(join(jobDir, 'source'), { recursive: true })
      // source/ exists but is empty (PDF was deleted)

      const meta: JobMeta = {
        id: 'ep1_v1', title: 'episode_01', prefix: 'test',
        sourcePdfPath: pdfPath, copiedPdfPath: join(jobDir, 'source', 'episode_01.pdf'),
        createdAt: new Date().toISOString(), mode: 'fixed',
        pageCount: 1, sliceCount: 1, versionPath, options: {}, files: []
      }
      writeFileSync(join(versionPath, 'meta.json'), JSON.stringify(meta))

      // Should reuse folder (source PDF missing = treat as available)
      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfPath),
        pdfPath
      )
      expect(folderName).toBe('episode_01')
    })

    // E4. 원본 이름이 suffix 패턴과 겹침
    it('E4: should handle PDF filename that looks like a suffix pattern', async () => {
      const contentOriginal = Buffer.from('original-content')
      const contentNew = Buffer.from('new-different-content')

      // A PDF named "episode_01_2.pdf" already has a job
      const pdfOriginal = join(testDir, 'orig', 'episode_01_2.pdf')
      mkdirSync(join(testDir, 'orig'), { recursive: true })
      writeFileSync(pdfOriginal, contentOriginal)
      setupJobFolder(testDir, 'episode_01_2', 'v1', pdfOriginal, contentOriginal)

      // A DIFFERENT PDF also named "episode_01_2.pdf"
      const pdfNew = join(testDir, 'new', 'episode_01_2.pdf')
      mkdirSync(join(testDir, 'new'), { recursive: true })
      writeFileSync(pdfNew, contentNew)

      const folderName = await repo.resolveFolderForPdf(
        fileService.sanitizePdfFolderName(pdfNew),
        pdfNew
      )
      expect(folderName).toBe('episode_01_2_2')
    })
  })
})
