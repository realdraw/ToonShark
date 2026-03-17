import {describe, expect, it} from 'vitest'
import {extractDir, extractPdfName, formatBytes, sanitizeFolderId, toErrorMessage, toLocalFileUrl} from './index'

describe('extractPdfName', () => {
  it('should extract name from unix path', () => {
    expect(extractPdfName('/Users/beni/comics/my_comic.pdf')).toBe('my_comic')
  })

  it('should extract name from path with .PDF extension (case insensitive)', () => {
    expect(extractPdfName('/tmp/WEBTOON.PDF')).toBe('WEBTOON')
  })

  it('should handle filename only (no directory)', () => {
    expect(extractPdfName('chapter01.pdf')).toBe('chapter01')
  })

  it('should handle path with spaces', () => {
    expect(extractPdfName('/Users/beni/My Comics/episode 1.pdf')).toBe('episode 1')
  })

  it('should handle Korean filename', () => {
    expect(extractPdfName('/tmp/웹툰_1화.pdf')).toBe('웹툰_1화')
  })

  it('should return untitled for empty path', () => {
    expect(extractPdfName('')).toBe('untitled')
  })

  it('should handle filename with multiple dots', () => {
    expect(extractPdfName('/tmp/my.comic.v2.pdf')).toBe('my.comic.v2')
  })

  it('should not strip .pdf from middle of filename', () => {
    expect(extractPdfName('/tmp/pdf_archive.txt')).toBe('pdf_archive.txt')
  })

  it('should handle trailing slash gracefully', () => {
    // split('/').pop() returns '' for trailing slash
    expect(extractPdfName('/tmp/comics/')).toBe('untitled')
  })

  it('should handle Windows-style backslash paths', () => {
    expect(extractPdfName('C:\\Users\\beni\\comic.pdf')).toBe('comic')
  })

  it('should handle mixed separators', () => {
    expect(extractPdfName('C:\\Users/beni\\my_comic.pdf')).toBe('my_comic')
  })

  it('should return filename as-is for non-pdf extension', () => {
    expect(extractPdfName('/tmp/archive.zip')).toBe('archive.zip')
  })

  it('should handle path with only extension', () => {
    expect(extractPdfName('.pdf')).toBe('untitled')
  })
})

describe('formatBytes', () => {
  it('should return "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('should format kilobytes with decimal', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('should format large megabytes', () => {
    expect(formatBytes(52.5 * 1024 * 1024)).toBe('52.5 MB')
  })

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })

  it('should cap at GB for very large values', () => {
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })

  it('should handle 1 byte', () => {
    expect(formatBytes(1)).toBe('1 B')
  })

  it('should handle values just below KB boundary', () => {
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('should handle TB-scale values as GB', () => {
    // 1 TB = 1024 GB — should still show as GB since that's the max unit
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1024.0 GB')
  })

  it('should handle small fractional values', () => {
    // formatBytes uses log, so fractions < 1 produce negative index → edge case
    // 2 bytes should still work correctly
    expect(formatBytes(2)).toBe('2 B')
  })

  it('should handle exactly 1024 (KB boundary)', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('should return "0 B" for negative values', () => {
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('should return "0 B" for NaN', () => {
    expect(formatBytes(NaN)).toBe('0 B')
  })

  it('should return "0 B" for Infinity', () => {
    expect(formatBytes(Infinity)).toBe('0 B')
  })

  it('should return "0 B" for fractional bytes less than 1', () => {
    expect(formatBytes(0.5)).toBe('0 B')
  })
})

describe('toLocalFileUrl', () => {
  it('should convert macOS/Linux absolute path', () => {
    expect(toLocalFileUrl('/Users/beni/slices/img_001.png'))
      .toBe('local-file:///Users/beni/slices/img_001.png')
  })

  it('should convert Windows backslash path with drive letter', () => {
    expect(toLocalFileUrl('C:\\Users\\tech\\slices\\img_001.png'))
      .toBe('local-file:///C%3A/Users/tech/slices/img_001.png')
  })

  it('should convert Windows forward slash path with drive letter', () => {
    expect(toLocalFileUrl('C:/Users/tech/slices/img_001.png'))
      .toBe('local-file:///C%3A/Users/tech/slices/img_001.png')
  })

  it('should handle lowercase drive letter', () => {
    expect(toLocalFileUrl('d:\\data\\img.png'))
      .toBe('local-file:///d%3A/data/img.png')
  })

  it('should handle Korean characters in path', () => {
    const url = toLocalFileUrl('C:\\Users\\tech\\웹툰\\img_001.png')
    expect(url).toContain('local-file:///')
    expect(url).toContain(encodeURIComponent('웹툰'))
  })

  it('should encode spaces in path', () => {
    expect(toLocalFileUrl('/Users/beni/my slices/img 001.png'))
      .toBe('local-file:///Users/beni/my%20slices/img%20001.png')
  })

  it('should encode # in filename to prevent URL fragment', () => {
    expect(toLocalFileUrl('/Users/beni/chapter#1.png'))
      .toBe('local-file:///Users/beni/chapter%231.png')
  })

  it('should encode ? in filename to prevent URL query', () => {
    expect(toLocalFileUrl('/Users/beni/file?.png'))
      .toBe('local-file:///Users/beni/file%3F.png')
  })
})

describe('sanitizeFolderId', () => {
  it('should keep safe characters unchanged', () => {
    expect(sanitizeFolderId('naver_webtoon')).toBe('naver_webtoon')
  })

  it('should keep hyphens', () => {
    expect(sanitizeFolderId('line-manga')).toBe('line-manga')
  })

  it('should replace spaces with underscores', () => {
    expect(sanitizeFolderId('naver webtoon')).toBe('naver_webtoon')
  })

  it('should replace special characters', () => {
    expect(sanitizeFolderId('naver/webtoon!@#')).toBe('naver_webtoon')
  })

  it('should collapse multiple underscores', () => {
    expect(sanitizeFolderId('a___b')).toBe('a_b')
  })

  it('should trim leading/trailing underscores', () => {
    expect(sanitizeFolderId('_hello_')).toBe('hello')
  })

  it('should handle Korean characters (non-ASCII replaced)', () => {
    expect(sanitizeFolderId('한국')).toBe('unknown')
  })

  it('should handle mixed Korean and ASCII', () => {
    expect(sanitizeFolderId('한국/Korea')).toBe('Korea')
  })

  it('should return "unknown" for empty string', () => {
    expect(sanitizeFolderId('')).toBe('unknown')
  })

  it('should return "unknown" for whitespace-only string', () => {
    expect(sanitizeFolderId('   ')).toBe('unknown')
  })

  it('should return "unknown" for all-special-chars string', () => {
    expect(sanitizeFolderId('!@#$%^&*()')).toBe('unknown')
  })

  it('should truncate IDs longer than 100 characters', () => {
    const longId = 'a'.repeat(150)
    const result = sanitizeFolderId(longId)
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('should trim input whitespace', () => {
    expect(sanitizeFolderId('  hello  ')).toBe('hello')
  })

  it('should handle dots (replaced with underscore)', () => {
    expect(sanitizeFolderId('v2.1')).toBe('v2_1')
  })

  it('should handle path-like input', () => {
    expect(sanitizeFolderId('../../../etc/passwd')).toBe('etc_passwd')
  })
})

describe('toErrorMessage', () => {
  it('should extract message from Error', () => {
    expect(toErrorMessage(new Error('test error'))).toBe('test error')
  })

  it('should convert string to string', () => {
    expect(toErrorMessage('string error')).toBe('string error')
  })

  it('should convert number to string', () => {
    expect(toErrorMessage(42)).toBe('42')
  })

  it('should convert null to string', () => {
    expect(toErrorMessage(null)).toBe('null')
  })

  it('should convert undefined to string', () => {
    expect(toErrorMessage(undefined)).toBe('undefined')
  })

  it('should handle Error subclass', () => {
    expect(toErrorMessage(new TypeError('type err'))).toBe('type err')
  })
})

describe('extractDir', () => {
  it('should extract directory from Unix path', () => {
    expect(extractDir('/Users/beni/data/thumbnail/file.jpg')).toBe('/Users/beni/data/thumbnail')
  })

  it('should extract directory from Windows path', () => {
    expect(extractDir('D:\\data\\export\\kr\\ridi\\thumbnail\\file.jpg')).toBe('D:\\data\\export\\kr\\ridi\\thumbnail')
  })

  it('should handle mixed separators', () => {
    expect(extractDir('D:\\data/export/thumbnail/file.jpg')).toBe('D:\\data/export/thumbnail')
  })

  it('should return path as-is when no separator found', () => {
    expect(extractDir('file.jpg')).toBe('file.jpg')
  })

  it('should handle root-level Unix path', () => {
    expect(extractDir('/file.jpg')).toBe('/file.jpg')
  })
})
