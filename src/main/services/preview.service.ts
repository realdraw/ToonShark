import {writeFileSync} from 'fs'
import {join} from 'path'
import type {DevicePreset, SliceFileInfo} from '@shared/types'
import {PREVIEW_TEMPLATE} from './preview.template'

type PreviewOptions = {
  imageGap: number
  defaultDeviceId: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export class PreviewService {

  generatePreviewHtml(
    files: SliceFileInfo[],
    devices: DevicePreset[],
    options: PreviewOptions
  ): string {
    if (devices.length === 0) {
      throw new Error('At least one device preset is required for preview generation')
    }
    const defaultDevice = devices.find((d) => d.id === options.defaultDeviceId) ?? devices[0]
    const safeImageGap = Math.max(0, Math.min(500, options.imageGap || 0))

    const deviceOptions = devices
      .map(
        (d) =>
          `<option value="${escapeHtml(d.id)}" data-width="${d.cssViewportWidth}" data-height="${d.cssViewportHeight}" ${d.id === defaultDevice.id ? 'selected' : ''}>${escapeHtml(d.name)} (${d.cssViewportWidth}x${d.cssViewportHeight})</option>`
      )
      .join('\n            ')

    const imageElements = files
      .map(
        (f) =>
          `        <img src="../slices/${encodeURIComponent(f.name)}" alt="${escapeHtml(f.name)}" style="width:100%;display:block;margin-bottom:${safeImageGap}px;" />`
      )
      .join('\n')

    return PREVIEW_TEMPLATE
      .replace('{{DEVICE_OPTIONS}}', deviceOptions)
      .replace('{{DEFAULT_WIDTH}}', String(defaultDevice.cssViewportWidth))
      .replace('{{DEFAULT_HEIGHT}}', String(defaultDevice.cssViewportHeight))
      .replace('{{IMAGE_GAP}}', String(safeImageGap))
      .replace('{{IMAGE_ELEMENTS}}', imageElements)
  }

  writePreviewFiles(
    versionPath: string,
    files: SliceFileInfo[],
    devices: DevicePreset[],
    options: PreviewOptions
  ): void {
    const previewDir = join(versionPath, 'preview')

    const html = this.generatePreviewHtml(files, devices, options)
    writeFileSync(join(previewDir, 'index.html'), html)

    writeFileSync(
      join(previewDir, 'preview-data.json'),
      JSON.stringify({ files, devices, settings: options }, null, 2)
    )
  }
}
