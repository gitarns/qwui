import './ExportCSVModal.css'

function ExportCSVModal({
  onConfirm,
  onClose,
  totalHits,
  exportCount,
  maxExportLimit,
  estimatedCompressedSize,
  estimatedUncompressedSize,
  estimatedDownloadSize,
  compressionRatio
}) {
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const isLimitedExport = totalHits > maxExportLimit

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export to CSV</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {isLimitedExport && (
            <div className="export-warning">
              <div className="warning-icon">⚠️</div>
              <div className="warning-content">
                <strong>Quickwit Export Limit</strong>
                <p>Maximum {maxExportLimit.toLocaleString()} documents can be exported at once</p>
              </div>
            </div>
          )}

          <div className="export-info-grid">
            <div className="export-info-item">
              <div className="info-label">Total Hits</div>
              <div className="info-value">{totalHits.toLocaleString()}</div>
            </div>
            <div className="export-info-item">
              <div className="info-label">Will Export</div>
              <div className="info-value export-count">{exportCount.toLocaleString()}</div>
            </div>
          </div>

          <div className="export-size-info">
            <div className="size-row">
              <span className="size-label">Estimated final compressed file:</span>
              <span className="size-value compressed">{formatSize(estimatedCompressedSize)}</span>
            </div>
            <div className="size-row secondary">
              <span className="size-label">Estimated  CSV raw size:</span>
              <span className="size-value">{formatSize(estimatedUncompressedSize)}</span>
            </div>
            <div className="size-row secondary">
              <span className="size-label">Estimated data from Quickwit (JSON):</span>
              <span className="size-value download-size">{formatSize(estimatedDownloadSize)}</span>
            </div>
          </div>

          <div className="export-note">
            <strong>Note:</strong> The file will be saved as a zip-compressed CSV (.csv.zip)
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportCSVModal
