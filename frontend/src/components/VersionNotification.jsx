import './VersionNotification.css'

function VersionNotification({ show, onReload }) {
  if (!show) return null

  return (
    <div className="version-notification">
      <div className="version-notification-content">
        <span className="version-notification-message">
          ✨ A new version is available
        </span>
        <button className="version-notification-btn" onClick={onReload}>
          Reload
        </button>
      </div>
    </div>
  )
}

export default VersionNotification
