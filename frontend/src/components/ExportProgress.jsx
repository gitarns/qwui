import './ExportProgress.css'

function ExportProgress({ status, message, progress }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'fetching':
      case 'converting':
      case 'compressing':
      case 'downloading':
        return '⏳'
      case 'complete':
        return '✓'
      case 'error':
        return '✗'
      default:
        return '⏳'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'complete':
        return '#10b981'
      case 'error':
        return '#ef4444'
      default:
        return '#006bb4'
    }
  }

  return (
    <div className="export-progress" style={{ borderLeftColor: getStatusColor() }}>
      <div className="export-progress-header">
        <span className="export-progress-icon">{getStatusIcon()}</span>
        <span className="export-progress-message">{message}</span>
      </div>
      {status !== 'complete' && status !== 'error' && (
        <div className="export-progress-bar">
          <div
            className="export-progress-fill"
            style={{
              width: `${progress}%`,
              backgroundColor: getStatusColor()
            }}
          />
        </div>
      )}
    </div>
  )
}

export default ExportProgress
