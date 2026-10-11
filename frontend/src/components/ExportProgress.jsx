import './ExportProgress.css'
import { IconHourglass, IconCheck, IconX } from './Icon'

function ExportProgress({ status, message, progress }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'complete':
        return <IconCheck />
      case 'error':
        return <IconX />
      // fetching, converting, compressing and downloading all read as in-progress
      default:
        return <IconHourglass />
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'complete':
        return 'var(--color-success)'
      case 'error':
        return 'var(--color-danger)'
      default:
        return 'var(--color-primary)'
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
